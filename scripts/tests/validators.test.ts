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
  parseLanguageFilter,
} from '../../server/validators.ts';

const USER_IDS = [
  ['valid_user-123', 'valid_user-123'],
  ['bad user!', null],
  ['x', null],
  ['a'.repeat(65), null],
];
for (const [id, expected] of USER_IDS) {
  test(`validateUserId("${id.slice(0, 20)}") is ${expected === null ? 'rejected' : 'accepted'}`, () => {
    assert.equal(validateUserId(id), expected);
  });
}

// [validator, payload, valid, why]
const PAYLOADS: Array<[(body: unknown) => { valid: boolean }, unknown, boolean, string]> = [
  [validateProgressPayload, { puzzleId: 'puzzle-1', userLetters: [['A', 'B'], ['C', 'D']] }, true, 'progress grid'],
  [validateProgressPayload, { puzzleId: 'puzzle-1', userLetters: [['TOOLONG', 'B']] }, false, 'progress cell with several letters'],
  [validateBlacklistPayload, { name: 'Coldplay', type: 'artist' }, true, 'blacklisted artist'],
  [validateBlacklistPayload, { name: 'Coldplay', type: 'album' }, false, 'blacklist type "album"'],
  [validateHistoryPayload, { puzzleId: 'p-1', title: 'Great Hit', cluesCount: 10, timeSeconds: 120 }, true, 'history entry'],
  [validateHistoryPayload, { puzzleId: 'p-1', cluesCount: -5 }, false, 'negative clue count'],
  [validateLivePuzzlePayload, { targetWords: 'bad' }, false, 'non-numeric targetWords'],
  [validateWsMessage, { action: 'create_room', playerId: 'host_123', playerName: 'Alice', mode: 'coop', livePuzzleToken: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }, true, 'create_room message'],
  [validateWsMessage, { action: 'malicious_action', playerId: 'user_1' }, false, 'unknown WebSocket action'],
];
for (const [validate, payload, valid, why] of PAYLOADS) {
  test(`${validate.name}: ${why} -> ${valid ? 'valid' : 'invalid'}`, () => {
    assert.equal(validate(payload).valid, valid);
  });
}

test('validateMusicQuery parses numbers and the recent-id list', () => {
  const query = validateMusicQuery({ genre: 'rock', minFans: '500000', count: '15', recent: 'a,b,c' });
  assert.equal(query.genre, 'rock');
  assert.equal(query.count, 15);
  assert.deepEqual(query.recentIds, ['a', 'b', 'c']);
});

test('the language filter accepts arrays and comma lists, deduped, and only en/ja/ko', () => {
  assert.deepEqual(parseLanguageFilter(['ja', 'KO', 'ja']).languages, ['ja', 'ko']);
  assert.deepEqual(parseLanguageFilter('en,ko').languages, ['en', 'ko']);
  assert.equal(parseLanguageFilter(undefined).languages, undefined);
  assert.ok(!parseLanguageFilter(['es']).valid);
  assert.ok(!validateLivePuzzlePayload({ languages: 'fr' }).valid);
  assert.deepEqual(validateLivePuzzlePayload({ languages: ['ja'] }).data.languages, ['ja']);
});

test('free text that reaches logs and other players loses control characters', () => {
  const live = validateLivePuzzlePayload({ prompt: '80s rock\n[ERROR] forged line', artist: 'Queen\r' });
  assert.equal(live.data?.prompt, '80s rock [ERROR] forged line');
  assert.equal(live.data?.artist, 'Queen');
  const message = validateWsMessage({ action: 'join_room', roomCode: 'BEAT-1234', playerId: 'player-1', playerName: 'Eve\u0000\nAdmin' });
  assert.equal(message.data?.playerName, 'Eve  Admin');
});
