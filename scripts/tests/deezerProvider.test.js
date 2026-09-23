import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import {
  deezerMusicProvider,
  getDeezerCacheStatsForTesting,
  resetDeezerCachesForTesting,
} from '../../server/services/deezerMusicProvider.ts';
import { createLivePuzzleStore } from '../../server/server.js';

const CHART = {
  data: [
    { id: 1, title: 'First Hit', preview: 'https://cdn.example.test/1.mp3', rank: 500000, artist: { id: 10, name: 'First Artist' } },
    { id: 2, title: 'Second Hit', preview: 'https://cdn.example.test/2.mp3', rank: 500000, artist: { id: 20, name: 'Second Artist' } },
  ],
};

describe('Deezer candidate provider', () => {
  /**
   * Fake Deezer: the chart lists two tracks. Artist 10 always fails (503 = retryable, or 400),
   * other artists have 900k fans unless `failAllArtists` is set.
   */
  let deezer;
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;

  beforeEach(() => {
    deezer = { now: 0, chartRequests: 0, artist10Requests: 0, artistSuccesses: 0, artist10Status: 503, failAllArtists: false, chartFails: false };
    resetDeezerCachesForTesting();
    Date.now = () => deezer.now;
    globalThis.fetch = async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/chart/0/tracks')) {
        deezer.chartRequests++;
        return deezer.chartFails ? new Response('', { status: 400 }) : new Response(JSON.stringify(CHART), { status: 200 });
      }
      if (requestUrl.includes('/artist/10')) {
        deezer.artist10Requests++;
        return new Response('', { status: deezer.artist10Status });
      }
      if (deezer.failAllArtists) return new Response('', { status: 400 });
      deezer.artistSuccesses++;
      return new Response(JSON.stringify({ nb_fan: 900000 }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
    resetDeezerCachesForTesting();
  });

  const candidates = (options = {}) => deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000, ...options });

  test('an artist lookup that keeps failing drops only that artist, after 3 attempts', async () => {
    const result = await candidates();
    assert.deepEqual(result.map(t => t.providerTrackId), ['2']);
    assert.equal(deezer.artist10Requests, 3);
    assert.equal(deezer.artistSuccesses, 1);
  });

  test('track and artist cache entries expire after 5 minutes', async () => {
    await candidates();
    deezer.now += 5 * 60 * 1000 + 1;
    await candidates();
    assert.equal(deezer.chartRequests, 2);
    assert.equal(deezer.artistSuccesses, 2);
  });

  test('a failed artist scan is not cached as an empty pool', async () => {
    deezer.artist10Status = 400;
    deezer.failAllArtists = true;
    assert.equal((await candidates()).length, 0);
    deezer.failAllArtists = false;
    assert.equal((await candidates()).length, 1);
    assert.equal(deezer.chartRequests, 2);
  });

  test('a failing chart request propagates', async () => {
    deezer.chartFails = true;
    await assert.rejects(candidates({ limit: 1 }));
  });

  test('the caches are bounded at 100 entries and evict the oldest', async () => {
    for (let minFans = 0; minFans <= 100; minFans++) await candidates({ minFans, limit: 1 });
    const before = deezer.chartRequests;
    await candidates({ minFans: 0, limit: 1 });
    const stats = getDeezerCacheStatsForTesting();
    assert.equal(stats.trackEntries, 100);
    assert.ok(stats.artistEntries <= 100);
    assert.equal(deezer.chartRequests, before + 1, 'the first entry was evicted');
  });
});

test('the live puzzle store evicts the oldest payload at capacity and expires idle ones', async () => {
  let tokenNumber = 0;
  const store = createLivePuzzleStore({ ttlMs: 10, maxEntries: 2, createToken: () => `token-${++tokenNumber}` });
  store.add({ id: 1 });
  store.add({ id: 2 });
  store.add({ id: 3 });
  assert.equal(store.size, 2);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(store.size, 0);
  store.clear();
});
