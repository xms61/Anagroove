import { extractAnswerKeyword } from '../../shared/musicKeywords.js';
import { blacklistMatchesTrack, canonicalArtistKey, canonicalTrackKey } from '../../shared/musicIdentity.js';
import { shuffleArray } from '../../shared/shuffle.js';
import { deezerMusicProvider } from './deezerMusicProvider.js';

let musicProvider = deezerMusicProvider;

export { extractAnswerKeyword };

export function setMusicProviderForTesting(provider) {
  musicProvider = provider || deezerMusicProvider;
}

/**
 * Selects playable, distinct Deezer tracks. Provider I/O, caching and
 * shortages are contained here; callers only receive immutable song records.
 */
export async function getRandomSongPool({
  genre = 'all',
  minFans = 250000,
  count = 25,
  blacklist = [],
  recentIds = [],
} = {}) {
  const recent = new Set(recentIds.map(String));
  const seenTracks = new Set();
  const seenAnswers = new Set();
  const candidates = await musicProvider.getCandidateTracks({
    genre,
    minFans,
    limit: Math.min(100, count * 3),
  });
  const songs = [];

  for (const track of shuffleArray(candidates)) {
    const trackIdentity = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
    const providerTrackId = String(track.providerTrackId);
    const isRecent = recent.has(track.id) ||
      recent.has(providerTrackId) ||
      recent.has(`deezer:${providerTrackId}`) ||
      recent.has(`hit-${providerTrackId}`);
    if (
      isRecent ||
      seenTracks.has(trackIdentity) ||
      blacklistMatchesTrack(blacklist, track)
    ) {
      continue;
    }

    const keyword = extractAnswerKeyword(track.title, track.artist);
    if (!keyword || seenAnswers.has(keyword.answer)) continue;

    seenTracks.add(trackIdentity);
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
