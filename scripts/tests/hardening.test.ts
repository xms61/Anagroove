import assert from 'node:assert/strict';
import http, { type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { setMusicProviderForTesting } from '../../server/selection/songPool.ts';
import { validatePreviewRef } from '../../server/validators.ts';
import { server, parseTrustProxy, clientIpFromUpgrade } from '../../server/server.ts';
import { db } from '../../server/db.ts';
import { MAX_BLACKLIST_ITEMS } from '../../server/db/userStore.ts';
import {
  resolveTrackPreview,
  clearPreviewCacheForTesting,
  parsePreviewExpiry,
  isPreviewUrlFresh,
  parsePreviewRef,
  previewRefForTrack,
  resolvePreviewRef,
  setPreviewFetchForTesting,
} from '../../server/services/previewResolver.ts';
import { politeFetch, ProviderBudgetError, TokenBucketRateLimiter } from '../../server/crawler/rateLimiter.ts';
import { fetchWithTimeout } from '../../server/services/fetchWithTimeout.ts';
import { attachMultiplayer } from '../../server/ws/rooms.ts';
import { createLivePuzzleStore } from '../../server/http/livePuzzleStore.ts';
import WebSocket from 'ws';
import { mockJsonResponse, wsTestClient, readJson } from './helpers.ts';

const nowSec = Math.floor(Date.now() / 1000);
const signed = (expSec) => `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=exp=${expSec}~acl=/api/1/1/a/b/c/0/abc.mp3*~data=user_id=0,application_id=42~hmac=deadbeef`;
const FRESH_URL = signed(nowSec + 900);

/** Fake Deezer/iTunes for the preview resolver; returns the list of requested URLs. */
function stubPreviewFetch() {
  const requested = [];
  setPreviewFetchForTesting(async (url) => {
    requested.push(url);
    if (url.endsWith('/track/555') || url.endsWith('/track/777')) return mockJsonResponse({ id: 555, preview: FRESH_URL, title: 'Song', artist: { name: 'Band' } });
    if (url.endsWith('/track/556')) return mockJsonResponse({ id: 556, preview: '', title: 'Rare Song', artist: { name: 'Rare Band' } });
    if (url.endsWith('/track/999')) return mockJsonResponse({ error: { type: 'DataException', message: 'no data' } });
    if (url.includes('api.deezer.com/search')) {
      return mockJsonResponse({ data: [
        { id: 1557, preview: FRESH_URL, title: 'Rare Song (Live)', artist: { name: 'Other Band' } },
        { id: 1556, preview: FRESH_URL, title: 'Rare Song', artist: { name: 'Rare Band' } },
      ] });
    }
    return mockJsonResponse({ results: [] });
  });
  clearPreviewCacheForTesting();
  return requested;
}

test('signed Deezer preview URLs expire, with a safety margin', () => {
  assert.equal(parsePreviewExpiry(signed(1789817437)), 1789817437000);
  assert.equal(parsePreviewExpiry('https://audio-ssl.itunes.apple.com/preview.m4a'), null);
  assert.equal(isPreviewUrlFresh(signed(nowSec - 60)), false, 'expired');
  assert.equal(isPreviewUrlFresh(signed(nowSec + 30)), false, 'inside the 60 s margin');
  assert.equal(isPreviewUrlFresh(signed(nowSec + 600)), true);
  assert.equal(isPreviewUrlFresh('https://audio-ssl.itunes.apple.com/preview.m4a'), true, 'unsigned https');
  assert.equal(isPreviewUrlFresh('/audio/anime/op.ogg'), false, 'relative path');
});

test('preview refs are provider:id, and a track picks Deezer, then iTunes, then its catalog id', () => {
  assert.equal(parsePreviewRef('deezer:3135556')?.ref, 'deezer:3135556');
  assert.equal(parsePreviewRef('spotify:1'), null);
  assert.equal(parsePreviewRef('deezer:12a'), null);
  assert.equal(validatePreviewRef('itunes:42'), 'itunes:42');
  assert.equal(validatePreviewRef('../etc/passwd'), null);
  assert.equal(previewRefForTrack({ id: 'sqlite:5', provider: 'deezer', providerTrackId: '5', deezer_id: '77' }), 'deezer:77');
  assert.equal(previewRefForTrack({ id: 'sqlite:5', itunes_id: '88' }), 'itunes:88');
  assert.equal(previewRefForTrack({ id: 'sqlite:5' }), 'catalog:5');
  assert.equal(previewRefForTrack({ id: 'deezer:9', provider: 'deezer', providerTrackId: '9' }), 'deezer:9');
  assert.equal(previewRefForTrack({ id: 'x', provider: 'spotify', providerTrackId: '1' }), null);
});

describe('preview resolver', () => {
  let requested;
  before(() => { requested = stubPreviewFetch(); });
  after(() => { setPreviewFetchForTesting(); clearPreviewCacheForTesting(); });

  test('an expired stored sample is re-minted through the Deezer track API', async () => {
    const result = await resolveTrackPreview({ id: 'x-1', title: 'Song', artist: 'Band', deezer_id: '555', sample_url: signed(nowSec - 3600) });
    assert.equal(result?.url, FRESH_URL);
    assert.equal(result.source, 'deezer_fast_path');
  });

  test('a resolved ref is cached until the signed URL nears expiry', async () => {
    clearPreviewCacheForTesting();
    requested.length = 0;
    assert.equal(await resolvePreviewRef('deezer:555'), FRESH_URL);
    assert.equal(await resolvePreviewRef('deezer:555'), FRESH_URL);
    assert.equal(requested.length, 1);
  });

  test('a Deezer track without a preview falls back to search; an unknown one resolves to null', async () => {
    assert.equal(await resolvePreviewRef('deezer:556'), FRESH_URL);
    assert.equal(await resolvePreviewRef('deezer:999'), null);
  });

  test('a catalog ref resolves through the row\'s Deezer id', async () => {
    const catalog = { getPreviewLookup: (id) => (id === 7 ? { id: 7, title: 'Song', artist: 'Band', isrc: null, deezer_id: '777' } : null) };
    assert.equal(await resolvePreviewRef('catalog:7', { catalog }), FRESH_URL);
    assert.equal(await resolvePreviewRef('catalog:8', { catalog }), null);
  });
});

test('TRUST_PROXY parsing and the WebSocket client IP', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  const upgrade = { socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } } as unknown as IncomingMessage;
  assert.equal(clientIpFromUpgrade(upgrade, false), '10.0.0.5', 'X-Forwarded-For is ignored without a trusted proxy');
  assert.equal(clientIpFromUpgrade(upgrade, 1), '203.0.113.9', 'one trusted hop: the entry it appended');
});

describe('preview lookups stay within the provider budget', () => {
  after(() => { setPreviewFetchForTesting(); clearPreviewCacheForTesting(); });

  /** A stub fetch that counts calls; `answer` decides each response. */
  function countingFetch(answer: (url: string) => Promise<Response>) {
    const calls: string[] = [];
    setPreviewFetchForTesting(async (url) => { calls.push(url); return answer(url); });
    clearPreviewCacheForTesting();
    return calls;
  }

  test('concurrent requests for one ref share a single lookup', async () => {
    const calls = countingFetch(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return mockJsonResponse({ id: 1, preview: FRESH_URL });
    });
    const urls = await Promise.all(Array.from({ length: 10 }, () => resolvePreviewRef('deezer:1')));
    assert.deepEqual(new Set(urls), new Set([FRESH_URL]));
    assert.equal(calls.length, 1);
  });

  test('a ref without a preview is not looked up again, but a failed lookup is', async () => {
    const missing = countingFetch(async () => mockJsonResponse({ error: { type: 'DataException' } }));
    assert.equal(await resolvePreviewRef('deezer:2'), null);
    assert.equal(await resolvePreviewRef('deezer:2'), null);
    assert.equal(missing.length, 1);

    const failing = countingFetch(async () => { throw new Error('socket hang up'); });
    assert.equal(await resolvePreviewRef('deezer:3'), null);
    assert.equal(await resolvePreviewRef('deezer:3'), null);
    assert.equal(failing.length, 2);
  });

  test('an exhausted budget rejects instead of queueing', async () => {
    countingFetch(async () => { throw new ProviderBudgetError(); });
    await assert.rejects(resolvePreviewRef('deezer:4'), ProviderBudgetError);

    const bucket = new TokenBucketRateLimiter({ refillRatePerSec: 1, maxTokens: 1 });
    await bucket.acquireToken({ maxWaitMs: 100 });
    await assert.rejects(bucket.acquireToken({ maxWaitMs: 100 }), ProviderBudgetError);
  });

  test('a text search only accepts an iTunes result by the same artist', async () => {
    countingFetch(async (url) => mockJsonResponse(url.includes('itunes.apple.com')
      ? { results: [{ previewUrl: 'https://itunes.test/cover.m4a', trackId: 9, artistName: 'Karaoke Stars', trackName: 'Rare Song' }] }
      : { data: [] }));
    assert.equal(await resolveTrackPreview({ id: 'x-2', title: 'Rare Song', artist: 'Rare Band' }), null);
  });

  test('provider fetches time out, and a caller abort stops the retries', async () => {
    const silent = http.createServer(() => {});
    await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(silent.address() as AddressInfo).port}/`;
    try {
      await assert.rejects(politeFetch(url, {}, { maxRetries: 1, timeoutMs: 100 }));
      const aborted = AbortSignal.abort();
      const start = Date.now();
      await assert.rejects(fetchWithTimeout(url, { signal: aborted }, 5000, 2, 500));
      assert.ok(Date.now() - start < 400, 'no backoff after the caller aborted');
    } finally {
      silent.closeAllConnections();
      await new Promise(resolve => silent.close(resolve));
    }
  });
});

describe('HTTP and WebSocket server', () => {
  let testServer;
  let baseUrl;
  let wsUrl;
  const clients = [];

  before(async () => {
    stubPreviewFetch();
    testServer = await new Promise((resolve) => {
      const s = server.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${testServer.address().port}`;
    wsUrl = `ws://127.0.0.1:${testServer.address().port}/ws`;
  });

  after(async () => {
    for (const client of clients) client.close();
    setPreviewFetchForTesting();
    clearPreviewCacheForTesting();
    setMusicProviderForTesting();
    db.flushSync();
    await new Promise(resolve => testServer.close(resolve));
  });

  test('GET /api/preview: 400 for a malformed ref, 302 to a fresh URL, 404 without a preview', async () => {
    assert.equal((await fetch(`${baseUrl}/api/preview/not-a-ref`)).status, 400);
    const redirect = await fetch(`${baseUrl}/api/preview/deezer:555`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), FRESH_URL);
    assert.equal((await fetch(`${baseUrl}/api/preview/deezer:999`, { redirect: 'manual' })).status, 404);
  });

  test('GET /api/preview answers 503 with Retry-After when the provider budget is exhausted', async () => {
    setPreviewFetchForTesting(async () => { throw new ProviderBudgetError(); });
    clearPreviewCacheForTesting();
    try {
      const response = await fetch(`${baseUrl}/api/preview/deezer:4343`, { redirect: 'manual' });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('retry-after'), '5');
    } finally {
      stubPreviewFetch();
    }
  });

  test('security headers are set and X-Powered-By is removed', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!health.headers.get('x-powered-by'));
  });

  test('a disallowed CORS origin gets a 403 JSON error, not a 500', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(response.status, 403);
    assert.ok((await readJson(response).catch(() => null))?.error);
  });

  test('read-only requests do not create users', async () => {
    const userId = `probe-${Date.now()}`;
    assert.equal((await fetch(`${baseUrl}/api/progress`, { headers: { 'X-User-Id': userId } })).status, 200);
    assert.equal(db.findUser(userId), null);
  });

  test('a full hidden list answers 409 with a message the client shows', async () => {
    const userId = `full-${Date.now()}`;
    for (let i = 0; i < MAX_BLACKLIST_ITEMS; i++) db.addBlacklistItem(userId, { name: `Artist ${i}`, type: 'artist' });
    const response = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ name: 'One Too Many', type: 'artist' }),
    });
    assert.equal(response.status, 409);
    assert.match((await readJson(response)).error, /up to 500/);
  });

  test('blacklist DELETE removes by item id, never by matching name', async () => {
    const headers = { 'Content-Type': 'application/json', 'X-User-Id': `bl-${Date.now()}` };
    const added = await readJson(await fetch(`${baseUrl}/api/blacklist`, { method: 'POST', headers, body: JSON.stringify({ name: 'Nickelback', type: 'artist' }) }));
    const byName = await readJson(await fetch(`${baseUrl}/api/blacklist/nickelback`, { method: 'DELETE', headers }));
    assert.equal(byName.blacklist?.length, 1);
    const byId = await readJson(await fetch(`${baseUrl}/api/blacklist/${encodeURIComponent(added.blacklist[0].id)}`, { method: 'DELETE', headers }));
    assert.equal(byId.blacklist?.length, 0);
  });

  test('rooms bind players to sockets: no writes by non-members, no spoofed host, resume only with the token', async () => {
    const mockTracks = ['ALPHA', 'PHASE', 'SHAPE', 'HEART', 'EARTH', 'TEARS', 'STARE', 'RATES'].map((title, index) => ({
      id: `deezer:${index}`, provider: 'deezer', providerTrackId: String(index), providerArtistId: String(index),
      title, artist: `Artist ${index}`, album: 'Mock Album', albumArt: '', audioUrl: `https://cdn.example.test/${index}.mp3`,
      selection: { source: 'deezer', rank: 500000, artistFans: 900000 },
    }));
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });
    const hostId = `host-${Date.now()}`;
    const live = await readJson(await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': hostId },
      body: JSON.stringify({ genre: 'all', targetWords: 6 }),
    }));
    setMusicProviderForTesting();

    const connect = async () => {
      const client = wsTestClient(wsUrl);
      clients.push(client);
      await client.open;
      return client;
    };

    const host = await connect();
    host.send({ action: 'create_room', playerId: hostId, playerName: 'Host', mode: 'coop', livePuzzleToken: live.livePuzzleToken });
    const created = await host.next(m => m.type === 'room_created');
    const roomCode = created.room.code;
    assert.match(roomCode, /^[A-Z]+-\d{4}$/);
    assert.match(created.resumeToken, /^[a-f0-9]{32}$/);

    const intruder = await connect();
    intruder.send({ action: 'coop_cell_update', roomCode, row: 0, col: 0, char: 'X', playerId: hostId });
    assert.match((await intruder.next(m => m.type === 'error')).message, /not a member/i);

    const guest = await connect();
    guest.send({ action: 'join_room', roomCode, playerId: `${hostId}-guest`, playerName: 'Guest' });
    await guest.next(m => m.type === 'room_joined');
    guest.send({ action: 'start_game', roomCode, playerId: hostId });
    assert.match((await guest.next(m => m.type === 'error')).message, /only the host/i);

    const hijacker = await connect();
    hijacker.send({ action: 'join_room', roomCode, playerId: hostId, playerName: 'Mallory' });
    assert.match((await hijacker.next(m => m.type === 'error')).message, /already in this room/i);

    const resumed = await connect();
    resumed.send({ action: 'join_room', roomCode, playerId: hostId, playerName: 'Host', resumeToken: created.resumeToken });
    const join = await resumed.next(m => m.type === 'room_joined');
    assert.equal(join.resumed, true);
    assert.equal(join.room.players.length, 2);

    // The replaced host socket closing must not evict the resumed host
    await new Promise(resolve => setTimeout(resolve, 100));
    resumed.send({ action: 'start_game', roomCode });
    const started = await guest.next(m => m.type === 'game_started');
    assert.equal(started.room.hostId, hostId);
    assert.equal(started.room.players.length, 2);

    resumed.send({ action: 'coop_cell_update', roomCode, row: 0, col: 1, char: 'Q', playerId: 'someone-else', playerColor: '#000000' });
    const cell = await guest.next(m => m.type === 'coop_cell_update');
    assert.equal(cell.playerId, hostId, 'the server-bound identity, not the claimed one');
    assert.equal(cell.playerColor, '#3de0ff');
  });
});

describe('WebSocket limits', () => {
  let limitServer;
  let wsUrl;
  const sockets = [];

  before(async () => {
    limitServer = http.createServer();
    attachMultiplayer(limitServer, { livePuzzles: createLivePuzzleStore(), heartbeatMs: 50 });
    await new Promise<void>(resolve => limitServer.listen(0, '127.0.0.1', resolve));
    wsUrl = `ws://127.0.0.1:${limitServer.address().port}/ws`;
  });

  after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise(resolve => limitServer.close(resolve));
  });

  const open = async (options = {}) => {
    const socket = new WebSocket(wsUrl, options);
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    return socket;
  };
  const closeCode = (socket: WebSocket) => new Promise<number>(resolve => socket.once('close', code => resolve(code)));

  test('a frame over 64 KiB closes the socket with 1009 before it is buffered', async () => {
    const socket = await open();
    const closed = closeCode(socket);
    socket.send('x'.repeat(64 * 1024 + 1));
    assert.equal(await closed, 1009);
  });

  test('a socket that stops answering pings is terminated', async () => {
    const socket = await open({ autoPong: false });
    assert.equal(await closeCode(socket), 1006);
  });

  test('wrong room codes are limited to 10 per minute per IP', async () => {
    const client = wsTestClient(wsUrl);
    sockets.push(client.ws);
    await client.open;
    for (let attempt = 0; attempt < 10; attempt++) {
      client.send({ action: 'join_room', roomCode: `BEAT-${1000 + attempt}`, playerId: 'guesser-1' });
      assert.match((await client.next(m => m.type === 'error')).message, /not found/i);
    }
    client.send({ action: 'join_room', roomCode: 'BEAT-2000', playerId: 'guesser-1' });
    assert.match((await client.next(m => m.type === 'error')).message, /too many attempts/i);
  });
});
