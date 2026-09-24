import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blacklistMatchesTrack, type BlacklistIdentityItem } from '../../shared/musicIdentity.ts';

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

test('an artist hidden from a live Deezer song is also hidden in catalog songs without an artist id', () => {
  const hidden: BlacklistIdentityItem[] = [{ type: 'artist', name: 'Drake', provider: 'deezer', providerArtistId: '246791' }];
  const catalogSong = { artist: 'Drake', title: 'Hotline Bling', provider: 'deezer', providerTrackId: '111' };
  assert.ok(blacklistMatchesTrack(hidden, { ...catalogSong, providerArtistId: '246791' }), 'by id');
  assert.ok(blacklistMatchesTrack(hidden, catalogSong), 'by name');
  assert.ok(blacklistMatchesTrack(hidden, { artist: 'Renamed Account', title: 'x', provider: 'deezer', providerArtistId: 246791 }), 'numeric id');
  assert.ok(blacklistMatchesTrack(hidden, { artist: 'Drake', title: 'One Dance', provider: 'itunes', providerArtistId: '271256' }), 'another provider\'s id');
  assert.ok(!blacklistMatchesTrack(hidden, { artist: 'Nick Drake', title: 'Pink Moon', provider: 'deezer', providerArtistId: '1' }), 'a different Deezer artist');
});

test('a song hidden by provider id stays scoped to that id', () => {
  const hidden: BlacklistIdentityItem[] = [{ type: 'song', name: 'Hello', provider: 'deezer', providerTrackId: '42' }];
  assert.ok(blacklistMatchesTrack(hidden, { artist: 'Adele', title: 'Hello', provider: 'deezer', providerTrackId: '42' }));
  assert.ok(!blacklistMatchesTrack(hidden, { artist: 'Lionel Richie', title: 'Hello', provider: 'deezer', providerTrackId: '43' }));
});
