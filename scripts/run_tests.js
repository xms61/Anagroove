import WebSocket from 'ws';
import { shuffleArray } from '../shared/shuffle.js';
import { extractAnswerKeyword } from '../shared/musicKeywords.js';
import {
  validateUserId,
  validateProgressPayload,
  validateHistoryPayload,
  validateBlacklistPayload,
  validateMusicQuery,
  validateWsMessage
} from '../server/validators.js';
import { server } from '../server/server.js';
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

  const multiWord = extractAnswerKeyword('Smells Like Teen Spirit', 'Nirvana');
  assert(multiWord?.answer === 'SMELLS', 'Extracts prominent keyword from multi-word title');

  const nullResult = extractAnswerKeyword('', '');
  assert(nullResult === null, 'Returns null on empty input');

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

  const validWs = validateWsMessage({
    action: 'create_room',
    playerId: 'host_123',
    playerName: 'Alice',
    mode: 'coop'
  });
  assert(validWs.valid === true, 'Accepts valid WebSocket action');

  const invalidWs = validateWsMessage({
    action: 'malicious_action',
    playerId: 'user_1'
  });
  assert(invalidWs.valid === false, 'Rejects unlisted WebSocket action');
}

async function runIntegrationTests() {
  console.log('\n--- 4. Running Integration Tests with Ephemeral Server ---');

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
          mode: 'coop'
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
