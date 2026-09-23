import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthenticCandidate } from '../../server/crawler/authenticityFilter.js';

const PREVIEW = 'https://cdnt-preview.dzcdn.net/sample.mp3';

// [why, raw provider payload, expected]
const CANDIDATES = [
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
