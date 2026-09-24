import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import {
  deezerMusicProvider,
  getDeezerCacheStatsForTesting,
  resetDeezerCachesForTesting,
} from '../../server/services/deezerMusicProvider.ts';
import { createLivePuzzleStore } from '../../server/server.ts';
import { getRandomSongPool } from '../../server/selection/songPool.ts';
import type { Puzzle } from '../../shared/types.ts';

const SEARCH = {
  data: [
    { id: 1, title: 'First Hit', preview: 'https://cdn.example.test/1.mp3', rank: 500000, artist: { id: 10, name: 'Queen' } },
    { id: 2, title: 'Second Hit', preview: 'https://cdn.example.test/2.mp3', rank: 500000, artist: { id: 20, name: 'Queen' } },
    { id: 3, title: 'Dancing Queen', preview: 'https://cdn.example.test/3.mp3', rank: 900000, artist: { id: 30, name: 'ABBA' } },
  ],
};

describe('Deezer candidate provider', () => {
  /**
   * Fake Deezer: every search returns the three tracks above. Artist 10 fails (503 =
   * retryable, or 400) unless its status is set to 200; artists have 900k fans unless `failAllArtists` is set.
   */
  let deezer;
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;

  beforeEach(() => {
    deezer = { now: 0, searches: [], artist10Requests: 0, artistSuccesses: 0, artist10Status: 503, failAllArtists: false, searchFails: false };
    resetDeezerCachesForTesting();
    Date.now = () => deezer.now;
    globalThis.fetch = async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/search?')) {
        deezer.searches.push(requestUrl);
        return deezer.searchFails ? new Response('', { status: 400 }) : new Response(JSON.stringify(SEARCH), { status: 200 });
      }
      if (requestUrl.includes('/artist/10') && deezer.artist10Status !== 200) {
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

  const candidates = (options = {}) => deezerMusicProvider.getCandidateTracks({ artist: 'Queen', limit: 5, ...options });

  test('a plain search keeps only the named artist\'s tracks', async () => {
    deezer.artist10Status = 200;
    const result = await candidates();
    assert.deepEqual(result.map(t => t.providerTrackId), ['1', '2']);
    assert.match(deezer.searches[0], /search\?q=Queen&/);
  });

  test('an artist lookup that keeps failing drops only that artist\'s tracks, after 3 attempts', async () => {
    const result = await candidates();
    assert.deepEqual(result.map(t => t.providerTrackId), ['2']);
    assert.equal(deezer.artist10Requests, 3);
  });

  test('no artist, no request', async () => {
    assert.deepEqual(await candidates({ artist: '  ' }), []);
    assert.equal(deezer.searches.length, 0);
  });

  test('track and artist cache entries expire after 5 minutes', async () => {
    await candidates();
    await candidates();
    assert.equal(deezer.searches.length, 1);
    deezer.now += 5 * 60 * 1000 + 1;
    await candidates();
    assert.equal(deezer.searches.length, 2);
    assert.equal(deezer.artistSuccesses, 2);
  });

  test('an empty result is not cached', async () => {
    deezer.artist10Status = 400;
    deezer.failAllArtists = true;
    assert.equal((await candidates()).length, 0);
    deezer.failAllArtists = false;
    assert.equal((await candidates()).length, 1);
    assert.equal(deezer.searches.length, 2);
  });

  test('a failing search propagates', async () => {
    deezer.searchFails = true;
    await assert.rejects(candidates());
  });

  test('the caches are bounded at 100 entries and evict the oldest', async () => {
    deezer.artist10Status = 200;
    for (let limit = 1; limit <= 101; limit++) await candidates({ limit });
    const before = deezer.searches.length;
    await candidates({ limit: 1 });
    const stats = getDeezerCacheStatsForTesting();
    assert.equal(stats.trackEntries, 100);
    assert.ok(stats.artistEntries <= 100);
    assert.equal(deezer.searches.length, before + 1, 'the first entry was evicted');
  });
});

describe('the live fallback', () => {
  const originalFetch = globalThis.fetch;
  let deezerSearches: string[];

  beforeEach(() => {
    deezerSearches = [];
    resetDeezerCachesForTesting();
    globalThis.fetch = async (url) => {
      if (String(url).includes('api.deezer.com/search')) deezerSearches.push(String(url));
      return new Response(JSON.stringify({ data: [], results: [] }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // The per-process test catalog is empty, so every request is "thin"
  test('a theme or a prompt without an artist never asks the live providers', async () => {
    await getRandomSongPool({ genre: 'rock', count: 5 });
    await getRandomSongPool({ prompt: 'songs about rain', count: 5 });
    assert.deepEqual(deezerSearches, []);
  });

  test('a prompt naming an artist the catalog lacks searches that artist', async () => {
    await getRandomSongPool({ prompt: 'songs by Queen', count: 5 });
    assert.ok(deezerSearches.length > 0);
    assert.ok(deezerSearches.every(url => /search\?q=queen&/i.test(url)), deezerSearches.join(', '));
  });
});

test('the live puzzle store evicts the oldest payload at capacity and expires idle ones', async () => {
  const storedPuzzle = (id: string) => ({ id }) as Puzzle;
  let tokenNumber = 0;
  const store = createLivePuzzleStore({ ttlMs: 10, maxEntries: 2, createToken: () => `token-${++tokenNumber}` });
  store.add(storedPuzzle('puzzle-1'));
  store.add(storedPuzzle('puzzle-2'));
  store.add(storedPuzzle('puzzle-3'));
  assert.equal(store.size, 2);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(store.size, 0);
  store.clear();
});
