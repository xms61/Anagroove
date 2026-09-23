import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deezerMusicProvider,
  getDeezerCacheStatsForTesting,
  resetDeezerCachesForTesting,
} from '../../server/services/deezerMusicProvider.js';
import { createLivePuzzleStore } from '../../server/server.js';

test('Deezer Provider Resilience and Cache Bounds', async () => {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  let now = 0;
  let chartRequests = 0;
  let failedArtistRequests = 0;
  let successfulArtistRequests = 0;
  let retryFailedArtistRequests = true;
  let failAllArtistRequests = false;
  let topLevelFailure = false;
  resetDeezerCachesForTesting();
  Date.now = () => now;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/chart/0/tracks')) {
      chartRequests++;
      if (topLevelFailure) return new Response('', { status: 400 });
      return new Response(JSON.stringify({
        data: [
          { id: 1, title: 'First Hit', preview: 'https://cdn.example.test/1.mp3', rank: 500000, artist: { id: 10, name: 'First Artist' } },
          { id: 2, title: 'Second Hit', preview: 'https://cdn.example.test/2.mp3', rank: 500000, artist: { id: 20, name: 'Second Artist' } },
        ],
      }), { status: 200 });
    }
    if (requestUrl.includes('/artist/10')) {
      failedArtistRequests++;
      return new Response('', { status: retryFailedArtistRequests ? 503 : 400 });
    }
    if (failAllArtistRequests) return new Response('', { status: 400 });
    successfulArtistRequests++;
    return new Response(JSON.stringify({ nb_fan: 900000 }), { status: 200 });
  };

  try {
    const candidates = await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    assert(
      candidates.length === 1 && candidates[0].providerTrackId === '2' &&
      failedArtistRequests === 3 && successfulArtistRequests === 1,
      'Skips an artist enrichment after retries while retaining other Deezer candidates'
    );

    now += (5 * 60 * 1000) + 1;
    await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    assert(
      chartRequests === 2 && successfulArtistRequests === 2,
      'Expired Deezer track and artist cache entries are removed and refetched'
    );

    resetDeezerCachesForTesting();
    retryFailedArtistRequests = false;
    failAllArtistRequests = true;
    const requestsBeforeFailedScan = chartRequests;
    const emptyCandidates = await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    failAllArtistRequests = false;
    const recoveredCandidates = await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    assert(
      emptyCandidates.length === 0 && recoveredCandidates.length === 1 &&
      chartRequests === requestsBeforeFailedScan + 2,
      'Failed artist scans do not cache an empty candidate pool'
    );

    resetDeezerCachesForTesting();
    topLevelFailure = true;
    let propagatedTopLevelFailure = false;
    try {
      await deezerMusicProvider.getCandidateTracks({ limit: 1, minFans: 250000 });
    } catch {
      propagatedTopLevelFailure = true;
    }
    topLevelFailure = false;
    assert(propagatedTopLevelFailure, 'Propagates top-level Deezer provider failures');

    resetDeezerCachesForTesting();
    for (let i = 0; i <= 100; i++) {
      await deezerMusicProvider.getCandidateTracks({ minFans: i, limit: 1 });
    }
    const requestsBeforeEvictedCacheRead = chartRequests;
    await deezerMusicProvider.getCandidateTracks({ minFans: 0, limit: 1 });
    const cacheStats = getDeezerCacheStatsForTesting();
    assert(
      cacheStats.trackEntries === 100 && cacheStats.artistEntries <= 100 &&
      chartRequests === requestsBeforeEvictedCacheRead + 1,
      'Deezer caches use a bounded deterministic eviction limit'
    );
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
    resetDeezerCachesForTesting();
  }

  let tokenNumber = 0;
  const livePuzzleStore = createLivePuzzleStore({
    ttlMs: 10,
    maxEntries: 2,
    createToken: () => `token-${++tokenNumber}`,
  });
  livePuzzleStore.add({ id: 1 });
  livePuzzleStore.add({ id: 2 });
  livePuzzleStore.add({ id: 3 });
  assert(livePuzzleStore.size === 2, 'Live puzzle store evicts the oldest payload at capacity');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(livePuzzleStore.size === 0, 'Live puzzle store expires idle payloads independently');
  livePuzzleStore.clear();
});
