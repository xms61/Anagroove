import crypto from 'crypto';
import { extractAnswerKeyword } from '../../shared/musicKeywords.js';
import { blacklistMatchesTrack, canonicalArtistKey, canonicalTrackKey } from '../../shared/musicIdentity.js';
import { shuffleArray } from '../../shared/shuffle.js';
import { deezerMusicProvider } from './deezerMusicProvider.js';
import { itunesMusicProvider } from './itunesMusicProvider.js';
import { buildQueryPlan } from './queryBuilder.js';

let musicProvider = deezerMusicProvider;

export { extractAnswerKeyword };

export function setMusicProviderForTesting(provider) {
  musicProvider = provider || deezerMusicProvider;
}

/**
 * Validates whether a track fits the required language constraints:
 * English for all categories, with an explicit exemption for Anime (Japanese) and K-Pop (Korean).
 */
export function isLanguagePermitted(track, genre = 'all') {
  const normalizedGenre = typeof genre === 'string' ? genre.toLowerCase().trim() : 'all';
  if (normalizedGenre === 'anime' || normalizedGenre === 'kpop') {
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

  const recent = new Set(recentIds.map(String));
  const seenTracks = new Set();
  const seenArtists = new Set();
  const seenTitles = new Set();
  const seenAnswers = new Set();
  const limit = Math.min(100, count * 3);

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
    for (const term of queryPlan.itunesSearches.slice(0, 2)) {
      candidateTasks.push(
        itunesMusicProvider.getCandidateTracks({ query: term, limit: Math.min(50, count * 2) })
          .catch(err => {
            console.warn('[MusicService] iTunes harvesting error:', err.message);
            return [];
          })
      );
    }
  }

  const results = await Promise.all(candidateTasks);
  const rawCandidates = results.flat();

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

  // 3. Variety Rejection Sampling & Language Filtering
  const isTargetingSingleArtist = Boolean(queryPlan.artist);
  const songs = [];

  for (const track of orderedCandidates) {
    const trackIdentity = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
    const artistIdentity = canonicalArtistKey(track.artist);
    const titleIdentity = canonicalTrackKey(track.title);
    const providerTrackId = String(track.providerTrackId);
    const isRecent = recent.has(track.id) ||
      recent.has(providerTrackId) ||
      recent.has(`deezer:${providerTrackId}`) ||
      recent.has(`itunes:${providerTrackId}`) ||
      recent.has(`hit-${providerTrackId}`);

    if (
      isRecent ||
      seenTracks.has(trackIdentity) ||
      seenTitles.has(titleIdentity) ||
      blacklistMatchesTrack(blacklist, track)
    ) {
      continue;
    }

    // Language constraint: enforce English for all categories except anime and kpop
    if (!isLanguagePermitted(track, queryPlan.genre)) {
      continue;
    }

    // Unless the user explicitly asked for a single artist, enforce max 1 track per artist
    if (!isTargetingSingleArtist && seenArtists.has(artistIdentity)) {
      continue;
    }

    // Cycle preferred clue type across the crossword to guarantee clue variance
    const preferredType = PREFERRED_CLUE_ROTATION[songs.length % PREFERRED_CLUE_ROTATION.length];
    const keyword = extractAnswerKeyword(track.title, track.artist, { preferredType });
    if (!keyword || seenAnswers.has(keyword.answer)) continue;

    seenTracks.add(trackIdentity);
    seenArtists.add(artistIdentity);
    seenTitles.add(titleIdentity);
    seenAnswers.add(keyword.answer);

    songs.push({
      ...track,
      answer: keyword.answer,
      clueType: keyword.clueType,
      clueText: keyword.clueText,
    });
    if (songs.length >= count) break;
  }

  return songs;
}
