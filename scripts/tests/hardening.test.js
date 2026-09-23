import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setMusicProviderForTesting } from '../../server/selection/songPool.js';
import { validatePreviewRef } from '../../server/validators.js';
import { server, parseTrustProxy, clientIpFromUpgrade } from '../../server/server.js';
import { db } from '../../server/db.ts';
import {
  resolveTrackPreview,
  clearPreviewCacheForTesting,
  parsePreviewExpiry,
  isPreviewUrlFresh,
  parsePreviewRef,
  previewRefForTrack,
  resolvePreviewRef,
  setPreviewFetchForTesting,
} from '../../server/services/previewResolver.js';
import { mockJsonResponse, wsTestClient } from './helpers.js';

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
  const upgrade = { socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } };
  assert.equal(clientIpFromUpgrade(upgrade, false), '10.0.0.5', 'X-Forwarded-For is ignored without a trusted proxy');
  assert.equal(clientIpFromUpgrade(upgrade, 1), '203.0.113.9', 'one trusted hop: the entry it appended');
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

  test('security headers are set and X-Powered-By is removed', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!health.headers.get('x-powered-by'));
  });

  test('a disallowed CORS origin gets a 403 JSON error, not a 500', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(response.status, 403);
    assert.ok((await response.json().catch(() => null))?.error);
  });

  test('read-only requests do not create users', async () => {
    const userId = `probe-${Date.now()}`;
    assert.equal((await fetch(`${baseUrl}/api/progress`, { headers: { 'X-User-Id': userId } })).status, 200);
    assert.equal(db.findUser(userId), null);
  });

  test('blacklist DELETE removes by item id, never by matching name', async () => {
    const headers = { 'Content-Type': 'application/json', 'X-User-Id': `bl-${Date.now()}` };
    const added = await (await fetch(`${baseUrl}/api/blacklist`, { method: 'POST', headers, body: JSON.stringify({ name: 'Nickelback', type: 'artist' }) })).json();
    const byName = await (await fetch(`${baseUrl}/api/blacklist/nickelback`, { method: 'DELETE', headers })).json();
    assert.equal(byName.blacklist?.length, 1);
    const byId = await (await fetch(`${baseUrl}/api/blacklist/${encodeURIComponent(added.blacklist[0].id)}`, { method: 'DELETE', headers })).json();
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
    const live = await (await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': hostId },
      body: JSON.stringify({ genre: 'all', targetWords: 6 }),
    })).json();
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
    assert.equal(cell.playerColor, '#1db954');
  });
});
