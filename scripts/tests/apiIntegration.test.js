import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { blacklistMatchesTrack } from '../../shared/musicIdentity.js';
import { mapDeezerTrack } from '../../server/services/deezerMusicProvider.js';
import { getRandomSongPool, setMusicProviderForTesting } from '../../server/selection/songPool.js';
import { server } from '../../server/server.js';
import { db } from '../../server/db.ts';
import { wsTestClient } from './helpers.js';

const MOCK_TRACKS = ['ALPHA', 'PHASE', 'SHAPE', 'HEART', 'EARTH', 'TEARS', 'STARE', 'RATES'].map((title, index) => ({
  id: `deezer:${index}`,
  provider: 'deezer',
  providerTrackId: String(index),
  providerArtistId: String(index),
  title,
  artist: index === 0 ? '21 pilots' : `Artist ${index}`,
  album: 'Mock Album',
  albumArt: '',
  audioUrl: `https://cdn.example.test/${index}.mp3`,
  providerUrl: `https://www.deezer.com/track/${index}`,
  rank: 500000,
  fans: 900000,
  selection: { source: 'deezer', rank: 500000, artistFans: 900000 },
}));

const useProvider = (tracks) => setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => tracks });
const byArtist = (artist, titles) => titles.map((title, i) => ({ id: `deezer:${artist}-${i}`, providerTrackId: `${artist}-${i}`, title, artist, fans: 500000, rank: 500000 }));

describe('song pool (stubbed provider, catalog bypassed)', () => {
  afterEach(() => setMusicProviderForTesting());

  test('recent Deezer ids, legacy hit- ids and blacklisted artists are left out', async () => {
    useProvider(MOCK_TRACKS);
    const pool = await getRandomSongPool({ count: 5, blacklist: [{ type: 'artist', name: 'artist 1' }], recentIds: ['deezer:2', 'hit-3'] });
    assert.equal(pool.length, 5);
    assert.ok(pool.every(song => !['deezer:2', 'deezer:3'].includes(song.id) && song.providerArtistId !== '1'));
    assert.ok(pool.some(song => song.artist === '21 pilots'), 'artist display names are unchanged');
  });

  test('recency tiers fill fresh songs first, then once-played, then twice-played', async () => {
    useProvider(MOCK_TRACKS);
    const pool = await getRandomSongPool({ count: 7, blacklist: [{ type: 'artist', name: 'artist 1' }], recentIds: ['deezer:2', 'hit-3', 'hit-3'] });
    const ids = pool.map(song => song.id);
    assert.equal(ids.length, 7);
    assert.equal(ids.indexOf('deezer:2'), 5);
    assert.equal(ids.indexOf('deezer:3'), 6);
  });

  test('a track whose answer is already on the grid is skipped', async () => {
    useProvider([
      { ...MOCK_TRACKS[0], id: 'deezer:duplicate-1', providerTrackId: 'duplicate-1', title: 'Neon', artist: 'Artist One' },
      { ...MOCK_TRACKS[1], id: 'deezer:duplicate-2', providerTrackId: 'duplicate-2', title: 'Neon', artist: 'Artist Two' },
    ]);
    const pool = await getRandomSongPool({ count: 2 });
    assert.deepEqual(pool.map(song => song.answer), ['NEON']);
  });

  test('the same seed gives the same songs in the same order, one per artist', async () => {
    useProvider([...byArtist('Band A', ['Solar', 'Cosmic']), ...byArtist('Band B', ['Lunar']), ...byArtist('Band C', ['Astral'])]);
    const first = await getRandomSongPool({ seed: 'test-seed-xyz', count: 4 });
    const second = await getRandomSongPool({ seed: 'test-seed-xyz', count: 4 });
    assert.deepEqual(first.map(t => t.id), second.map(t => t.id));
    assert.equal(first.filter(t => t.artist === 'Band A').length, 1);
  });

  test('a steered artist may appear several times', async () => {
    useProvider([...byArtist('Band A', ['Solar', 'Cosmic']), ...byArtist('Band B', ['Lunar'])]);
    const pool = await getRandomSongPool({ artist: 'Band A', count: 4 });
    assert.equal(pool.filter(t => t.artist === 'Band A').length, 2);
  });

  test('"songs by Daft Punk" picks only Daft Punk and never uses artist-name clues', async () => {
    useProvider(byArtist('Daft Punk', ['One More Time', 'Harder Better Faster', 'Get Lucky', 'Around The World']));
    const pool = await getRandomSongPool({ prompt: 'songs by Daft Punk', count: 4 });
    assert.equal(pool.length, 4);
    assert.ok(pool.every(t => t.artist === 'Daft Punk'));
    assert.ok(pool.every(t => t.clueType === 'Song title' || t.clueType === 'Song title keyword'));
  });

  test('a mixed pool rotates clue types', async () => {
    useProvider(MOCK_TRACKS);
    const pool = await getRandomSongPool({ count: 6 });
    assert.ok(new Set(pool.map(s => s.clueType)).size > 1);
  });
});

test('generic blacklist entries match canonically; provider-scoped ones match the exact id', () => {
  const track = mapDeezerTrack({
    id: 99, title: 'Test Track', preview: 'https://cdn.example.test/preview.mp3', link: 'https://www.deezer.com/track/99', rank: 500000,
    artist: { id: 42, name: 'Beyoncé' }, album: { title: 'Test Album', cover_medium: 'https://cdn.example.test/cover.jpg' },
  }, { nb_fan: 900000 });
  assert.equal(track?.artist, 'Beyoncé');
  assert.equal(track.providerTrackId, '99');
  assert.equal(track.providerArtistId, '42');

  const generic = { type: 'artist', name: 'beyonce', canonicalKey: 'beyonce' };
  const scoped = { type: 'artist', name: 'Beyoncé', canonicalKey: 'beyonce', provider: 'deezer', providerArtistId: '42' };
  assert.ok(blacklistMatchesTrack([generic], { ...track, artist: 'BEYONCE', providerArtistId: '43' }));
  assert.ok(blacklistMatchesTrack([scoped], { ...track, artist: 'BEYONCE' }));
  assert.ok(!blacklistMatchesTrack([scoped], { ...track, artist: 'BEYONCE', providerArtistId: '43' }));
  assert.ok(!blacklistMatchesTrack([scoped], { ...track, provider: 'other', artist: 'BEYONCE' }));
  assert.ok(!blacklistMatchesTrack(
    [{ type: 'song', name: 'Hello', provider: 'deezer', providerTrackId: '1' }],
    { provider: 'deezer', providerTrackId: '2', title: 'Hello', artist: 'Different Artist' }
  ), 'a scoped song does not block a homonym');
});

describe('REST API and WebSocket rooms', () => {
  let testServer;
  let baseUrl;
  let wsUrl;
  const userId = `test_user_${Date.now()}`;
  const clients = [];
  const post = (path, body, headers = {}) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId, ...headers },
    body: JSON.stringify(body),
  });

  before(async () => {
    testServer = await new Promise((resolve) => {
      const s = server.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${testServer.address().port}`;
    wsUrl = `ws://127.0.0.1:${testServer.address().port}/ws`;
  });

  after(async () => {
    for (const client of clients) client.close();
    setMusicProviderForTesting();
    db.flushSync();
    await new Promise(resolve => testServer.close(resolve));
  });

  test('GET /api/health is ok', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  });

  test('a missing or malformed X-User-Id is rejected with 400', async () => {
    assert.equal((await fetch(`${baseUrl}/api/progress`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/progress`, { headers: { 'X-User-Id': 'invalid ID with spaces!' } })).status, 400);
  });

  test('progress is saved and read back', async () => {
    const saved = await post('/api/progress', {
      puzzleId: 'test-puz-1', themeId: 'rock', userLetters: [['T', 'E'], ['S', 'T']], validity: [['correct', 'correct'], ['correct', 'correct']],
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).success, true);
    const read = await (await fetch(`${baseUrl}/api/progress`, { headers: { 'X-User-Id': userId } })).json();
    assert.equal(read.progress?.puzzleId, 'test-puz-1');
  });

  test('a generic artist entry and distinct provider-scoped entries coexist', async () => {
    assert.equal((await post('/api/blacklist', { name: 'The Beatles', type: 'artist' })).status, 200);
    const listed = await (await fetch(`${baseUrl}/api/blacklist`, { headers: { 'X-User-Id': userId } })).json();
    assert.ok(listed.blacklist.some(b => b.name === 'The Beatles'));

    for (const body of [
      { name: 'Beyoncé', type: 'artist', provider: 'deezer', providerArtistId: '42' },
      { name: 'beyonce', type: 'artist' },
      { name: 'BEYONCE', type: 'artist', provider: 'deezer', providerArtistId: '43' },
    ]) assert.equal((await post('/api/blacklist', body)).status, 200);
    const last = await (await post('/api/blacklist', { name: 'BEYONCÉ', type: 'artist' })).json();
    const entries = last.blacklist.filter(item => item.canonicalKey === 'beyonce');
    assert.equal(entries.length, 3, 'the second generic spelling is a duplicate');
    assert.deepEqual(entries.map(item => item.providerArtistId ?? null).sort(), ['42', '43', null].sort());
  });

  test('generic and provider-scoped song entries coexist, and scoped ones match only their id', async () => {
    const responses = await Promise.all([
      post('/api/blacklist', { name: 'Same Title', type: 'song', provider: 'deezer', providerTrackId: '101' }),
      post('/api/blacklist', { name: 'same-title', type: 'song', provider: 'deezer', providerTrackId: '202' }),
      post('/api/blacklist', { name: 'same-title', type: 'song' }),
      post('/api/blacklist', { name: 'Same Title', type: 'song' }),
    ]);
    assert.ok(responses.every(response => response.status === 200));

    const entries = db.getBlacklist(userId).filter(item => item.canonicalKey === 'same title');
    assert.equal(entries.length, 3);
    const generic = entries.find(item => !item.provider);
    const scoped = entries.find(item => item.providerTrackId === '101');
    assert.ok(blacklistMatchesTrack([generic], { provider: 'deezer', providerTrackId: '303', title: 'Same Title', artist: 'Artist Three' }));
    assert.ok(blacklistMatchesTrack([scoped], { provider: 'deezer', providerTrackId: '101', title: 'Same Title', artist: 'Artist One' }));
    assert.ok(!blacklistMatchesTrack([scoped], { provider: 'deezer', providerTrackId: '202', title: 'Same Title', artist: 'Artist Two' }));
  });

  test('POST /api/puzzles/live: 400 on bad input, a full puzzle, 503 when the provider is down', async () => {
    assert.equal((await post('/api/puzzles/live', { targetWords: 'not-a-number' })).status, 400);

    useProvider(MOCK_TRACKS);
    const response = await post('/api/puzzles/live', { genre: 'all', targetWords: 6, recentIds: [] });
    const live = await response.json();
    assert.equal(response.status, 200);
    assert.equal(live.selection?.provider, 'deezer');
    assert.equal(typeof live.livePuzzleToken, 'string');
    assert.ok(live.puzzle?.clues?.every(clue => clue.song.provider === 'deezer' && clue.song.selection?.source === 'deezer'));

    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => { throw new Error('provider offline'); } });
    assert.equal((await post('/api/puzzles/live', { genre: 'all', targetWords: 6 })).status, 503);
    setMusicProviderForTesting();
  });

  test('a co-op room syncs the start, cell updates and race progress between two players', async () => {
    useProvider(MOCK_TRACKS);
    const live = await (await post('/api/puzzles/live', { genre: 'all', targetWords: 6 })).json();
    setMusicProviderForTesting();

    const connect = async () => {
      const client = wsTestClient(wsUrl);
      clients.push(client);
      await client.open;
      return client;
    };
    const host = await connect();
    host.send({ action: 'create_room', playerId: userId, playerName: 'HostTester', mode: 'coop', livePuzzleToken: live.livePuzzleToken });
    const roomCode = (await host.next(m => m.type === 'room_created')).room.code;

    const guest = await connect();
    guest.send({ action: 'join_room', roomCode, playerId: `${userId}_guest`, playerName: 'GuestTester' });
    assert.equal((await guest.next(m => m.type === 'room_joined')).room.players.length, 2);

    host.send({ action: 'start_game', roomCode, playerId: userId });
    await Promise.all([host.next(m => m.type === 'game_started'), guest.next(m => m.type === 'game_started')]);

    host.send({ action: 'coop_cell_update', roomCode, row: 1, col: 2, char: 'Z', playerId: userId });
    const cell = await guest.next(m => m.type === 'coop_cell_update');
    assert.deepEqual([cell.row, cell.col, cell.char], [1, 2, 'Z']);

    guest.send({ action: 'race_progress_update', roomCode, progress: 80, playerId: `${userId}_guest` });
    assert.equal((await host.next(m => m.type === 'race_progress_update')).progress, 80);
  });
});
