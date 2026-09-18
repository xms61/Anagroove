import crypto from 'crypto';
import { extractAnswerKeyword } from '../../shared/musicKeywords.js';
import { blacklistMatchesTrack, canonicalArtistKey, canonicalTrackKey } from '../../shared/musicIdentity.js';
import { shuffleArray } from '../../shared/shuffle.js';
import { deezerMusicProvider } from './deezerMusicProvider.js';
import { itunesMusicProvider } from './itunesMusicProvider.js';
import { buildQueryPlan } from './queryBuilder.js';
import { logger } from '../logger.js';

let musicProvider = deezerMusicProvider;

export { extractAnswerKeyword };

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

  // Cultural and international exemptions
  const internationalPatterns = /\b(anime|kpop|k-pop|korean|japanese|japan|city\s*pop|j-pop|jpop|latin|spanish|french|german|brazil|bossanova|reggaeton|cumbia|salsa|flamenco|afrobeats|bollywood|mandopop|cantopop)\b/i;
  if (internationalPatterns.test(context)) {
    return true;
  }

  const title = String(track?.title || '');
  const artist = String(track?.artist || '');

  // Reject non-Latin alphabets (Cyrillic, Greek, Arabic, Kanji, Hiragana, Hangul, Thai, etc.)
  // \u0020-\u024F encompasses standard printable characters and Latin Extended (common Western European accents)
  if (/[^\u0020-\u024F\s\d.,!?'"&()/-]/u.test(title) || /[^\u0020-\u024F\s\d.,!?'"&()/-]/u.test(artist)) {
    return false;
  }

  // Reject tracks containing common non-English linguistic markers
  // (Spanish/Portuguese/French/German stopwords) unless it's a known theme
  const foreignMarkers = /\b(amor|de|el|la|los|las|del|por|para|una|uno|vida|mi|su|tu|dans|avec|pour|des|une|und|nicht|ist|dass|como|mais|pra|você|sen|ben|bir)\b/i;
  if (foreignMarkers.test(title)) {
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
    noKeyword: 0,
  };

  function trySelectTracks(candidateList, maxPlays) {
    for (const track of candidateList) {
      if (songs.length >= count) break;

      const trackIdentity = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
      const artistIdentity = canonicalArtistKey(track.artist);
      const titleIdentity = canonicalTrackKey(track.title);
      const playCount = getTrackRecentCount(track);

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

      // Unless the user explicitly asked for a single artist, enforce max 1 track per artist
      if (!isTargetingSingleArtist && seenArtists.has(artistIdentity)) {
        rejections.duplicateArtist++;
        continue;
      }

      // Cycle preferred clue type across the crossword to guarantee clue variance
      const preferredType = PREFERRED_CLUE_ROTATION[songs.length % PREFERRED_CLUE_ROTATION.length];
      const keyword = extractAnswerKeyword(track.title, track.artist, { preferredType });
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
      seenTitles.add(titleIdentity);
      seenAnswers.add(keyword.answer);

      if (keyword.clueType === 'Song title') clueStats.title++;
      else if (keyword.clueType === 'Artist name') clueStats.artist++;
      else clueStats.keyword++;

      songs.push({
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

  logger.sampling(orderedCandidates.length, songs.length, clueStats, rejections);

  return songs;
}
