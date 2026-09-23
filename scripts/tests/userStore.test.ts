import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UserStore } from '../../server/db/userStore.ts';

let dir;
let legacyPath;
const open = () => new UserStore(path.join(dir, 'users.sqlite'), { legacyStorePath: legacyPath });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anagroove-users-'));
  legacyPath = path.join(dir, 'store.json');
  // store.json is corrupt, so the import falls back to the .bak copy
  fs.writeFileSync(legacyPath, '{ broken json');
  fs.writeFileSync(`${legacyPath}.bak`, JSON.stringify({ users: {
    alice: {
      userId: 'alice', createdAt: 1000, lastActive: 2000,
      activeProgress: { puzzleId: 'p2', userLetters: [['A']] },
      solvedHistory: [{ puzzleId: 'p1', solvedAt: 1500 }, { puzzleId: 'p1', solvedAt: 1600 }],
      blacklist: [
        { id: 'b1', name: 'Daft Punk', type: 'artist', dateAdded: 1100 },
        { id: 'b2', name: 'daft  punk', type: 'artist', dateAdded: 1200 },
        { id: 'b3', name: 'Same Title', type: 'song', provider: 'deezer', providerTrackId: '101', dateAdded: 1300 },
        { id: 'bad', name: 'Nope', type: 'album' },
      ],
    },
  } }));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('the legacy JSON store is imported once, from the .bak copy when store.json is corrupt', () => {
  const users = open();
  assert.equal(users.findUser('alice')?.createdAt, 1000);
  assert.equal(users.getProgress('alice')?.puzzleId, 'p2');
  assert.equal(users.importLegacyStore(legacyPath).imported, false);
  users.close();
});

test('the import drops duplicate history, duplicate blacklist names and invalid types', () => {
  const users = open();
  assert.equal(users.getSolvedHistory('alice').length, 1);
  assert.deepEqual(users.getBlacklist('alice').map(b => b.id), ['b1', 'b3']);
  users.close();
});

test('solving a puzzle clears its progress and appends to the history in order', () => {
  const users = open();
  users.recordSolvedPuzzle('alice', { puzzleId: 'p2', title: 'Two' });
  assert.equal(users.getProgress('alice'), null);
  assert.deepEqual(users.getSolvedHistory('alice').map(h => h.puzzleId), ['p1', 'p2']);
  users.close();
});

test('blacklist: generic and scoped entries coexist, duplicates are ignored, removal is by id', () => {
  const users = open();
  users.addBlacklistItem('alice', { name: 'Same Title', type: 'song' });
  users.addBlacklistItem('alice', { name: 'DAFT PUNK', type: 'artist' });
  assert.equal(users.getBlacklist('alice').length, 3);
  assert.equal(users.removeBlacklistItem('alice', 'b1').length, 2);
  users.close();
});

test('reads never create users', () => {
  const users = open();
  assert.equal(users.findUser('nobody'), null);
  assert.equal(users.getBlacklist('nobody').length, 0);
  assert.equal(users.findUser('nobody'), null);
  users.close();
});

test('state persists across restarts without importing again', () => {
  const users = open();
  users.recordSolvedPuzzle('alice', { puzzleId: 'p2', title: 'Two' });
  users.removeBlacklistItem('alice', 'b1');
  users.close();
  const reopened = open();
  assert.equal(reopened.getSolvedHistory('alice').length, 2);
  assert.equal(reopened.getBlacklist('alice').length, 1);
  reopened.close();
});
