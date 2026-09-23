/**
 * Selection policy: which candidate tracks may appear in a puzzle for a given theme.
 * Language, thematic homonym guards, authenticity (shared rules), anime/Japanese affinity and
 * release-year windows. Pure functions: they never mutate the track.
 */
import { splitArtistNames } from '../../shared/musicKeywords.js';
import { toCrosswordAnswer } from '../../shared/musicIdentity.js';
import { isAuthenticMetadata } from './authenticityRules.js';
import { ALLOWED_LANGUAGES } from '../db/trackNormalization.js';
import { resolveTrackLanguage } from '../db/languageClassifier.js';

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

/**
 * Language Policy: Enforces English for Western mainstream categories,
 * with explicit exemption for non-English cultural genres and prompts
 * (Japanese/Anime, City Pop, K-Pop, Latin, Reggaeton, etc.).
 */
export function isLanguagePermitted(track, genre = 'all', prompt = '') {
  // Anime OP/ED tracks from the dedicated anime catalog are always permitted
  if (track?.isAnimeOped) {
    return true;
  }

  const context = `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
  const title = String(track?.title || '');
  const artist = String(track?.artist || '');

  // Reject foreign animated soundtrack dubs and localized karaoke/sing-along tracks across all genres
  // e.g. "Soda Pop (version française)", "How Far I'll Go (Spanish Version)", "Sing-Along"
  const foreignDubMarkers = /\b(?:version\s+française|french\s+version|spanish\s+version|versión\b|portuguese\s+version|german\s+version|italian\s+version|tagalog\s+version|sing-along|karaoke)\b/i;
  if (foreignDubMarkers.test(title)) {
    return false;
  }

  // Catalog rows carry a classified language (artist vote + ELD): trust it instead of the
  // stopword heuristics below, which reject English titles like "Viva La Vida" or "Ma Belle".
  // Live-provider candidates are classified from their title and artist the same way.
  const allowed = allowedLanguagesForContext(genre, prompt);
  const hasCatalogLanguage = typeof track?.language === 'string' && Boolean(track.language);
  const language = hasCatalogLanguage ? track.language : resolveTrackLanguage({ title, artist });
  if (!allowed.includes(language)) return false;
  if (hasCatalogLanguage || allowed.length > 1) {
    return !isClassicalOrKidsMismatch(title, artist, context);
  }

  // English-only themes: single words like "Despacito" are too short for the classifier, so
  // live candidates also go through the stopword and script heuristics

  // Reject tracks categorized under explicit foreign language genres unless theme permits
  const trackGenre = String(track?.selection?.genre || track?.genre || '').toLowerCase();
  const foreignGenres = /\b(pop\s+latino|música\s+mexicana|urbano\s+latino|latin|música\s+tropical|mpb|sertanejo|french\s+pop|german\s+pop|deutschrap|chanson|russian|arabic|punjabi|bollywood|c-pop|cantopop|mandopop)\b/i;
  if (foreignGenres.test(trackGenre)) {
    return false;
  }

  // Reject non-Latin alphabets (Cyrillic, Greek, Arabic, Kanji, Hiragana, Hangul, Thai, etc.)
  // \u0020-\u024F encompasses standard printable characters and Latin Extended (common Western European accents)
  if (/[^\u0020-\u024F\s\d.,!?'"&()/-]/u.test(title) || /[^\u0020-\u024F\s\d.,!?'"&()/-]/u.test(artist)) {
    return false;
  }

  // Reject tracks containing common non-English linguistic markers (Spanish/Portuguese/French/German/Italian/Dutch stopwords)
  const foreignMarkers = /\b(despacito|bailando|danza|gasolina|fonsi|amor|vida|corazón|fiesta|feliz|navidad|noche|como|mais|pra|você|sen|ben|bir|del|los|las|por|para|una|uno|dans|avec|pour|des|une|und|nicht|ist|dass|les|le|la|el|aux?|sur|sans|nous|vous|sont|mon|ma|mes|ton|ta|tes|son|sa|ses|qui|que|quoi|dont|où|mais|ou|et|donc|der|die|das|dem|den|ein|eine|einem|einen|einer|eines|mit|auf|für|von|zu|aus|durch|nach|bei|seit|con|sin|sobre|gli|della|delle|dello|dei|degli|nel|nella|je|tu|il|elle|ils|elles|un'|non|più|tutto|tutti|tutta|se|yo|ella|ellos|ellas|pero|más|muy|está|están|hacer|tiempo|año|años)\b/i;
  if (foreignMarkers.test(title) || foreignMarkers.test(artist)) {
    return false;
  }

  return !isClassicalOrKidsMismatch(title, artist, context);
}

/**
 * Catalog languages a theme may use. The catalog only holds en/ja/ko (decision D1):
 * K-pop themes take Korean + English, Japanese/anime themes Japanese + English, other
 * international themes any catalog language, everything else English.
 */
export function allowedLanguagesForContext(genre = 'all', prompt = '') {
  const context = `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
  if (/\b(kpop|k-pop|korean)\b/i.test(context)) return ['ko', 'en'];
  if (/\b(anime|japanese|japan|city\s*pop|j-pop|jpop|j-rock|jrock)\b/i.test(context)) return ['ja', 'en'];
  if (/\b(latin|spanish|french|german|brazil|bossanova|reggaeton|cumbia|salsa|flamenco|afrobeats|bollywood|mandopop|cantopop|international|world)\b/i.test(context)) {
    return [...ALLOWED_LANGUAGES];
  }
  return ['en'];
}

// Classical movements and children's music only belong in puzzles that ask for them
function isClassicalOrKidsMismatch(title, artist, context) {
  const isClassicalContext = /\b(classical|baroque|orchestra|symphon|opera|choir|choral)\b/i.test(context);
  if (!isClassicalContext) {
    const classicalMarkers = /\b(symphonie|symphony|concerto|sonata|opus|\bop\.\s*\d+|bwv\s*\d+|larghetto|allegro|adagio|andante|presto|philharmonic|orchester|orchestra|chœur|chor\b)\b/i;
    if (classicalMarkers.test(title) || classicalMarkers.test(artist)) return true;
  }

  const isKidsContext = /\b(kids?|children|nursery|lullab)\b/i.test(context);
  if (!isKidsContext) {
    const kidsMarkers = /\b(nursery\s+rhymes?|lullaby|cocomelon|baby\s+songs?|toddler\s+songs?|kids\s+songs?|chansons\s+pour\s+enfants)\b/i;
    if (kidsMarkers.test(title) || kidsMarkers.test(artist)) return true;
  }
  return false;
}

/**
 * Detects whether a candidate track is an unintended homonym or keyword collision
 * for cultural/regional or compound genre themes.
 */
export function isThematicallyPermitted(track, genre = 'all', prompt = '') {
  const context = `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
  const artist = String(track?.artist || '').trim();
  const title = String(track?.title || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const candidateGenre = String(track?.selection?.genre || track?.genre || '').toLowerCase();

  // Cultural keyword homonym check
  // E.g. prompt is "Japanese City Pop" or "French House" or "German Krautrock"
  const culturalMatch = context.match(/\b(japanese|korean|french|german|italian|spanish|brazilian|irish|british|african|russian|chinese)\b/i);
  if (culturalMatch) {
    const culture = culturalMatch[1].toLowerCase();

    // Reject Western acts where the artist name is literally "The [Culture] [Noun]" or "[Culture] [Western Name]"
    // e.g. "The Japanese House", "The Japanese Popstars", "French Montana", "German Brigante"
    // Also reject when appearing in artist or title (e.g. feat. French Montana)
    const westernHomonymPattern = new RegExp(`(^|\\bthe\\s+|feat\\.?\\s+|ft\\.?\\s+|with\\s+|\\()${culture}\\s+(house|popstars|montana|brigante|band|project|connection|experience|breakfast|brothers|boys|girls)\\b`, 'i');
    if (westernHomonymPattern.test(artist) || westernHomonymPattern.test(title)) {
      return false;
    }

    // Reject novelty track titles like "[Culture] Boy", "[Culture] Girl", "[Culture] Porn"
    // e.g. Aneka - "Japanese Boy", Doctor Flake - "Japanese Porn"
    const westernNoveltyTitlePattern = new RegExp(`^${culture}\\s+(boy|girl|porn|breakfast|girl\\s+remix)\\b|\\b${culture}\\s+(boy|girl|porn)\\b`, 'i');
    if (westernNoveltyTitlePattern.test(title)) {
      return false;
    }
  }

  // Compound genre homonym check
  // E.g. "City Pop": reject tracks where "Pop" was in the artist name and "City" in title (like Iggy Pop - Kill City)
  if (/\bcity\s*pop\b/i.test(context)) {
    if (/\bpop\b/i.test(lowerArtist) && !/\b(japanese|city|j-pop)\b/i.test(lowerArtist)) {
      if (/\b(city|kill city|motor city|sin city|inner city)\b/i.test(lowerTitle)) {
        return false;
      }
    }
  }

  // K-POP THEMATIC & STOREFRONT GUARDRAILS
  if (/\b(kpop|k-pop)\b/i.test(context)) {
    // 1. Reject tracks simply named after the search query ("K-POP", "NEW GEN", "4TH GEN")
    if (/^(k-?pop|new\s+gen|4th\s+gen|5th\s+gen)$/i.test(lowerTitle)) {
      return false;
    }

    // 2. Reject Western pop/country/rock/indie acts matched on fuzzy token collisions ("gen", "pop", "korean")
    const westernActsInKpop = /\b(m4rkim|steven\s+wilson|carrie\s+underwood|destiny'?s\s+child|billy\s+idol|hozier|maroon\s+5|selena\s+gomez|dua\s+lipa|adele|kid\s+cudi|foster\s+the\s+people|becky\s+g|ton\s+koopman|nelis\s+leeman|michael\s+jackson|oasis|chappell\s+roan|billie\s+eilish|travis\s+scott|the\s+weeknd|lacrim|410|snoop\s+dogg|eminem|post\s+malone|drake)\b/i;
    if (westernActsInKpop.test(lowerArtist)) {
      return false;
    }

    // 3. iTunes Genre Verification: Disallow non-Asian genres on iTunes unless Korean Hangul text is present
    if (track?.provider === 'itunes' || track?.selection?.source === 'itunes') {
      const itunesGenre = (track?.selection?.genre || track?.genre || '').toLowerCase();
      const nonKpopGenres = ['country', 'rock', 'alternative', 'metal', 'r&b/soul', 'blues', 'punk', 'latin'];
      if (nonKpopGenres.includes(itunesGenre)) {
        const hasHangul = /[\uac00-\ud7af\u1100-\u11ff]/.test(`${artist} ${title}`);
        if (!hasHangul) {
          return false;
        }
      }
    }
  }

  // GAMING THEMATIC GUARDRAILS
  if (/\bgaming\b/i.test(context) || /\bvideo\s+game\b/i.test(context)) {
    if (track?.provider === 'itunes' || track?.selection?.source === 'itunes') {
      const itunesGenre = (track?.selection?.genre || track?.genre || '').toLowerCase();
      if (!['soundtrack', 'video game', 'anime', 'instrumental'].includes(itunesGenre)) {
        const hasGamingAffiliation = /\b(video\s*game|game|soundtrack|ost|theme|zelda|mario|sonic|pokemon|final\s+fantasy|halo|cyberpunk|skyrim|genshin|undertale|megalovania|toby\s+fox)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`);
        if (!hasGamingAffiliation) {
          return false;
        }
      }
    }
  }

  // CINEMATIC THEMATIC GUARDRAILS
  if (/\b(cinematic|movie\s+ost|film\s+score)\b/i.test(context)) {
    if (/^(the\s+)?movies?$/i.test(lowerTitle) && !/\b(soundtrack|score|theme|original|motion\s+picture)\b/i.test(`${track?.album || ''} ${candidateGenre}`)) {
      return false;
    }
  }

  // EDM THEMATIC GUARDRAILS
  if (/\b(edm|electro|dance)\b/i.test(context)) {
    if (/^(édith\s+piaf|edith\s+piaf|yo\s+la\s+tengo)\b/i.test(lowerArtist)) {
      return false;
    }
  }

  // ANIME THEMATIC & STEM COLLISION GUARDRAILS
  if (/\banime\b/i.test(context)) {
    // 1. Block Deezer Artist ID 147485 (Italian hardcore techno producer "AniMe" / "Anime")
    if (String(track?.providerArtistId) === '147485' || String(track?.artistId) === '147485') {
      return false;
    }
    if (Array.isArray(track?.contributorArtistIds) && track.contributorArtistIds.includes('147485')) {
      return false;
    }

    // 2. Reject if artist or any collaborator is "Anime" or "DJ AniMe"
    const artists = splitArtistNames(artist).map(a => a.toLowerCase().trim());
    if (artists.some(a => /^(dj\s+)?anime$/i.test(a))) {
      return false;
    }
    if (/^(dj\s+)?anime$/i.test(lowerArtist) || /^anime$/i.test(lowerTitle)) {
      return false;
    }
    if (toCrosswordAnswer(artist) === 'ANIME') {
      return false;
    }

    // 3. Hardcore techno DJ "AniMe" anthem tracks and label affiliations
    if (/\b(official\s+dominator|ground\s+zero\s+\d+|toxicator\s+\d+|hardcore|anthem|masters\s+of\s+hardcore|traxtorm|thunderdome|aftermath|break\s+your\s+mind)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`)) {
      return false;
    }

    // 3. Deezer prefix/stem collisions on "anim*" (Animal, Animals, Animais, Animosity, Animate, Animatrix, Anima)
    // When track contains non-anime Latin/English stems and lacks Japanese/Anime context
    const hasJapaneseAnimeAffiliation =
      /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(track?.title || '') ||
      /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(track?.artist || '') ||
      /\b(ost|opening|ending|theme|tv\s*size|soundtrack|version\s*tv|j-rock|j-pop|frieren|naruto|kenshin|bleach|one\s*piece|dragon\s*ball|attack\s*on\s*titan|shingeki|jujutsu|demon\s*slayer|kimetsu|bocchi|evangelion|dandadan)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`);

    if (!hasJapaneseAnimeAffiliation) {
      if (/\b(animals?|animais|animosity|animate|animated|animation|animatrix|anima)\b/i.test(`${lowerArtist} ${lowerTitle}`)) {
        return false;
      }
    }

    // 4. Storefront chart leakage: Reject non-anime genres (e.g. K-Pop charting on Apple Music JP)
    if (candidateGenre && /\b(k-?pop|korean\s+hip-?hop|country|latin)\b/i.test(candidateGenre)) {
      return false;
    }

    // 5. Western animation studio and soundtrack leakage (Disney, Pixar, DreamWorks, etc.)
    if (/\b(disney|pixar|dreamworks|illumination|moana|frozen|encanto|lion\s*king|aladdin|beauty\s+and\s+the\s+beast|little\s+mermaid|tangled|coco|zootopia|shrek|toy\s*story)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`)) {
      return false;
    }

    // 6. Generic novelty titles matching literally "Anime Theme" or "Anime Song"
    if (/^anime\s+(theme|song|ost|music)$/i.test(lowerTitle)) {
      return false;
    }

    // 7. Non-Japanese television cast, hip-hop, or Latin pop leakage without anime affiliation
    if (!hasJapaneseAnimeAffiliation) {
      if (/\b(empire\s+cast|glee\s+cast|nashville\s+cast|dizzy\s+dros|sandoval)\b/i.test(lowerArtist)) {
        return false;
      }
      if (/\b(sabía|sabia)\b/i.test(lowerTitle)) {
        return false;
      }
    }
  }

  // GAMING / VIDEO GAME THEMATIC GUARDRAILS
  if (/\b(gaming|video\s*games?)\b/i.test(context)) {
    if (/^(the\s+)?game$/i.test(lowerArtist)) {
      return false;
    }
    if (/\bgamin(e|s)?\b/i.test(`${lowerArtist} ${lowerTitle}`)) {
      return false;
    }
  }

  // POP PUNK / PUNK GUARDRAILS
  if (/\b(pop-?punk|punk\s+rock)\b/i.test(context)) {
    if (/\bdaft\s+punk\b/i.test(lowerArtist)) {
      return false;
    }
  }

  // EDM / ELECTRONIC / DANCE GUARDRAILS
  if (/\b(edm|electro|dance)\b/i.test(context)) {
    if (/\bdance\s+gavin\s+dance\b/i.test(lowerArtist) || /\bdance\s+hall\s+crashers\b/i.test(lowerArtist)) {
      return false;
    }
    if (/\bprivate\s+dancer\b/i.test(lowerTitle)) {
      return false;
    }
  }

  // LATIN GUARDRAILS
  if (/\blatin\b/i.test(context)) {
    if (/\blatin\s+quarter\b/i.test(lowerArtist) || /\blatin\s+alliance\b/i.test(lowerArtist)) {
      return false;
    }
  }

  return true;
}

/**
 * Rejects low-quality imitation tracks, workout mixes, generic cover/tribute artists,
 * and sped-up/slowed-down audio modifications.
 */
export function isAuthenticTrack(track) {
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
export function isAnimeTrack(track) {
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
export function isJapaneseTrack(track) {
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
 * @returns {number|null}
 */
export function resolveReleaseYear(track) {
  const dateStr = track?.releaseDate || track?.selection?.releaseDate || track?.release_date || '';
  let year = track?.release_year ? Number(track.release_year) : null;
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
export function isTemporalPermitted(track, yearRange) {
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
