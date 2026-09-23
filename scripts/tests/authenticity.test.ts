import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthenticCandidate, type RawTrack } from '../../server/crawler/authenticityFilter.ts';

const PREVIEW = 'https://cdnt-preview.dzcdn.net/sample.mp3';

// [why, raw provider payload, expected]
const CANDIDATES: [why: string, candidate: RawTrack, expected: boolean][] = [
  ['"(Cover)" in the title', { title: 'Bohemian Rhapsody (Cover)', artist: 'Some Cover Band', preview: PREVIEW, duration: 200 }, false],
  ['karaoke artist', { title: 'Smells Like Teen Spirit', artist: 'Karaoke All Stars', preview: PREVIEW, duration: 210 }, false],
  ['tribute band', { title: 'Wonderwall', artist: 'Oasis Tribute Band', preview: PREVIEW, duration: 250 }, false],
  ['lullaby renditions album', { title: 'Hotel California', artist: 'The Eagles', album: 'Lullaby Renditions of Eagles', preview: PREVIEW, duration: 180 }, false],
  ['no preview', { title: 'Billie Jean', artist: 'Michael Jackson', preview: '', duration: 290 }, false],
  ['shorter than 45 s', { title: 'Short Clip', artist: 'Quick Artist', preview: PREVIEW, duration: 20 }, false],
  ['studio track with a preview (Deezer payload)', { title: 'Around the World', artist: 'Daft Punk', album: 'Homework', preview: PREVIEW, duration: 429 }, true],
  ['studio track (iTunes payload)', { trackName: 'Bohemian Rhapsody', artistName: 'Queen', collectionName: 'A Night At The Opera', previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a', trackTimeMillis: 355000 }, true],
];

for (const [why, candidate, expected] of CANDIDATES) {
  test(`isAuthenticCandidate: ${why} -> ${expected}`, () => {
    assert.equal(isAuthenticCandidate(candidate), expected);
  });
}

// Artists found in the catalog on 2026-09-23 (stock music, covers, "Various Artists") and real
// acts with similar names. [artist, authentic]
const ARTISTS = [
  ['Mix Factor', false],
  ['Stingray Music', false],
  ['Verschiedene Interpreten', false],
  ['Various Artists', false],
  ['Punk Rock Factory', false],
  ['Fake Music Factory', false],
  ['R&B Songbook', false],
  ['Sleepy Tunes', false],
  ['Relax R&B Soul', false],
  ['DJ Hits', false],
  ['Hits, Etc.', false],
  ["80's Greatest Hits", false],
  ['C+C Music Factory', true],
  ['Electric Light Orchestra', true],
  ['Orchestral Manoeuvres in the Dark', true],
  ['Sleep Token', true],
  ['Sleeping With Sirens', true],
];
for (const [artist, expected] of ARTISTS) {
  test(`artist "${artist}" is ${expected ? 'authentic' : 'rejected'}`, () => {
    assert.equal(isAuthenticCandidate({ title: 'Some Song', artist, preview: PREVIEW, duration: 200 }), expected);
  });
}
