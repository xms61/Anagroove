import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import { blacklistMatchesTrack } from '../../shared/musicIdentity.js';
import { mapDeezerTrack } from '../../server/services/deezerMusicProvider.js';
import { getRandomSongPool, setMusicProviderForTesting } from '../../server/selection/songPool.js';
import { server } from '../../server/server.js';
import { db } from '../../server/db.js';

test('Integration Tests with Ephemeral Server', async () => {
  // Start ephemeral server on random available port
  const testServer = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => {
      resolve(s);
    });
  });

  const address = testServer.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    // Health Check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /api/health responds with 200 ok');

    // Missing X-User-Id rejection
    const unauthRes = await fetch(`${baseUrl}/api/progress`);
    assert(unauthRes.status === 400, 'GET /api/progress without X-User-Id rejected with 400');

    // Invalid X-User-Id format rejection
    const malformedRes = await fetch(`${baseUrl}/api/progress`, {
      headers: { 'X-User-Id': 'invalid ID with spaces!' }
    });
    assert(malformedRes.status === 400, 'GET /api/progress with malformed X-User-Id rejected with 400');

    // Valid progress save & retrieve
    const testUserId = `test_user_${Date.now()}`;
    const saveRes = await fetch(`${baseUrl}/api/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({
        puzzleId: 'test-puz-1',
        themeId: 'rock',
        userLetters: [['T', 'E'], ['S', 'T']],
        validity: [['correct', 'correct'], ['correct', 'correct']]
      })
    });
    const saveData = await saveRes.json();
    assert(saveRes.status === 200 && saveData.success === true, 'POST /api/progress saves state with 200 ok');

    const getRes = await fetch(`${baseUrl}/api/progress`, {
      headers: { 'X-User-Id': testUserId }
    });
    const getData = await getRes.json();
    assert(getData.progress?.puzzleId === 'test-puz-1', 'GET /api/progress retrieves persisted state');

    // Blacklist persistence
    const blPost = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'The Beatles', type: 'artist' })
    });
    assert(blPost.status === 200, 'POST /api/blacklist adds item');

    const blGet = await fetch(`${baseUrl}/api/blacklist`, {
      headers: { 'X-User-Id': testUserId }
    });
    const blData = await blGet.json();
    assert(blData.blacklist.some(b => b.name === 'The Beatles'), 'GET /api/blacklist contains added item');

    const beyonceBlacklist = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'Beyoncé', type: 'artist', provider: 'deezer', providerArtistId: '42' })
    });
    const beyonceGeneric = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'beyonce', type: 'artist' })
    });
    const beyonceSecondScoped = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'BEYONCE', type: 'artist', provider: 'deezer', providerArtistId: '43' })
    });
    const beyonceGenericVariant = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'BEYONCÉ', type: 'artist' })
    });
    const beyonceData = await beyonceGenericVariant.json();
    const beyonceEntries = beyonceData.blacklist.filter(item => item.canonicalKey === 'beyonce');
    const genericBeyonce = beyonceEntries.find(item => !item.provider);
    const scopedBeyonce = beyonceEntries.find(item =>
      item.provider === 'deezer' && item.providerArtistId === '42'
    );
    assert(
      beyonceBlacklist.status === 200 && beyonceGeneric.status === 200 && beyonceSecondScoped.status === 200 &&
      beyonceEntries.length === 3 && genericBeyonce && scopedBeyonce &&
      beyonceEntries.some(item => item.provider === 'deezer' && item.providerArtistId === '43'),
      'Generic and distinct provider-scoped artist blacklist entries coexist'
    );

    const mapped = mapDeezerTrack({
      id: 99,
      title: 'Test Track',
      preview: 'https://cdn.example.test/preview.mp3',
      link: 'https://www.deezer.com/track/99',
      rank: 500000,
      artist: { id: 42, name: 'Beyoncé' },
      album: { title: 'Test Album', cover_medium: 'https://cdn.example.test/cover.jpg' }
    }, { nb_fan: 900000 });
    assert(
      mapped?.artist === 'Beyoncé' && mapped.provider === 'deezer' && mapped.providerTrackId === '99' && mapped.providerArtistId === '42',
      'Deezer mapping preserves display names and provider IDs'
    );
    assert(
      blacklistMatchesTrack([genericBeyonce], { ...mapped, artist: 'BEYONCE', providerArtistId: '43' }) &&
      blacklistMatchesTrack([scopedBeyonce], { ...mapped, artist: 'BEYONCE' }) &&
      !blacklistMatchesTrack([scopedBeyonce], { ...mapped, artist: 'BEYONCE', providerArtistId: '43' }) &&
      !blacklistMatchesTrack([scopedBeyonce], { ...mapped, provider: 'other', artist: 'BEYONCE' }),
      'Generic artists match canonically while scoped artists match exact provider IDs'
    );
    assert(
      !blacklistMatchesTrack(
        [{ type: 'song', name: 'Hello', provider: 'deezer', providerTrackId: '1' }],
        { provider: 'deezer', providerTrackId: '2', title: 'Hello', artist: 'Different Artist' }
      ),
      'Provider-specific blacklist IDs do not block homonyms'
    );

    const [firstSameTitleSong, secondSameTitleSong, genericSong, genericSongVariant] = await Promise.all([
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'Same Title', type: 'song', provider: 'deezer', providerTrackId: '101' })
      }),
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'same-title', type: 'song', provider: 'deezer', providerTrackId: '202' })
      }),
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'same-title', type: 'song' })
      }),
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'Same Title', type: 'song' })
      }),
    ]);
    const songBlacklist = db.getBlacklist(testUserId);
    const sameTitleEntries = songBlacklist.filter(item => item.canonicalKey === 'same title');
    const genericSameTitle = sameTitleEntries.find(item => !item.provider);
    const scopedSameTitle = sameTitleEntries.find(item =>
      item.provider === 'deezer' && item.providerTrackId === '101'
    );
    assert(
      [firstSameTitleSong, secondSameTitleSong, genericSong, genericSongVariant].every(response => response.status === 200) &&
      songBlacklist.filter(item => item.provider === 'deezer' &&
        ['101', '202'].includes(item.providerTrackId)).length === 2 &&
      sameTitleEntries.length === 3 && genericSameTitle && scopedSameTitle &&
      blacklistMatchesTrack([genericSameTitle], {
        provider: 'deezer', providerTrackId: '303', title: 'Same Title', artist: 'Artist Three'
      }) &&
      blacklistMatchesTrack([scopedSameTitle], {
        provider: 'deezer', providerTrackId: '101', title: 'Same Title', artist: 'Artist One'
      }) &&
      !blacklistMatchesTrack([scopedSameTitle], {
        provider: 'deezer', providerTrackId: '202', title: 'Same Title', artist: 'Artist Two'
      }),
      'Generic and provider-scoped songs coexist with exact scoped matching'
    );

    const mockTracks = ['ALPHA', 'PHASE', 'SHAPE', 'HEART', 'EARTH', 'TEARS', 'STARE', 'RATES'].map((title, index) => ({
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
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });
    const filteredPool = await getRandomSongPool({
      count: 5,
      blacklist: [{ type: 'artist', name: 'artist 1' }],
      recentIds: ['deezer:2', 'hit-3']
    });
    assert(
      filteredPool.length === 5 &&
      filteredPool.every(song => song.id !== 'deezer:2' && song.id !== 'deezer:3' && song.providerArtistId !== '1') &&
      filteredPool.some(song => song.artist === '21 pilots'),
      'Provider pool honors recent Deezer and legacy hit IDs without changing artist displays'
    );
    const tierPool = await getRandomSongPool({ count: 7, blacklist: [{ type: 'artist', name: 'artist 1' }], recentIds: ['deezer:2', 'hit-3', 'hit-3'] });
    const tierIds = tierPool.map(song => song.id);
    assert(
      tierPool.length === 7 && tierIds.indexOf('deezer:2') === 5 && tierIds.indexOf('deezer:3') === 6,
      'Recency tiers fill in order: fresh songs first, then once-played, then twice-played, until the pool is full'
    );

    const duplicateAnswerTracks = [
      { ...mockTracks[0], id: 'deezer:duplicate-1', providerTrackId: 'duplicate-1', title: 'Neon', artist: 'Artist One' },
      { ...mockTracks[1], id: 'deezer:duplicate-2', providerTrackId: 'duplicate-2', title: 'Neon', artist: 'Artist Two' },
    ];
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => duplicateAnswerTracks });
    const uniqueAnswerPool = await getRandomSongPool({ count: 2 });
    assert(
      uniqueAnswerPool.length === 1 && uniqueAnswerPool[0].answer === 'NEON',
      'Provider pool excludes tracks that would duplicate a crossword answer'
    );

    // Test deterministic seed hashing & variety mode
    const determinismCatalog = [
      { id: 'deezer:101', providerTrackId: '101', title: 'Solar', artist: 'Band A', fans: 500000, rank: 500000 },
      { id: 'deezer:102', providerTrackId: '102', title: 'Lunar', artist: 'Band B', fans: 500000, rank: 500000 },
      { id: 'deezer:103', providerTrackId: '103', title: 'Cosmic', artist: 'Band A', fans: 500000, rank: 500000 },
      { id: 'deezer:104', providerTrackId: '104', title: 'Astral', artist: 'Band C', fans: 500000, rank: 500000 },
    ];
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => determinismCatalog });
    const seedRun1 = await getRandomSongPool({ seed: 'test-seed-xyz', count: 4 });
    const seedRun2 = await getRandomSongPool({ seed: 'test-seed-xyz', count: 4 });
    assert(
      seedRun1.length === seedRun2.length &&
      seedRun1.every((t, i) => t.id === seedRun2[i].id),
      'Deterministic seed produces identical song selection and ordering'
    );

    // Variety mode check: Band A has 2 songs (Solar, Cosmic), only 1 should be selected
    const bandACount = seedRun1.filter(t => t.artist === 'Band A').length;
    assert(bandACount === 1, 'Variety mode enforces max 1 track per artist by default');

    // Steered artist check: when artist is steered, multiple tracks by that artist are permitted
    const steeredBandARun = await getRandomSongPool({ artist: 'Band A', count: 4 });
    assert(steeredBandARun.filter(t => t.artist === 'Band A').length === 2, 'Steering single artist permits multiple tracks by that artist');

    // Single artist prompt check: verify prompt parsing, multi-track allowance, and 0% artist clue policy
    const singleArtistCatalog = [
      { id: 'deezer:201', providerTrackId: '201', title: 'One More Time', artist: 'Daft Punk', fans: 500000, rank: 500000 },
      { id: 'deezer:202', providerTrackId: '202', title: 'Harder Better Faster', artist: 'Daft Punk', fans: 500000, rank: 500000 },
      { id: 'deezer:203', providerTrackId: '203', title: 'Get Lucky', artist: 'Daft Punk', fans: 500000, rank: 500000 },
      { id: 'deezer:204', providerTrackId: '204', title: 'Around The World', artist: 'Daft Punk', fans: 500000, rank: 500000 },
    ];
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => singleArtistCatalog });
    const singleArtistPool = await getRandomSongPool({ prompt: 'songs by Daft Punk', count: 4 });
    assert(
      singleArtistPool.length === 4 &&
      singleArtistPool.every(t => t.artist === 'Daft Punk'),
      'Single artist prompt "songs by Daft Punk" selects multiple tracks by target artist'
    );
    assert(
      singleArtistPool.every(t => t.clueType !== 'Artist name'),
      'Single artist crossword enforces 0% "Artist name" clues'
    );
    assert(
      singleArtistPool.every(t => t.clueType === 'Song title' || t.clueType === 'Song title keyword'),
      'Single artist crossword produces 100% Song title or Keyword clues'
    );

    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });

    // Clue variance check: ensure the pool produces diverse clue types across questions
    const diversePool = await getRandomSongPool({ count: 6 });
    const clueTypes = new Set(diversePool.map(s => s.clueType));
    assert(clueTypes.size > 1, 'Song pool yields diverse clue types across questions');

    const invalidLive = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ targetWords: 'not-a-number' })
    });
    assert(invalidLive.status === 400, 'POST /api/puzzles/live validates request data');

    const livePuzzle = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ genre: 'all', targetWords: 6, recentIds: [] })
    });
    const livePuzzleData = await livePuzzle.json();
    assert(
      livePuzzle.status === 200 && livePuzzleData.selection?.provider === 'deezer' &&
      typeof livePuzzleData.livePuzzleToken === 'string' &&
      livePuzzleData.puzzle?.clues?.every(clue => clue.song.provider === 'deezer' && clue.song.selection?.source === 'deezer'),
      'POST /api/puzzles/live returns a complete Deezer puzzle payload'
    );

    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => { throw new Error('provider offline'); } });
    const unavailableLive = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ genre: 'all', targetWords: 6 })
    });
    assert(unavailableLive.status === 503, 'Live provider failure returns an error without static fallback');
    setMusicProviderForTesting();

    // WebSocket Room Creation & Messaging
    await new Promise((resolve, reject) => {
      const hostWs = new WebSocket(wsUrl);
      let guestWs = null;
      let roomCode = null;
      let hostGotStart = false;
      let guestGotStart = false;
      let guestGotCellUpdate = false;
      let hostGotRaceProgress = false;

      const timeout = setTimeout(() => {
        hostWs.close();
        if (guestWs) guestWs.close();
        reject(new Error('WebSocket connection timed out'));
      }, 7000);

      hostWs.on('open', () => {
        hostWs.send(JSON.stringify({
          action: 'create_room',
          playerId: testUserId,
          playerName: 'HostTester',
          mode: 'coop',
          livePuzzleToken: livePuzzleData.livePuzzleToken
        }));
      });

      hostWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'room_created') {
            assert(msg.room && msg.room.code, 'WebSocket creates room with code');
            roomCode = msg.room.code;

            // Connect second player (Guest)
            guestWs = new WebSocket(wsUrl);
            guestWs.on('open', () => {
              guestWs.send(JSON.stringify({
                action: 'join_room',
                roomCode,
                playerId: `${testUserId}_guest`,
                playerName: 'GuestTester'
              }));
            });

            guestWs.on('message', (rawGuest) => {
              const guestMsg = JSON.parse(rawGuest.toString());
              if (guestMsg.type === 'room_joined') {
                assert(guestMsg.room && guestMsg.room.players?.length === 2, 'Player 2 successfully joins room');
                // Host starts the game (must send playerId to prove they are the room host)
                hostWs.send(JSON.stringify({
                  action: 'start_game',
                  roomCode,
                  playerId: testUserId
                }));
              }

              if (guestMsg.type === 'game_started') {
                guestGotStart = true;
                if (hostGotStart) checkSyncAfterStart();
              }

              if (guestMsg.type === 'coop_cell_update') {
                if (guestMsg.row === 1 && guestMsg.col === 2 && (guestMsg.char === 'Z' || guestMsg.value === 'Z')) {
                  guestGotCellUpdate = true;
                  assert(true, 'Player 2 receives real-time coop cell update from Player 1');
                  // Guest sends race progress update back to Host
                  guestWs.send(JSON.stringify({
                    action: 'race_progress_update',
                    roomCode,
                    progress: 80,
                    playerId: `${testUserId}_guest`
                  }));
                }
              }
            });

            guestWs.on('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          }

          if (msg.type === 'game_started') {
            hostGotStart = true;
            assert(true, 'Host receives game_started event');
            if (guestGotStart) checkSyncAfterStart();
          }

          if (msg.type === 'race_progress_update') {
            if (msg.progress === 80) {
              hostGotRaceProgress = true;
              assert(true, 'Host receives real-time race progress update from Player 2');
              finishWsTest();
            }
          }
        } catch (e) {
          clearTimeout(timeout);
          hostWs.close();
          if (guestWs) guestWs.close();
          reject(e);
        }
      });

      function checkSyncAfterStart() {
        assert(true, 'Both players receive synchronized game_started event');
        // Host sends cell update
        hostWs.send(JSON.stringify({
          action: 'coop_cell_update',
          roomCode,
          row: 1,
          col: 2,
          char: 'Z',
          value: 'Z',
          playerId: testUserId,
          senderId: testUserId
        }));
      }

      function finishWsTest() {
        if (guestGotCellUpdate && hostGotRaceProgress) {
          clearTimeout(timeout);
          hostWs.close();
          if (guestWs) guestWs.close();
          resolve();
        }
      }

      hostWs.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  } finally {
    // Flush DB and close server
    db.flushSync();
    await new Promise((resolve) => testServer.close(resolve));
  }
});
