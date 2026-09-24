/**
 * Selection policy: which candidate tracks may appear in a puzzle for a given theme.
 * Language, thematic homonym guards, authenticity (shared rules), anime/Japanese affinity and
 * release-year windows. Pure functions: they never mutate the track.
 */
import type { TrackLike, YearRange } from '../types.ts';
import { splitArtistNames } from '../../shared/musicKeywords.ts';
import { toCrosswordAnswer } from '../../shared/musicIdentity.ts';
import { isAuthenticMetadata } from './authenticityRules.ts';
import { resolveTrackLanguage } from '../db/languageClassifier.ts';
import { themeById } from '../../shared/themes.ts';

/**
 * Checks if a genre or query prompt specifically targets authentic Anime OP/ED themes.
 */
export function isAnimeTarget(genre = '', prompt = '') {
  const combined = `${genre || ''} ${prompt || ''}`.toLowerCase();
  return /\b(anime|animes|anime opening|anime openings|anime ending|anime endings|anime ost|anime themes?)\b/i.test(combined);
}

/**
 * Resolves whether an anime query targets Openings ('OP'), Endings ('ED'), or both (null).
 */
export function getAnimeThemeType(genre = '', prompt = '') {
  const combined = `${genre || ''} ${prompt || ''}`.toLowerCase();
  const hasOp = /\b(openings?|op)\b/i.test(combined);
  const hasEd = /\b(endings?|ed)\b/i.test(combined);
  if (hasOp && !hasEd) return 'OP';
  if (hasEd && !hasOp) return 'ED';
  return null;
}

// Latin letters plus typographic quotes, dashes and the ellipsis (U+2010-U+2027): "Don’t Start Now"
const LATIN_TEXT = /^[\u0020-\u024F\u2010-\u2027\s\d]*$/u;
const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

// Reject foreign animated soundtrack dubs and localized karaoke/sing-along tracks across all genres
// e.g. "Soda Pop (version française)", "How Far I'll Go (Spanish Version)", "Sing-Along"
const FOREIGN_DUB_MARKERS = /\b(?:version\s+française|french\s+version|spanish\s+version|versión\b|portuguese\s+version|german\s+version|italian\s+version|tagalog\s+version|sing-along|karaoke)\b/i;
// Tracks categorized under explicit foreign language genres
const FOREIGN_GENRES = /\b(pop\s+latino|música\s+mexicana|urbano\s+latino|latin|música\s+tropical|mpb|sertanejo|french\s+pop|german\s+pop|deutschrap|chanson|russian|arabic|punjabi|bollywood|c-pop|cantopop|mandopop)\b/i;
// Common non-English stopwords (Spanish/Portuguese/French/German/Italian/Dutch)
const FOREIGN_MARKERS = /\b(despacito|bailando|danza|gasolina|fonsi|amor|vida|corazón|fiesta|feliz|navidad|noche|como|mais|pra|você|sen|ben|bir|del|los|las|por|para|una|uno|dans|avec|pour|des|une|und|nicht|ist|dass|les|le|la|el|aux?|sur|sans|nous|vous|sont|mon|ma|mes|ton|ta|tes|son|sa|ses|qui|que|quoi|dont|où|mais|ou|et|donc|der|die|das|dem|den|ein|eine|einem|einen|einer|eines|mit|auf|für|von|zu|aus|durch|nach|bei|seit|con|sin|sobre|gli|della|delle|dello|dei|degli|nel|nella|je|tu|il|elle|ils|elles|un'|non|più|tutto|tutti|tutta|se|yo|ella|ellos|ellas|pero|más|muy|está|están|hacer|tiempo|año|años)\b/i;
const CLASSICAL_MARKERS = /\b(symphonie|symphony|concerto|sonata|opus|\bop\.\s*\d+|bwv\s*\d+|larghetto|allegro|adagio|andante|presto|philharmonic|orchester|orchestra|chœur|chor\b)\b/i;
const KIDS_MARKERS = /\b(nursery\s+rhymes?|lullaby|cocomelon|baby\s+songs?|toddler\s+songs?|kids\s+songs?|chansons\s+pour\s+enfants)\b/i;

/** The genre and prompt as one lower-case string, the input of every context rule. */
function contextOf(genre: unknown, prompt: unknown): string {
  return `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
}

/**
 * Catalog languages (en/ja/ko) a theme may use: the theme's own list for a theme id,
 * otherwise Korean for K-pop prompts, Japanese for Japanese/anime prompts, and English for
 * everything else. (A named artist is served in every language: see buildQueryPlan.)
 */
export function allowedLanguagesForContext(genre = 'all', prompt = ''): string[] {
  const theme = typeof genre === 'string' ? themeById(genre) : undefined;
  if (theme && theme.id !== 'all') return [...theme.languages];
  const context = contextOf(genre, prompt);
  if (/\b(kpop|k-pop|korean)\b/i.test(context)) return ['ko'];
  if (/\b(anime|japanese|japan|city\s*pop|j-pop|jpop|j-rock|jrock)\b/i.test(context)) return ['ja'];
  return ['en'];
}

/**
 * Language policy for one request: English for most themes; Japanese and Korean only for themes
 * and prompts that ask for them (anime, J-pop, city pop, K-pop) or an explicit language filter.
 * Everything that depends only on the request is resolved once; each check is per track.
 */
export function createLanguagePolicy(genre = 'all', prompt = '', { languages = null }: { languages?: readonly string[] | null } = {}): (track: TrackLike) => boolean {
  const context = contextOf(genre, prompt);
  const allowed = Array.isArray(languages) && languages.length > 0 ? languages : allowedLanguagesForContext(genre, prompt);
  const englishOnly = allowed.length === 1 && allowed[0] === 'en';
  // Classical movements and children's music only belong in puzzles that ask for them
  const allowsClassical = /\b(classical|baroque|orchestra|symphon|opera|choir|choral)\b/i.test(context);
  const allowsKids = /\b(kids?|children|nursery|lullab)\b/i.test(context);
  const isOffTheme = (title: string, artist: string): boolean =>
    (!allowsClassical && (CLASSICAL_MARKERS.test(title) || CLASSICAL_MARKERS.test(artist))) ||
    (!allowsKids && (KIDS_MARKERS.test(title) || KIDS_MARKERS.test(artist)));

  return (track) => {
    // Anime OP/ED tracks from the dedicated anime catalog are always permitted
    if (track?.isAnimeOped) return true;

    const title = String(track?.title || '');
    const artist = String(track?.artist || '');
    if (FOREIGN_DUB_MARKERS.test(title)) return false;

    // Catalog rows carry a classified language (artist vote + ELD): trust it instead of the
    // stopword heuristics below, which reject English titles like "Viva La Vida" or "Ma Belle".
    // Live-provider candidates are classified from their title and artist the same way.
    const hasCatalogLanguage = typeof track?.language === 'string' && Boolean(track.language);
    const language = hasCatalogLanguage ? track.language : resolveTrackLanguage({ title, artist });
    if (!allowed.includes(language)) return false;
    // The classifier decides titles of 3+ words; the heuristics below are for 1-2 word titles
    // ("Despacito"), which are too short for it. Stopwords like "die" or "son" are English words too.
    if (hasCatalogLanguage || !englishOnly || wordCount(title) >= 3) return !isOffTheme(title, artist);

    const trackGenre = String(track?.selection?.genre || track?.genre || '').toLowerCase();
    if (FOREIGN_GENRES.test(trackGenre)) return false;
    // Non-Latin alphabets (Cyrillic, Greek, Arabic, Kanji, Hiragana, Hangul, Thai, etc.)
    if (!LATIN_TEXT.test(title) || !LATIN_TEXT.test(artist)) return false;
    if (FOREIGN_MARKERS.test(title) || FOREIGN_MARKERS.test(artist)) return false;
    return !isOffTheme(title, artist);
  };
}

export function isLanguagePermitted(track: TrackLike, genre = 'all', prompt = '', options: { languages?: readonly string[] | null } = {}): boolean {
  return createLanguagePolicy(genre, prompt, options)(track);
}

/** A candidate's text fields, prepared once for every thematic rule. */
interface TrackText {
  track: TrackLike;
  artist: string;
  title: string;
  lowerArtist: string;
  lowerTitle: string;
  candidateGenre: string;
  /** Title, artist and album, lower-cased except the album (as the rules always matched them). */
  titleArtistAlbum: string;
}

function trackText(track: TrackLike): TrackText {
  const artist = String(track?.artist || '').trim();
  const title = String(track?.title || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();
  return {
    track,
    artist,
    title,
    lowerArtist,
    lowerTitle,
    candidateGenre: String(track?.selection?.genre || track?.genre || '').toLowerCase(),
    titleArtistAlbum: `${lowerTitle} ${lowerArtist} ${track?.album || ''}`,
  };
}

const HAS_JAPANESE_SCRIPT = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/;
const ANIME_AFFILIATION = /\b(ost|opening|ending|theme|tv\s*size|soundtrack|version\s*tv|j-rock|j-pop|frieren|naruto|kenshin|bleach|one\s*piece|dragon\s*ball|attack\s*on\s*titan|shingeki|jujutsu|demon\s*slayer|kimetsu|bocchi|evangelion|dandadan)\b/i;
// Deezer artist 147485 is the Italian hardcore techno producer "AniMe"
const HARDCORE_ANIME_ARTIST_ID = '147485';

/** A homonym guard: applies when the request context matches, rejects the tracks it describes. */
interface ThematicRule {
  appliesTo: RegExp;
  rejects: (text: TrackText) => boolean;
}

/**
 * Homonym and keyword-collision guards for cultural/regional or compound genre themes, e.g.
 * "City Pop" must not bring Iggy Pop - Kill City. Each former branch is one row; the cultural
 * guards depend on the culture named in the prompt and are built per request.
 */
const THEMATIC_RULES: readonly ThematicRule[] = [
  {
    // "City Pop": "Pop" in the artist name and "City" in the title (Iggy Pop - Kill City)
    appliesTo: /\bcity\s*pop\b/i,
    rejects: ({ lowerArtist, lowerTitle }) =>
      /\bpop\b/i.test(lowerArtist) && !/\b(japanese|city|j-pop)\b/i.test(lowerArtist) &&
      /\b(city|kill city|motor city|sin city|inner city)\b/i.test(lowerTitle),
  },
  {
    // Gaming: the rapper The Game and "gamin" stems
    appliesTo: /\b(gaming|video\s*games?)\b/i,
    rejects: ({ lowerArtist, lowerTitle }) => /^(the\s+)?game$/i.test(lowerArtist) || /\bgamin(e|s)?\b/i.test(`${lowerArtist} ${lowerTitle}`),
  },
  {
    // Cinematic: songs merely titled "Movie(s)"
    appliesTo: /\b(cinematic|movie\s+ost|film\s+score)\b/i,
    rejects: ({ track, lowerTitle, candidateGenre }) =>
      /^(the\s+)?movies?$/i.test(lowerTitle) && !/\b(soundtrack|score|theme|original|motion\s+picture)\b/i.test(`${track?.album || ''} ${candidateGenre}`),
  },
  {
    // EDM: artists and titles that only contain "dance"/"electro"
    appliesTo: /\b(edm|electro|dance)\b/i,
    rejects: ({ lowerArtist, lowerTitle }) =>
      /^(édith\s+piaf|edith\s+piaf|yo\s+la\s+tengo)\b/i.test(lowerArtist) ||
      /\bdance\s+gavin\s+dance\b/i.test(lowerArtist) || /\bdance\s+hall\s+crashers\b/i.test(lowerArtist) ||
      /\bprivate\s+dancer\b/i.test(lowerTitle),
  },
  {
    // Pop punk: Daft Punk
    appliesTo: /\b(pop-?punk|punk\s+rock)\b/i,
    rejects: ({ lowerArtist }) => /\bdaft\s+punk\b/i.test(lowerArtist),
  },
  {
    appliesTo: /\banime\b/i,
    rejects: rejectsForAnime,
  },
];

/** Anime: the hardcore DJ "AniMe", "anim*" stems, storefront leakage and Western animation. */
function rejectsForAnime({ track, artist, title, lowerArtist, lowerTitle, candidateGenre, titleArtistAlbum }: TrackText): boolean {
  if (String(track?.providerArtistId) === HARDCORE_ANIME_ARTIST_ID || String(track?.artistId) === HARDCORE_ANIME_ARTIST_ID) return true;
  if (Array.isArray(track?.contributorArtistIds) && track.contributorArtistIds.includes(HARDCORE_ANIME_ARTIST_ID)) return true;
  if (splitArtistNames(artist).some(name => /^(dj\s+)?anime$/i.test(name.toLowerCase().trim()))) return true;
  if (/^(dj\s+)?anime$/i.test(lowerArtist) || /^anime$/i.test(lowerTitle)) return true;
  if (toCrosswordAnswer(artist) === 'ANIME') return true;
  if (/\b(official\s+dominator|ground\s+zero\s+\d+|toxicator\s+\d+|hardcore|anthem|masters\s+of\s+hardcore|traxtorm|thunderdome|aftermath|break\s+your\s+mind)\b/i.test(titleArtistAlbum)) return true;

  const hasAnimeAffiliation = HAS_JAPANESE_SCRIPT.test(title) || HAS_JAPANESE_SCRIPT.test(artist) || ANIME_AFFILIATION.test(titleArtistAlbum);
  if (!hasAnimeAffiliation && /\b(animals?|animais|animosity|animate|animated|animation|animatrix|anima)\b/i.test(`${lowerArtist} ${lowerTitle}`)) return true;
  // Storefront chart leakage (K-pop charting on Apple Music JP)
  if (candidateGenre && /\b(k-?pop|korean\s+hip-?hop|country|latin)\b/i.test(candidateGenre)) return true;
  if (/\b(disney|pixar|dreamworks|illumination|moana|frozen|encanto|lion\s*king|aladdin|beauty\s+and\s+the\s+beast|little\s+mermaid|tangled|coco|zootopia|shrek|toy\s*story)\b/i.test(titleArtistAlbum)) return true;
  if (/^anime\s+(theme|song|ost|music)$/i.test(lowerTitle)) return true;
  // Non-Japanese television casts and Latin pop without anime affiliation
  return !hasAnimeAffiliation && (/\b(empire\s+cast|glee\s+cast|nashville\s+cast|dizzy\s+dros|sandoval)\b/i.test(lowerArtist) || /\b(sabía|sabia)\b/i.test(lowerTitle));
}

/**
 * Cultural keyword homonyms for a prompt naming a culture ("Japanese City Pop", "French House"):
 * Western acts named "The [Culture] [Noun]" or "[Culture] [Name]" (The Japanese House, French
 * Montana), also as a featured artist, and novelty titles ("Japanese Boy").
 */
function culturalRule(context: string): ((text: TrackText) => boolean) | null {
  const match = context.match(/\b(japanese|korean|french|german|italian|spanish|brazilian|irish|british|african|russian|chinese)\b/i);
  if (!match) return null;
  const culture = match[1].toLowerCase();
  const westernHomonym = new RegExp(`(^|\\bthe\\s+|feat\\.?\\s+|ft\\.?\\s+|with\\s+|\\()${culture}\\s+(house|popstars|montana|brigante|band|project|connection|experience|breakfast|brothers|boys|girls)\\b`, 'i');
  const noveltyTitle = new RegExp(`^${culture}\\s+(boy|girl|porn|breakfast|girl\\s+remix)\\b|\\b${culture}\\s+(boy|girl|porn)\\b`, 'i');
  return ({ artist, title }) => westernHomonym.test(artist) || westernHomonym.test(title) || noveltyTitle.test(title);
}

/**
 * Thematic policy for one request: the guards whose context matches are selected once, so each
 * track runs only those (and no regular expression is built per track).
 */
export function createThematicPolicy(genre = 'all', prompt = ''): (track: TrackLike) => boolean {
  const context = contextOf(genre, prompt);
  const rejects = THEMATIC_RULES.filter(rule => rule.appliesTo.test(context)).map(rule => rule.rejects);
  const cultural = culturalRule(context);
  if (cultural) rejects.unshift(cultural);
  if (rejects.length === 0) return () => true;
  return (track) => {
    const text = trackText(track);
    return !rejects.some(reject => reject(text));
  };
}

export function isThematicallyPermitted(track: TrackLike, genre = 'all', prompt = ''): boolean {
  return createThematicPolicy(genre, prompt)(track);
}

/**
 * Rejects low-quality imitation tracks, workout mixes, generic cover/tribute artists,
 * and sped-up/slowed-down audio modifications.
 */
export function isAuthenticTrack(track: TrackLike): boolean {
  return isAuthenticMetadata({
    title: track?.title || track?.display_title || '',
    artist: track?.artist || track?.display_name || '',
    album: track?.album || track?.album_name || track?.collectionName || '',
  });
}

/**
 * Distinguishes authentic anime openings, endings, insert songs, and official anime soundtracks
 * from generic Japanese pop/rock or foreign homonym collisions.
 */
export function isAnimeTrack(track: TrackLike): boolean {
  if (!track) return false;
  if (!isAuthenticTrack(track)) return false;

  const title = String(track.title || track.display_title || '').trim();
  const artist = String(track.artist || track.display_name || '').trim();
  const album = String(track.album || track.album_name || '').trim();
  const lowerTitle = title.toLowerCase();
  const lowerArtist = artist.toLowerCase();
  const lowerAlbum = album.toLowerCase();
  const combined = `${lowerTitle} ${lowerAlbum} ${lowerArtist}`;

  // 1. Strict homonym, foreign language, and Latin collision rejection
  if (/^(?:dj\s+)?anime$/i.test(lowerArtist) || /^anime$/i.test(lowerTitle)) return false;
  if (/^(?:\u00e9dith\s+piaf|ben\s+mazu\u00e9|les\s+goldies)\b/i.test(lowerArtist)) return false;
  if (/\b(?:le\s+coeur\s+nous\s+anime|dessin\s+anim\u00e9)\b/i.test(lowerTitle)) return false;

  // 2. Reject Western pop/rap acts with accidental "anime" stem or collision
  if (/lisa/i.test(lowerArtist)) {
    if (/\b(?:rockstar|lalisa|sa-wa-di-ka|sawadika|money|moonlit|rapunzel|kiss\s*me|new\s*woman)\b/i.test(lowerTitle)) return false;
    if (/megan\s*thee\s*stallion|rosal[ií]a/i.test(lowerTitle)) return false;
  }
  if (/eve/i.test(lowerArtist) && /\b(?:blow\s+ya\s+mind|who'?s\s+that\s+girl|ruff\s+ryders|gangsta\s+lovin)\b/i.test(lowerTitle)) return false;

  // 3. Reject non-anime Latin/English stems (animal, animals, animosity, etc.)
  if (/\b(?:animals?|animais|animosity|animate|animated|animation|animatrix|anima)\b/i.test(`${lowerArtist} ${lowerTitle}`)) {
    if (!/(?:ost|opening|ending|theme|soundtrack|naruto|bleach|one\s*piece|attack\s*on\s*titan)/i.test(combined)) {
      return false;
    }
  }

  // 4. Must have verified anime opening/ending/soundtrack credentials:
  // a) Explicit English anime markers
  const animeEnglishMarkers = /\b(?:tv\s*anime|anime\s*(?:version|ver|ed|op|best|shibari)|tv\s*size|tv\s*version|tv\s*animation|anisong|gekiban)\b/i;
  if (animeEnglishMarkers.test(combined)) return true;

  // b) Generic OST / Opening Theme markers require connection to anime or Japanese production
  const genericThemeMarkers = /\b(?:opening\s*theme|ending\s*theme|theme\s*song|original\s*soundtrack|\bost\b)\b/i;
  if (genericThemeMarkers.test(combined)) {
    // Reject known Western indie/jazz/live score collisions
    if (/^(?:alex\s+g|bouke|jan\s+savitt|krzysztof\s+komeda)\b/i.test(lowerArtist)) return false;
    if (/quaker\s+city\s+jazz|see\s+see\s+rider|pink\s+opaque|opening\s+tomorrow/i.test(combined)) return false;
    if (isJapaneseTrack(track) || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(combined) || /\b(?:anime|manga|tokyo|japan|animation|studio\s*ghibli|ghibli|totoro)\b/i.test(combined)) {
      return true;
    }
  }

  // c) Explicit Japanese kanji/kana anime markers
  const animeJpMarkers = /(?:\u30a2\u30cb\u30e1|\u4e3b\u984c\u6b4c|\u30aa\u30fc\u30d7\u30cb\u30f3\u30b0|\u30a8\u30f3\u30c7\u30a3\u30f3\u30b0|\u5287\u4e2d\u6b4c|\u30b5\u30f3\u30c8\u30e9)/;
  if (animeJpMarkers.test(combined)) return true;

  // d) Explicit anime franchise in title or album
  const animeFranchises = /\b(?:naruto|bleach|one\s*piece|attack\s*on\s*titan|shingeki|demon\s*slayer|kimetsu|jujutsu|evangelion|death\s*note|dragon\s*ball|daima|my\s*hero\s*academia|boku\s*no\s*hero|fullmetal|sword\s*art\s*online|sao|tokyo\s*ghoul|cowboy\s*bebop|frieren|bocchi|chainsaw\s*man|dandadan|oshi\s*no\s*ko|sailor\s*moon|inuyasha|hunter\s*x\s*hunter|haikyuu|spy\s*x\s*family|ghibli|totoro|spirited\s*away|howl'?s\s*moving\s*castle|mononoke|your\s*name|kimi\s*no\s*na\s*wa|suzume|weathering\s*with\s*you|akira|specialz|kaikai\s*kitan|gurenge|zankyosanka|unravel|silhouette|blue\s*bird|colors|go!!!|fairy\s*tail|sakamoto\s*days)\b/i;
  if (animeFranchises.test(combined)) return true;

  // e) Iconic anisong artist performing an authentic anime release
  const anisongSpecialists = /^(?:flow|linked\s*horizon|yoko\s*takahashi|burnout\s*syndromes|claris|aimer|radwimps|ikimonogakari)$/i;
  if (anisongSpecialists.test(lowerArtist)) {
    return true;
  }
  if (lowerArtist === 'lisa') {
    const jpLisaRepertoire = /\b(?:gurenge|homura|crossing\s*field|oath\s*sign|catch\s*the\s*moment|adamas|unlasting|shirushi|rising\s*hope|best\s*day|demon\s*slayer|sword\s*art|sao|fate)\b/i;
    if (jpLisaRepertoire.test(lowerTitle) || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(`${lowerTitle} ${lowerAlbum}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifies that a candidate track represents authentic Japanese music
 * while rejecting western homonyms and foreign collisions.
 */
export function isJapaneseTrack(track: TrackLike): boolean {
  if (!track) return false;
  if (!isAuthenticTrack(track)) return false;

  const title = String(track.title || track.display_title || '').trim();
  const artist = String(track.artist || track.display_name || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Reject Western homonyms and novelty acts
  if (/^(?:the\s+)?japanese\s+(?:house|popstars|breakfast|brothers|band)\b/i.test(lowerArtist)) return false;
  if (/\b(?:the\s+japanese\s+house|japanese\s+boy|japanese\s+porn)\b/i.test(`${lowerArtist} ${lowerTitle}`)) return false;

  // Language must be Japanese ('ja') or have Japanese characters or belong to recognized Japanese artist roster
  if (track.language === 'ja') return true;
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(`${title} ${artist}`)) return true;

  const japaneseArtists = /\b(?:tatsuro\s*yamashita|miki\s*matsubara|mariya\s*takeuchi|anri|taeko\s*onuki|junko\s*ohashi|toshiki\s*kadomatsu|takako\s*mamiya|tomoko\s*aran|meiko\s*nakahara|minako\s*yoshida|hiroshi\s*satoh|one\s*ok\s*rock|radwimps|king\s*gnu|kenshi\s*yonezu|official\s*hige\s*dandism|yoasobi|aimer|flow|lisa)\b/i;
  return japaneseArtists.test(lowerArtist);
}

/**
 * Best-known release year of a candidate: a vintage year in a remaster/reissue tag wins
 * ("Dreams (2004 Remaster)" -> 2004), then the stored year/date, then a year in the title/album.
 */
export function resolveReleaseYear(track: TrackLike): number | null {
  const dateStr = track?.releaseDate || track?.selection?.releaseDate || track?.release_date || '';
  let year: number | null = track?.release_year ? Number(track.release_year) : null;
  if (!year && dateStr) {
    const match = String(dateStr).match(/\b(\d{4})\b/);
    if (match) year = parseInt(match[1], 10);
  }

  const titleAndAlbum = `${track?.title || ''} ${track?.album || ''}`;
  const vintageMatch =
    titleAndAlbum.match(/\b(19\d{2}|20[0-1]\d)\b.*?\b(?:remaster|re-?mastered|anniversary|deluxe|live|edition)\b/i) ||
    titleAndAlbum.match(/\b(?:remaster|re-?mastered|anniversary|deluxe|live|edition).*?\b(19\d{2}|20[0-1]\d)\b/i);
  if (vintageMatch) {
    const vintageYear = parseInt(vintageMatch[1], 10);
    if (!isNaN(vintageYear)) year = vintageYear;
  }

  if (year === null) {
    const standaloneMatch = titleAndAlbum.match(/\b(19\d{2}|20[0-2]\d)\b/);
    if (standaloneMatch) year = parseInt(standaloneMatch[1], 10);
  }
  return year === null || isNaN(year) ? null : year;
}

/**
 * Whether a candidate's release year falls within the requested yearRange. Without a range every
 * track passes (unknown years included); with one, the year must be known and inside it.
 * Legacy remasters never count as contemporary (2020+) releases.
 */
export function isTemporalPermitted(track: TrackLike, yearRange: YearRange | null | undefined): boolean {
  if (!yearRange || (yearRange.start === undefined && yearRange.end === undefined)) {
    return true;
  }

  const titleAndAlbum = `${track?.title || ''} ${track?.album || ''}`;
  if (yearRange.start !== undefined && yearRange.start >= 2020) {
    if (/\b(?:remaster|re-?mastered|anniversary\s+edition|deluxe\s+edition)\b/i.test(titleAndAlbum)) {
      return false;
    }
  }

  const year = resolveReleaseYear(track);
  if (year === null) return false;
  if (yearRange.start !== undefined && year < yearRange.start) return false;
  if (yearRange.end !== undefined && year > yearRange.end) return false;
  return true;
}
