import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getRandomSongPool } from '../../server/selection/songPool.js';
import { clearPreviewCacheForTesting, resolvePreviewRef } from '../../server/services/previewResolver.js';

const originalFetch = globalThis.fetch;
const requests = [];

before(() => {
  process.env.SPOTYSPICE_OFFLINE = '1';
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    throw new Error(`network call in offline mode: ${url}`);
  };
});

after(() => {
  delete process.env.SPOTYSPICE_OFFLINE;
  globalThis.fetch = originalFetch;
});

test('offline mode never falls back to live providers', async () => {
  // The per-process test catalog is empty, which would normally trigger the Deezer/iTunes fallback
  let songs = [];
  try {
    songs = await getRandomSongPool({ count: 5, genre: 'all' });
  } catch {
    // An empty catalog may also fail the pool; either way nothing may go to the network
  }
  assert.deepEqual(songs, []);
  assert.deepEqual(requests, []);
});

test('offline mode resolves no previews', async () => {
  clearPreviewCacheForTesting();
  assert.equal(await resolvePreviewRef('deezer:3135556'), null);
  assert.deepEqual(requests, []);
});
