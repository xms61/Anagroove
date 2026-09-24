import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blacklistMatchesTrack, type BlacklistIdentityItem } from '../../shared/musicIdentity.js';

const artist = (name: string): BlacklistIdentityItem[] => [{ type: 'artist', name }];
const song = (name: string): BlacklistIdentityItem[] => [{ type: 'song', name }];
const track = (artistName, title = 'Some Song') => ({ artist: artistName, title });

test('generic artist entries match whole words, including collaborations', () => {
  assert.ok(blacklistMatchesTrack(artist('Drake'), track('Drake')));
  assert.ok(blacklistMatchesTrack(artist('Drake'), track('Drake feat. Future')));
  assert.ok(blacklistMatchesTrack(artist('Future'), track('Drake & Future')));
  assert.ok(blacklistMatchesTrack(artist('Beyoncé'), track('BEYONCE')));
  assert.ok(blacklistMatchesTrack(artist('아이유'), track('아이유')));
});

test('generic artist entries do not block names that merely contain the letters', () => {
  assert.ok(!blacklistMatchesTrack(artist('IU'), track('Julius')));
  assert.ok(!blacklistMatchesTrack(artist('Queen Latifah'), track('Queen')));
  assert.ok(!blacklistMatchesTrack(artist('Queen'), track('Queensrÿche')));
  assert.ok(!blacklistMatchesTrack(artist('!!!'), track('Adele')), 'a name with no letters matches nothing');
});

test('generic song entries match the title and its versions only', () => {
  assert.ok(blacklistMatchesTrack(song('Hey Jude'), track('The Beatles', 'Hey Jude - Remastered 2015')));
  assert.ok(!blacklistMatchesTrack(song('Hello'), track('Adele', 'Othello')));
  assert.ok(!blacklistMatchesTrack(song('Hey Jude (Remastered 2015)'), track('The Beatles', 'Hey Jude')),
    'a longer blacklisted title does not block a shorter one');
});
