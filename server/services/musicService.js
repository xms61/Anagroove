import crypto from 'crypto';
import { extractAnswerKeyword, splitArtistNames } from '../../shared/musicKeywords.js';
import { blacklistMatchesTrack, canonicalArtistKey, canonicalTrackKey, toCrosswordAnswer } from '../../shared/musicIdentity.js';
import { shuffleArray } from '../../shared/shuffle.js';
import { deezerMusicProvider } from './deezerMusicProvider.js';
import { itunesMusicProvider } from './itunesMusicProvider.js';
import { buildQueryPlan } from './queryBuilder.js';
import { evaluateSongSelection } from './geminiJudge.js';
import { isGeminiJudgeConfigured } from '../config.js';
import { detectStorefront } from './itunesMusicProvider.js';
import { logger } from '../logger.js';

let musicProvider = deezerMusicProvider;

export { extractAnswerKeyword, splitArtistNames };

export function setMusicProviderForTesting(provider) {
  musicProvider = provider || deezerMusicProvider;
}

/**
 * Language Policy: Enforces English for Western mainstream categories,
 * with explicit exemption for non-English cultural genres and prompts
 * (Japanese/Anime, City Pop, K-Pop, Latin, Reggaeton, etc.).
 */
export function isLanguagePermitted(track, genre = 'all', prompt = '') {
  const context = `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
  const title = String(track?.title || '');
  const artist = String(track?.artist || '');

  // Reject foreign animated soundtrack dubs and localized karaoke/sing-along tracks across all genres
  // e.g. "Soda Pop (version française)", "How Far I'll Go (Spanish Version)", "Sing-Along"
  const foreignDubMarkers = /\b(?:version\s+française|french\s+version|spanish\s+version|versión\b|portuguese\s+version|german\s+version|italian\s+version|tagalog\s+version|sing-along|karaoke)\b/i;
  if (foreignDubMarkers.test(title)) {
    return false;
  }

  // Cultural and international exemptions
  const internationalPatterns = /\b(anime|kpop|k-pop|korean|japanese|japan|city\s*pop|j-pop|jpop|latin|spanish|french|german|brazil|bossanova|reggaeton|cumbia|salsa|flamenco|afrobeats|bollywood|mandopop|cantopop)\b/i;
  if (internationalPatterns.test(context)) {
    return true;
  }

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

  // Reject tracks containing common non-English linguistic markers (Spanish/Portuguese/French/German/Italian stopwords)
  const foreignMarkers = /\b(amor|vida|corazón|fiesta|feliz|navidad|noche|mi|su|tu|como|mais|pra|você|sen|ben|bir|del|los|las|por|para|una|uno|dans|avec|pour|des|une|und|nicht|ist|dass|les|le|aux?|sur|sans|nous|vous|sont|mon|ton|son|sa|ses|qui|que|der|die|das|dem|den|ein|eine|einem|einen|einer|eines|mit|auf|für|von|zu|con|sin|sobre|gli|della|delle|dello)\b/i;
  if (foreignMarkers.test(title) || foreignMarkers.test(artist)) {
    return false;
  }

  // Reject classical/orchestral movements and choir works from mainstream puzzles unless classical requested
  const isClassicalContext = /\b(classical|baroque|orchestra|symphon|opera|choir|choral)\b/i.test(context);
  if (!isClassicalContext) {
    const classicalMarkers = /\b(symphonie|symphony|concerto|sonata|opus|\bop\.\s*\d+|bwv\s*\d+|larghetto|allegro|adagio|andante|presto|philharmonic|orchester|orchestra|chœur|chor\b)\b/i;
    if (classicalMarkers.test(title) || classicalMarkers.test(artist)) {
      return false;
    }
  }

  // Reject nursery rhymes and children's music from general puzzles unless requested
  const isKidsContext = /\b(kids?|children|nursery|lullab)\b/i.test(context);
  if (!isKidsContext) {
    const kidsMarkers = /\b(nursery\s+rhymes?|lullaby|cocomelon|baby\s+songs?|toddler\s+songs?|kids\s+songs?|chansons\s+pour\s+enfants)\b/i;
    if (kidsMarkers.test(title) || kidsMarkers.test(artist)) {
      return false;
    }
  }

  return true;
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
  const artist = String(track?.artist || '').trim();
  const title = String(track?.title || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // 1. Generic compilation/workout/soundalike artists
  const fakeArtistPatterns = /\b(workout\s+(music|dj|mix|party|electronica|hits|mafia)|power\s+music\s+workout|fitness\s+workout|running\s+songs|gym\s+music|8-bit\s+arcade|tribute\s+(band|crew|artists?)|cover\s+band|karaoke\s+band|soundalike|classic\s+rock|rock\s+classics|\d{4}\s+rock\s+classics|hits\s+band|various\s+artists|sounds?\s+dj|dj\s+remix\s+crew)\b/i;
  if (fakeArtistPatterns.test(lowerArtist)) {
    return false;
  }

  // 2. Audio modifications and utility releases in titles
  const audioModPatterns = /\b(?:workout\s+mix|\d+\s*bpm|slowed(?:\s*\+?\s*reverb)?|sped\s+up|speed\s+up|nightcore|tribute\s+version|tribute\s+to|8-bit|computer\s+game\s+version|instrumental\s+version|piano\s+version|originally\s+performed\s+by|in\s+the\s+style\s+of|made\s+famous\s+by)\b/i;
  if (audioModPatterns.test(lowerTitle)) {
    return false;
  }

  return true;
}

/**
 * Detects whether a candidate track's release year falls within the requested yearRange,
 * accounting for digital remaster and reissue vintage tags.
 */
export function isTemporalPermitted(track, yearRange) {
  if (!yearRange || (yearRange.start === undefined && yearRange.end === undefined)) {
    return true;
  }
  const dateStr = track?.releaseDate || track?.selection?.releaseDate || '';
  let year = null;
  if (dateStr) {
    const match = String(dateStr).match(/\b(\d{4})\b/);
    if (match) {
      year = parseInt(match[1], 10);
    }
  }

  // Universal Remaster / Reissue Historical Vintage Detection
  const titleAndAlbum = `${track?.title || ''} ${track?.album || ''}`;
  const vintageMatch =
    titleAndAlbum.match(/\b(19\d{2}|20[0-1]\d)\b.*?\b(?:remaster|re-?mastered|anniversary|deluxe|live|edition)\b/i) ||
    titleAndAlbum.match(/\b(?:remaster|re-?mastered|anniversary|deluxe|live|edition).*?\b(19\d{2}|20[0-1]\d)\b/i);

  if (vintageMatch) {
    const vintageYear = parseInt(vintageMatch[1], 10);
    if (!isNaN(vintageYear)) {
      year = vintageYear;
    }
  }

  // If user requested contemporary era (e.g. 2020-2026 or 2024-2026):
  // Any track explicitly tagged as a legacy remaster/reissue is not a contemporary original release
  if (yearRange.start !== undefined && yearRange.start >= 2020) {
    if (/\b(?:remaster|re-?mastered|anniversary\s+edition|deluxe\s+edition)\b/i.test(titleAndAlbum)) {
      return false;
    }
  }

  if (year === null || isNaN(year)) {
    // If provider did not report a release date, keep candidate
    return true;
  }

  if (yearRange.start !== undefined && year < yearRange.start) {
    return false;
  }
  if (yearRange.end !== undefined && year > yearRange.end) {
    return false;
  }
  return true;
}

const PREFERRED_CLUE_ROTATION = ['title', 'artist', 'title', 'artist', 'keyword'];

/**
 * Selects playable, distinct tracks combining Deezer & iTunes with
 * deterministic seed sorting and variety rejection sampling.
 */
export async function getRandomSongPool({
  genre = 'all',
  minFans = 250000,
  count = 25,
  blacklist = [],
  recentIds = [],
  prompt = '',
  artist = '',
  album = '',
  decade = '',
  popularity,
  seed,
} = {}) {
  const queryPlan = buildQueryPlan({
    genre,
    minFans,
    prompt,
    artist,
    album,
    decade,
    popularity,
  });

  logger.info('query', `Plan: genre="${queryPlan.genre}" searches=${JSON.stringify(queryPlan.deezerSearches)} offset=${queryPlan.randomOffset}`);

  const recentFrequency = new Map();
  const allRecentList = Array.isArray(recentIds) ? recentIds : [];
  for (const item of allRecentList) {
    if (!item) continue;
    const key = String(item);
    recentFrequency.set(key, (recentFrequency.get(key) || 0) + 1);
  }

  function getTrackRecentCount(track) {
    const providerTrackId = String(track.providerTrackId);
    const keys = [
      String(track.id),
      providerTrackId,
      `deezer:${providerTrackId}`,
      `itunes:${providerTrackId}`,
      `hit-${providerTrackId}`,
    ];
    let playCount = 0;
    for (const k of keys) {
      if (recentFrequency.has(k)) {
        playCount = Math.max(playCount, recentFrequency.get(k));
      }
    }
    return playCount;
  }

  const seenTracks = new Set();
  const seenArtists = new Set();
  const seenTitles = new Set();
  const seenAnswers = new Set();
  const limit = Math.min(250, Math.max(120, count * 10));

  // 1. Candidate harvesting across providers
  const candidateTasks = [
    musicProvider.getCandidateTracks({
      genre: queryPlan.genre,
      minFans: queryPlan.minFans,
      maxFans: queryPlan.maxFans,
      minRank: queryPlan.minRank,
      maxRank: queryPlan.maxRank,
      searches: queryPlan.deezerSearches,
      offset: queryPlan.randomOffset,
      popularity: queryPlan.popularity,
      limit,
    }),
  ];

  // If using live default provider (not a unit test mock), fetch iTunes candidates too
  if (musicProvider === deezerMusicProvider && queryPlan.itunesSearches.length > 0) {
    for (const term of queryPlan.itunesSearches.slice(0, 4)) {
      candidateTasks.push(
        itunesMusicProvider.getCandidateTracks({ query: term, limit: 100 })
          .catch(err => {
            console.warn('[MusicService] iTunes harvesting error:', err.message);
            return [];
          })
      );
    }
  }

  const harvestStart = Date.now();
  const results = await Promise.all(candidateTasks);
  const rawCandidates = results.flat();
  logger.harvest('Aggregator', rawCandidates.length, Date.now() - harvestStart);

  // 2. Ordering: Deterministic SHA-256 seed hashing or Fisher-Yates shuffle
  let orderedCandidates;
  if (seed !== undefined && seed !== null && String(seed).trim()) {
    const seedKey = String(seed).trim();
    orderedCandidates = [...rawCandidates].sort((a, b) => {
      const hashA = crypto.createHash('sha256').update(`${seedKey}:${a.id}`).digest('hex');
      const hashB = crypto.createHash('sha256').update(`${seedKey}:${b.id}`).digest('hex');
      return hashA.localeCompare(hashB);
    });
  } else {
    orderedCandidates = shuffleArray(rawCandidates);
  }

  // 2b. Partition into play-frequency tiers to enforce strict round-robin catalog rotation
  const tier0 = []; // unplayed
  const tier1 = []; // played 1x
  const tier2 = []; // played 2x
  const tier3Plus = []; // played 3x or more

  for (const track of orderedCandidates) {
    const playCount = getTrackRecentCount(track);
    if (playCount === 0) tier0.push(track);
    else if (playCount === 1) tier1.push(track);
    else if (playCount === 2) tier2.push(track);
    else tier3Plus.push(track);
  }


  // 3. Variety Rejection Sampling & Language Filtering
  const isTargetingSingleArtist = Boolean(queryPlan.artist);
  const songs = [];
  const clueStats = { title: 0, artist: 0, keyword: 0 };
  const rejections = {
    recent: 0,
    duplicateTrack: 0,
    duplicateTitle: 0,
    duplicateArtist: 0,
    duplicateAnswer: 0,
    blacklist: 0,
    language: 0,
    thematic: 0,
    temporal: 0,
    noKeyword: 0,
  };

  function trySelectTracks(candidateList, maxPlays, targetList = songs, excludedKeys = new Set()) {
    for (const track of candidateList) {
      if (targetList.length >= count) break;

      const trackIdentity = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
      const artistIdentity = canonicalArtistKey(track.artist);
      const titleIdentity = canonicalTrackKey(track.title);
      const playCount = getTrackRecentCount(track);

      if (excludedKeys && excludedKeys.has(trackIdentity)) {
        continue;
      }
      if (playCount > maxPlays) {
        rejections.recent++;
        continue;
      }
      if (seenTracks.has(trackIdentity)) {
        rejections.duplicateTrack++;
        continue;
      }
      if (seenTitles.has(titleIdentity)) {
        rejections.duplicateTitle++;
        continue;
      }
      if (blacklistMatchesTrack(blacklist, track)) {
        rejections.blacklist++;
        continue;
      }

      // Language constraint: enforce English for all categories except anime, kpop, and international themes
      if (!isLanguagePermitted(track, queryPlan.genre, prompt || queryPlan.prompt)) {
        rejections.language++;
        continue;
      }

      // Thematic relevance constraint: reject cultural homonyms and split-genre collisions
      if (!isThematicallyPermitted(track, queryPlan.genre, prompt || queryPlan.prompt)) {
        rejections.thematic++;
        continue;
      }

      // Authenticity constraint: reject workout remixes, tribute bands, slowed/8-bit modifications
      if (!isAuthenticTrack(track)) {
        rejections.thematic++;
        continue;
      }

      // Temporal constraint: enforce release year range if requested
      if (!isTemporalPermitted(track, queryPlan.yearRange)) {
        rejections.temporal++;
        continue;
      }

      // Unless the user explicitly asked for a single artist, enforce max 1 track per artist
      const targetArtistKey = queryPlan.artist ? canonicalArtistKey(queryPlan.artist) : '';
      const isTargetArtist = isTargetingSingleArtist && (
        artistIdentity.includes(targetArtistKey) ||
        targetArtistKey.includes(artistIdentity)
      );

      const artistNames = splitArtistNames(track.artist);
      const isDuplicateArtist = !isTargetArtist && (
        seenArtists.has(artistIdentity) ||
        artistNames.some(name => seenArtists.has(canonicalArtistKey(name)))
      );

      if (isDuplicateArtist) {
        rejections.duplicateArtist++;
        continue;
      }

      // Clue type selection:
      // When targeting a single artist, NEVER use 'Artist name' clues (every clue must be Song title or Keyword)
      const allowArtist = !isTargetingSingleArtist;
      let preferredType;
      if (isTargetingSingleArtist) {
        preferredType = (targetList.length % 2 === 0) ? 'title' : 'keyword';
      } else {
        preferredType = PREFERRED_CLUE_ROTATION[targetList.length % PREFERRED_CLUE_ROTATION.length];
        if (seenArtists.has(artistIdentity) && preferredType === 'artist') {
          preferredType = 'title';
        }
      }

      // Answer length variation (2-14 letters) rotation:
      const LENGTH_BUCKET_ROTATION = ['short', 'medium', 'long', 'medium', 'short', 'long', 'medium'];
      const targetLengthBucket = LENGTH_BUCKET_ROTATION[targetList.length % LENGTH_BUCKET_ROTATION.length];

      let keyword = extractAnswerKeyword(track.title, track.artist, { preferredType, allowArtist, seenAnswers, targetLengthBucket });

      // If answer already exists on the grid, fallback:
      if (keyword && seenAnswers.has(keyword.answer)) {
        if (keyword.clueType === 'Artist name') {
          // If there is a co-performer (e.g. Sira in "Ski Aggu & Sira"), try them before giving up on artist clues
          keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'artist', allowArtist, seenAnswers, artistIndex: 1, targetLengthBucket });
        }
        if (keyword && seenAnswers.has(keyword.answer)) {
          keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'title', allowArtist, seenAnswers, targetLengthBucket });
          if (keyword && seenAnswers.has(keyword.answer)) {
            keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'keyword', allowArtist, seenAnswers, targetLengthBucket });
          }
        }
      }
      if (!keyword) {
        rejections.noKeyword++;
        continue;
      }
      if (seenAnswers.has(keyword.answer)) {
        rejections.duplicateAnswer++;
        continue;
      }

      seenTracks.add(trackIdentity);
      seenArtists.add(artistIdentity);
      artistNames.forEach(name => seenArtists.add(canonicalArtistKey(name)));
      seenTitles.add(titleIdentity);
      seenAnswers.add(keyword.answer);

      if (keyword.clueType === 'Song title') clueStats.title++;
      else if (keyword.clueType === 'Artist name') clueStats.artist++;
      else clueStats.keyword++;

      targetList.push({
        ...track,
        answer: keyword.answer,
        clueType: keyword.clueType,
        clueText: keyword.clueText,
      });
    }
  }

  // Pass 1: Try fresh unplayed candidates (playCount === 0)
  trySelectTracks(tier0, 0);

  // Pass 2: If fresh unplayed catalog is exhausted or insufficient, admit candidates with 1 play
  if (songs.length < count && (tier0.length === 0 || songs.length < 3)) {
    trySelectTracks(tier1, 1);
  }

  // Pass 3: If still insufficient, admit candidates with 2 plays
  if (songs.length < count && (tier0.length === 0 && tier1.length === 0)) {
    trySelectTracks(tier2, 2);
  }

  // Pass 4: Last resort fallback to prevent complete failure on tiny catalogs
  if (songs.length < 6) {
    trySelectTracks(tier3Plus, Infinity);
  }

  // 4. Gemini LLM Judge Thematic & Prompt Evaluation Loop (if configured)
  if (isGeminiJudgeConfigured() && songs.length >= 6) {
    const sessionExcludedKeys = new Set();
    const MAX_JUDGE_ROUNDS = 4;
    let round = 0;

    while (round < MAX_JUDGE_ROUNDS) {
      round++;
      const inputContract = {
        mode: prompt ? 'custom_prompt' : 'theme',
        theme: {
          id: queryPlan.genre || 'all',
          title: typeof queryPlan.genre === 'string' && queryPlan.genre !== 'all' ? queryPlan.genre : 'Mixed All-Time Hits',
        },
        customPrompt: prompt || '',
        popularity: queryPlan.popularity || 'balanced',
        targetWordCount: count,
        candidateTracks: songs,
      };

      const evalResult = await evaluateSongSelection(inputContract);

      if (!evalResult.evaluated || evalResult.judgment.isSatisfied || evalResult.judgment.rejectedTrackIndices.length === 0) {
        logger.info('llm_judge', `LLM Judge approved selection on round ${round} (model: ${evalResult.modelUsed || 'standby'}).`);
        break;
      }

      const rejectedIndices = new Set(evalResult.judgment.rejectedTrackIndices);
      logger.info('llm_judge', `Round ${round}: Judge rejected ${rejectedIndices.size} track(s). Reasons: ${JSON.stringify(evalResult.judgment.rejectionReasons)}`);

      // Filter out rejected tracks and clean up tracking sets
      const remainingSongs = [];
      for (let i = 0; i < songs.length; i++) {
        const track = songs[i];
        if (rejectedIndices.has(i)) {
          const trackIdentity = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
          sessionExcludedKeys.add(trackIdentity);
          seenTracks.delete(trackIdentity);
          seenTitles.delete(canonicalTrackKey(track.title));
          seenArtists.delete(canonicalArtistKey(track.artist));
          const artistNames = splitArtistNames(track.artist);
          artistNames.forEach(name => seenArtists.delete(canonicalArtistKey(name)));
          seenAnswers.delete(track.answer);
        } else {
          remainingSongs.push(track);
        }
      }

      songs.length = 0;
      songs.push(...remainingSongs);

      // Execute Negotiated Replacement Queries on music providers
      const replacementQueries = evalResult.judgment.replacementQueries || [];
      if (replacementQueries.length > 0) {
        const replacementTasks = [];
        for (const q of replacementQueries) {
          const deezerSearches = [...(q.searchTerms || [])];
          if (q.artist) deezerSearches.push(`artist:"${q.artist}"`);

          replacementTasks.push(
            musicProvider.getCandidateTracks({
              genre: q.genre || queryPlan.genre,
              searches: deezerSearches,
              limit: 30,
              popularity: q.popularity || queryPlan.popularity,
            }).catch(() => [])
          );

          for (const term of (q.searchTerms || []).slice(0, 2)) {
            replacementTasks.push(
              itunesMusicProvider.getCandidateTracks({
                query: term,
                country: q.targetStorefront || detectStorefront(term),
                limit: 30,
              }).catch(() => [])
            );
          }
        }

        const repResults = await Promise.all(replacementTasks);
        const replacementCandidates = repResults.flat();
        if (replacementCandidates.length > 0) {
          trySelectTracks(replacementCandidates, Infinity, songs, sessionExcludedKeys);
        }
      }

      // Backfill remaining openings from catalog tiers if still below target count
      if (songs.length < count) {
        trySelectTracks(tier0, 0, songs, sessionExcludedKeys);
      }
      if (songs.length < count) {
        trySelectTracks(tier1, 1, songs, sessionExcludedKeys);
      }
      if (songs.length < count) {
        trySelectTracks(tier2, 2, songs, sessionExcludedKeys);
      }
    }
  }

  logger.sampling(orderedCandidates.length, songs.length, clueStats, rejections);

  return songs;
}
