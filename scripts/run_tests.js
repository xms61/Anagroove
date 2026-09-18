import WebSocket from 'ws';
import { shuffleArray } from '../shared/shuffle.js';
import { extractAnswerKeyword } from '../shared/musicKeywords.js';
import {
  blacklistIdentityKey,
  blacklistMatchesTrack,
  canonicalArtistKey,
  toCrosswordAnswer,
} from '../shared/musicIdentity.js';
import {
  deezerMusicProvider,
  DEEZER_GENRE_TAXONOMY,
  getDeezerCacheStatsForTesting,
  mapDeezerTrack,
  resetDeezerCachesForTesting,
} from '../server/services/deezerMusicProvider.js';
import { mapItunesTrack } from '../server/services/itunesMusicProvider.js';
import { parsePrompt, buildQueryPlan } from '../server/services/queryBuilder.js';
import { getRandomSongPool, setMusicProviderForTesting } from '../server/services/musicService.js';
import {
  validateUserId,
  validateProgressPayload,
  validateHistoryPayload,
  validateBlacklistPayload,
  validateMusicQuery,
  validateLivePuzzlePayload,
  validateWsMessage
} from '../server/validators.js';
import { createLivePuzzleStore, server } from '../server/server.js';
import { db } from '../server/db.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runUnitTests() {
  console.log('\n--- 1. Testing Unbiased Fisher-Yates Shuffle ---');
  const empty = shuffleArray([]);
  assert(Array.isArray(empty) && empty.length === 0, 'Handles empty array');

  const single = shuffleArray([42]);
  assert(single.length === 1 && single[0] === 42, 'Handles single element array');

  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shuffled = shuffleArray(original);
  assert(shuffled.length === original.length, 'Preserves total array length');
  assert(original.every(x => shuffled.includes(x)), 'Preserves all original elements');

  // Verify non-deterministic behavior across multiple runs
  let differences = 0;
  for (let i = 0; i < 5; i++) {
    const s = shuffleArray(original);
    if (s.some((val, idx) => val !== original[idx])) {
      differences++;
    }
  }
  assert(differences > 0, 'Produces randomized permutations across runs');

  console.log('\n--- 2. Testing Canonical Keyword Extraction ---');
  const singleWord = extractAnswerKeyword('Hello', 'Adele');
  assert(singleWord?.answer === 'HELLO' && singleWord.clueType === 'Song title', 'Extracts single-word title keyword');

  const featTrack = extractAnswerKeyword('Stay (feat. Justin Bieber)', 'The Kid LAROI');
  assert(featTrack?.answer === 'STAY', 'Strips (feat. ...) and extracts clean title');

  const combinedTrack = extractAnswerKeyword('Your Love', 'The Outfield');
  assert(combinedTrack?.answer === 'YOURLOVE' && combinedTrack.clueType === 'Song title', 'Combines multi-word title up to 16 characters');

  const longBoundTrack = extractAnswerKeyword("Don't Stop Believin'", 'Journey');
  assert(longBoundTrack?.answer === 'DONTSTOPBELIEVIN' && longBoundTrack.answer.length === 16, 'Permits combined titles up to 16 characters');

  const multiWordTooLong = extractAnswerKeyword('Smells Like Teen Spirit', 'Nirvana');
  assert(multiWordTooLong?.answer === 'NIRVANA' && multiWordTooLong.clueType === 'Artist name', 'Falls back to artist for titles exceeding 16 characters');

  const nullResult = extractAnswerKeyword('', '');
  assert(nullResult === null, 'Returns null on empty input');
  assert(canonicalArtistKey('  21 PILOTS  ') === '21 pilots', 'Artist identity preserves numeric tokens');
  assert(canonicalArtistKey('Beyoncé') === canonicalArtistKey('BEYONCE'), 'Artist identity folds case and diacritics');
  assert(toCrosswordAnswer('Beyoncé') === 'BEYONCE', 'Artist answers remove diacritics without truncation');
  assert(toCrosswordAnswer('21 pilots') === '21PILOTS', 'Artist answers retain every numeric and word token');
  assert(toCrosswordAnswer('東京') === null, 'Rejects unsupported crossword answers instead of corrupting them');

  const migrationIdentityKeys = new Set([
    { type: 'song', name: 'Same Title' },
    { type: 'song', name: 'Same Title', provider: 'deezer', providerTrackId: '101' },
    { type: 'song', name: 'same-title', provider: 'deezer', providerTrackId: '202' },
    { type: 'artist', name: 'Beyoncé' },
    { type: 'artist', name: 'beyonce', provider: 'deezer', providerArtistId: '42' },
  ].map(blacklistIdentityKey));
  assert(
    migrationIdentityKeys.size === 5,
    'Blacklist migration identities retain generic and distinct provider-scoped entries'
  );

  console.log('\n--- 3. Testing Backend Input Validators ---');
  assert(validateUserId('valid_user-123') === 'valid_user-123', 'Accepts valid user ID format');
  assert(validateUserId('bad user!') === null, 'Rejects user ID with spaces and punctuation');
  assert(validateUserId('x') === null, 'Rejects too short user ID (<3 chars)');
  assert(validateUserId('a'.repeat(65)) === null, 'Rejects too long user ID (>64 chars)');

  const validProgress = validateProgressPayload({
    puzzleId: 'puzzle-1',
    userLetters: [['A', 'B'], ['C', 'D']]
  });
  assert(validProgress.valid === true, 'Accepts valid progress grid');

  const invalidProgress = validateProgressPayload({
    puzzleId: 'puzzle-1',
    userLetters: [['TOOLONG', 'B']]
  });
  assert(invalidProgress.valid === false, 'Rejects multi-character cell content');

  const validBl = validateBlacklistPayload({ name: 'Coldplay', type: 'artist' });
  assert(validBl.valid === true, 'Accepts valid blacklist payload');

  const invalidBl = validateBlacklistPayload({ name: 'Coldplay', type: 'album' });
  assert(invalidBl.valid === false, 'Rejects invalid blacklist type');

  const validHist = validateHistoryPayload({ puzzleId: 'p-1', title: 'Great Hit', cluesCount: 10, timeSeconds: 120 });
  assert(validHist.valid === true, 'Accepts valid history payload');

  const invalidHist = validateHistoryPayload({ puzzleId: 'p-1', cluesCount: -5 });
  assert(invalidHist.valid === false, 'Rejects negative clues count in history');

  const validQuery = validateMusicQuery({ genre: 'rock', minFans: '500000', count: '15', recent: 'a,b,c' });
  assert(validQuery.genre === 'rock' && validQuery.count === 15 && validQuery.recentIds.length === 3, 'Sanitizes and parses music query parameters');
  assert(validateLivePuzzlePayload({ targetWords: 'bad' }).valid === false, 'Rejects malformed live-puzzle requests');

  const validWs = validateWsMessage({
    action: 'create_room',
    playerId: 'host_123',
    playerName: 'Alice',
    mode: 'coop',
    livePuzzleToken: '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  });
  assert(validWs.valid === true, 'Accepts valid WebSocket action');

  const invalidWs = validateWsMessage({
    action: 'malicious_action',
    playerId: 'user_1'
  });
  assert(invalidWs.valid === false, 'Rejects unlisted WebSocket action');

  console.log('\n--- 3b. Testing Live Mode Genre Taxonomy & Catalog Parity ---');
  const catalogThemes = [
    'mixed', 'kpop', 'anime', 'gaming', 'pop', 'rock',
    'hiphop', 'edm', 'cinematic', 'latin', 'poppunk'
  ];
  for (const theme of catalogThemes) {
    const puzValidation = validateLivePuzzlePayload({ genre: theme });
    assert(puzValidation.valid && puzValidation.data.genre === theme, `validateLivePuzzlePayload accepts genre '${theme}'`);
    const conf = DEEZER_GENRE_TAXONOMY[theme];
    assert(
      conf && (conf.chartId !== undefined || conf.searches?.length > 0) && conf.minFans > 0 && conf.minRank > 0,
      `DEEZER_GENRE_TAXONOMY defines viable configuration for catalog theme '${theme}'`
    );
  }
  assert(Boolean(DEEZER_GENRE_TAXONOMY.all && DEEZER_GENRE_TAXONOMY.electronic), 'Backward compatibility aliases all and electronic exist');

  console.log('\n--- 3c. Testing Prompt Parsing, iTunes Mapping & Steered Query Builder ---');
  const parsedPrompt = parsePrompt('obscure 80s synth-pop by Daft Punk');
  assert(parsedPrompt.popularity === 'obscure', 'Parses obscure popularity modifier');
  assert(parsedPrompt.decade === '1980s', 'Parses 80s decade into 1980s');
  assert(parsedPrompt.artist === 'Daft Punk', 'Parses artist from directive "by Daft Punk"');
  assert(parsedPrompt.genre === 'synth-pop', 'Extracts remaining theme as genre');

  const purePlan = buildQueryPlan({ popularity: 'pure' });
  assert(purePlan.popularity === 'pure' && purePlan.minFans === 0 && purePlan.minRank === 0, 'Pure mode clears popularity filters');
  assert(purePlan.deezerSearches.length > 0, 'Pure mode injects entropy search seeds');

  const itunesSample = {
    trackId: 12345,
    trackName: 'Midnight City',
    artistName: 'M83',
    previewUrl: 'https://audio.itunes.com/preview.m4a',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
    collectionName: 'Hurry Up, We Are Dreaming'
  };
  const mappedItunes = mapItunesTrack(itunesSample);
  assert(mappedItunes?.id === 'itunes:12345' && mappedItunes?.provider === 'itunes', 'Maps iTunes track format');
  assert(mappedItunes?.albumArt?.includes('600x600bb'), 'Scales iTunes artwork to 600x600');
  assert(mapItunesTrack({ trackId: 999 }) === null, 'Rejects iTunes track missing preview or title');

  console.log('\n--- 4. Testing Deezer Provider Resilience and Cache Bounds ---');
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
}

async function runIntegrationTests() {
  console.log('\n--- 5. Running Integration Tests with Ephemeral Server ---');

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
      count: 8,
      blacklist: [{ type: 'artist', name: 'artist 1' }],
      recentIds: ['deezer:2', 'hit-3']
    });
    assert(
      filteredPool.every(song => song.id !== 'deezer:2' && song.id !== 'deezer:3' && song.providerArtistId !== '1') &&
      filteredPool.some(song => song.artist === '21 pilots'),
      'Provider pool honors recent Deezer and legacy hit IDs without changing artist displays'
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

    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });

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
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          action: 'create_room',
          playerId: testUserId,
          playerName: 'Tester',
          mode: 'coop',
          livePuzzleToken: livePuzzleData.livePuzzleToken
        }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'room_created') {
            assert(msg.room && msg.room.code, 'WebSocket creates room with code');
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch (e) {
          clearTimeout(timeout);
          ws.close();
          reject(e);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  } finally {
    // Flush DB and close server
    db.flushSync();
    await new Promise((resolve) => testServer.close(resolve));
  }
}

async function main() {
  console.log('🚀 Starting SpotySpice CI-Friendly Automated Test Suite...');
  const startTime = Date.now();

  try {
    await runUnitTests();
    await runIntegrationTests();
  } catch (err) {
    console.error('Fatal test execution error:', err);
    failedCount++;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n========================================');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed (${duration}s)`);
  console.log('========================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

main();
