import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setMusicProviderForTesting } from '../../server/selection/songPool.js';
import { validatePreviewRef } from '../../server/validators.js';
import { server, parseTrustProxy, clientIpFromUpgrade } from '../../server/server.js';
import { db } from '../../server/db.js';
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

test('Stable Previews, HTTP Hardening & Multiplayer Authorization', async () => {
  // 1. Signed preview expiry parsing
  const nowSec = Math.floor(Date.now() / 1000);
  const signed = (expSec) => `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=exp=${expSec}~acl=/api/1/1/a/b/c/0/abc.mp3*~data=user_id=0,application_id=42~hmac=deadbeef`;
  assert(parsePreviewExpiry(signed(1789817437)) === 1789817437000, 'Parses Deezer hdnea expiry into epoch milliseconds');
  assert(parsePreviewExpiry('https://audio-ssl.itunes.apple.com/preview.m4a') === null, 'Unsigned iTunes preview has no expiry');
  assert(isPreviewUrlFresh(signed(nowSec - 60)) === false, 'Expired signed Deezer URL is not fresh');
  assert(isPreviewUrlFresh(signed(nowSec + 30)) === false, 'Signed URL inside the safety margin is treated as stale');
  assert(isPreviewUrlFresh(signed(nowSec + 600)) === true, 'Signed URL valid for 10 minutes is fresh');
  assert(isPreviewUrlFresh('https://audio-ssl.itunes.apple.com/preview.m4a') === true, 'Unsigned https URL is fresh');
  assert(isPreviewUrlFresh('/audio/anime/op.ogg') === false, 'Relative paths are not remote preview URLs');

  // 2. Stable preview references
  assert(parsePreviewRef('deezer:3135556')?.ref === 'deezer:3135556', 'Parses deezer preview ref');
  assert(parsePreviewRef('spotify:1') === null && parsePreviewRef('deezer:12a') === null, 'Rejects unknown providers and non-numeric ids');
  assert(validatePreviewRef('itunes:42') === 'itunes:42' && validatePreviewRef('../etc/passwd') === null, 'Validator only accepts provider:id refs');
  assert(previewRefForTrack({ id: 'sqlite:5', provider: 'deezer', providerTrackId: '5', deezer_id: '77' }) === 'deezer:77', 'Catalog track prefers its cross-referenced Deezer id');
  assert(previewRefForTrack({ id: 'sqlite:5', itunes_id: '88' }) === 'itunes:88', 'Catalog track falls back to its iTunes id');
  assert(previewRefForTrack({ id: 'sqlite:5' }) === 'catalog:5', 'Catalog track without provider ids uses catalog ref');
  assert(previewRefForTrack({ id: 'deezer:9', provider: 'deezer', providerTrackId: '9' }) === 'deezer:9', 'Live Deezer track keeps provider ref');
  assert(previewRefForTrack({ id: 'x', provider: 'spotify', providerTrackId: '1' }) === null, 'Unsupported provider yields no ref');

  // 3. Resolver ignores expired URLs and re-mints via Deezer
  clearPreviewCacheForTesting();
  const freshUrl = signed(nowSec + 900);
  const fetchedUrls = [];
  setPreviewFetchForTesting(async (url) => {
    fetchedUrls.push(url);
    if (url.endsWith('/track/555') || url.endsWith('/track/777')) return mockJsonResponse({ id: 555, preview: freshUrl, title: 'Song', artist: { name: 'Band' } });
    if (url.endsWith('/track/556')) return mockJsonResponse({ id: 556, preview: '', title: 'Rare Song', artist: { name: 'Rare Band' } });
    if (url.endsWith('/track/999')) return mockJsonResponse({ error: { type: 'DataException', message: 'no data' } });
    if (url.includes('api.deezer.com/search')) return mockJsonResponse({ data: [{ id: 1557, preview: freshUrl, title: 'Rare Song (Live)', artist: { name: 'Other Band' } }, { id: 1556, preview: freshUrl, title: 'Rare Song', artist: { name: 'Rare Band' } }] });
    return mockJsonResponse({ results: [] });
  });

  const reminted = await resolveTrackPreview({ id: 'x-1', title: 'Song', artist: 'Band', deezer_id: '555', sample_url: signed(nowSec - 3600) });
  assert(reminted?.url === freshUrl && reminted.source === 'deezer_fast_path', 'Expired stored sample is re-minted through the Deezer track API');

  clearPreviewCacheForTesting();
  fetchedUrls.length = 0;
  assert(await resolvePreviewRef('deezer:555') === freshUrl, 'resolvePreviewRef returns a fresh Deezer URL');
  assert(await resolvePreviewRef('deezer:555') === freshUrl && fetchedUrls.length === 1, 'resolvePreviewRef caches until the signed URL nears expiry');
  assert(await resolvePreviewRef('deezer:556') === freshUrl, 'Deezer track without preview falls back to search');
  assert(await resolvePreviewRef('deezer:999') === null, 'Unknown Deezer track resolves to null');
  const fakeCatalog = { getPreviewLookup: (id) => (id === 7 ? { id: 7, title: 'Song', artist: 'Band', isrc: null, deezer_id: '777' } : null) };
  assert(await resolvePreviewRef('catalog:7', { catalog: fakeCatalog }) === freshUrl, 'Catalog ref resolves through its Deezer id');
  assert(await resolvePreviewRef('catalog:8', { catalog: fakeCatalog }) === null, 'Missing catalog row resolves to null');

  // 4. Proxy trust helpers
  assert(parseTrustProxy(undefined) === false && parseTrustProxy('false') === false, 'TRUST_PROXY unset disables proxy trust');
  assert(parseTrustProxy('1') === 1 && parseTrustProxy('true') === true && parseTrustProxy('loopback') === 'loopback', 'TRUST_PROXY parses hop counts, booleans and names');
  const upgradeReq = { socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } };
  assert(clientIpFromUpgrade(upgradeReq, false) === '10.0.0.5', 'WS client IP ignores X-Forwarded-For without trusted proxy');
  assert(clientIpFromUpgrade(upgradeReq, 1) === '203.0.113.9', 'WS client IP takes the entry appended by one trusted hop');

  // 5. HTTP hardening on an ephemeral server
  const testServer = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = testServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients = [];

  try {
    const badRef = await fetch(`${baseUrl}/api/preview/not-a-ref`);
    assert(badRef.status === 400, 'GET /api/preview rejects malformed refs with 400');

    const redirect = await fetch(`${baseUrl}/api/preview/deezer:555`, { redirect: 'manual' });
    assert(redirect.status === 302 && redirect.headers.get('location') === freshUrl, 'GET /api/preview redirects to a fresh signed URL');

    const missing = await fetch(`${baseUrl}/api/preview/deezer:999`, { redirect: 'manual' });
    assert(missing.status === 404, 'GET /api/preview returns 404 when no preview exists');

    const health = await fetch(`${baseUrl}/api/health`);
    assert(health.headers.get('x-content-type-options') === 'nosniff' && !health.headers.get('x-powered-by'), 'Security headers set and X-Powered-By removed');

    const corsBlocked = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } });
    const corsBody = await corsBlocked.json().catch(() => null);
    assert(corsBlocked.status === 403 && corsBody?.error, 'Disallowed CORS origin gets a 403 JSON error instead of a 500');

    const readOnlyUser = `probe-${Date.now()}`;
    const progressRead = await fetch(`${baseUrl}/api/progress`, { headers: { 'X-User-Id': readOnlyUser } });
    assert(progressRead.status === 200 && db.findUser(readOnlyUser) === null, 'Read-only requests do not create users in the store');

    const blUser = `bl-${Date.now()}`;
    const blHeaders = { 'Content-Type': 'application/json', 'X-User-Id': blUser };
    const added = await (await fetch(`${baseUrl}/api/blacklist`, { method: 'POST', headers: blHeaders, body: JSON.stringify({ name: 'Nickelback', type: 'artist' }) })).json();
    const itemId = added.blacklist?.[0]?.id;
    const byName = await (await fetch(`${baseUrl}/api/blacklist/nickelback`, { method: 'DELETE', headers: blHeaders })).json();
    assert(byName.blacklist?.length === 1, 'Blacklist DELETE does not remove items by matching name');
    const byId = await (await fetch(`${baseUrl}/api/blacklist/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: blHeaders })).json();
    assert(byId.blacklist?.length === 0, 'Blacklist DELETE removes the item by id');

    // 6. Multiplayer authorization
    const mockTracks = ['ALPHA', 'PHASE', 'SHAPE', 'HEART', 'EARTH', 'TEARS', 'STARE', 'RATES'].map((title, index) => ({
      id: `deezer:${index}`,
      provider: 'deezer',
      providerTrackId: String(index),
      providerArtistId: String(index),
      title,
      artist: `Artist ${index}`,
      album: 'Mock Album',
      albumArt: '',
      audioUrl: `https://cdn.example.test/${index}.mp3`,
      selection: { source: 'deezer', rank: 500000, artistFans: 900000 },
    }));
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });
    const hostId = `host-${Date.now()}`;
    const liveRes = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': hostId },
      body: JSON.stringify({ genre: 'all', targetWords: 6 }),
    });
    const live = await liveRes.json();
    setMusicProviderForTesting();

    const host = wsTestClient(wsUrl);
    clients.push(host);
    await host.open;
    host.send({ action: 'create_room', playerId: hostId, playerName: 'Host', mode: 'coop', livePuzzleToken: live.livePuzzleToken });
    const created = await host.next(m => m.type === 'room_created');
    const roomCode = created.room.code;
    assert(/^[A-Z]+-\d{4}$/.test(roomCode) && /^[a-f0-9]{32}$/.test(created.resumeToken), 'Room uses a 4-digit code and issues a resume token');

    const intruder = wsTestClient(wsUrl);
    clients.push(intruder);
    await intruder.open;
    intruder.send({ action: 'coop_cell_update', roomCode, row: 0, col: 0, char: 'X', playerId: hostId });
    const intruderErr = await intruder.next(m => m.type === 'error');
    assert(/not a member/i.test(intruderErr.message), 'Non-members cannot write cells into a room');

    const guest = wsTestClient(wsUrl);
    clients.push(guest);
    await guest.open;
    guest.send({ action: 'join_room', roomCode, playerId: `${hostId}-guest`, playerName: 'Guest' });
    await guest.next(m => m.type === 'room_joined');
    guest.send({ action: 'start_game', roomCode, playerId: hostId });
    const spoofErr = await guest.next(m => m.type === 'error');
    assert(/only the host/i.test(spoofErr.message), 'Guest cannot start the game by spoofing the host playerId');

    const hijacker = wsTestClient(wsUrl);
    clients.push(hijacker);
    await hijacker.open;
    hijacker.send({ action: 'join_room', roomCode, playerId: hostId, playerName: 'Mallory' });
    const hijackErr = await hijacker.next(m => m.type === 'error');
    assert(/already in this room/i.test(hijackErr.message), 'Joining with another player id without its resume token is rejected');

    const resumed = wsTestClient(wsUrl);
    clients.push(resumed);
    await resumed.open;
    resumed.send({ action: 'join_room', roomCode, playerId: hostId, playerName: 'Host', resumeToken: created.resumeToken });
    const resumedJoin = await resumed.next(m => m.type === 'room_joined');
    assert(resumedJoin.resumed === true && resumedJoin.room.players.length === 2, 'Host resumes its seat with the resume token');

    await new Promise(resolve => setTimeout(resolve, 100));
    resumed.send({ action: 'start_game', roomCode });
    const started = await guest.next(m => m.type === 'game_started');
    assert(started.room.hostId === hostId && started.room.players.length === 2, 'Replaced socket closing does not evict the resumed host');

    resumed.send({ action: 'coop_cell_update', roomCode, row: 0, col: 1, char: 'Q', playerId: 'someone-else', playerColor: '#000000' });
    const cell = await guest.next(m => m.type === 'coop_cell_update');
    assert(cell.playerId === hostId && cell.playerColor === '#1db954', 'Cell updates carry the server-bound identity and color');
  } catch (err) {
    assert(false, `Phase 1 hardening flow failed: ${err.message}`);
  } finally {
    for (const client of clients) client.close();
    setPreviewFetchForTesting();
    clearPreviewCacheForTesting();
    setMusicProviderForTesting();
    db.flushSync();
    await new Promise(resolve => testServer.close(resolve));
  }
});
