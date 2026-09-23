import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateUserId,
  validateProgressPayload,
  validateHistoryPayload,
  validateBlacklistPayload,
  validateMusicQuery,
  validateLivePuzzlePayload,
  validateWsMessage,
} from '../../server/validators.js';

test('Backend Input Validators', async () => {
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
});
