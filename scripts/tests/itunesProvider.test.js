import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapItunesTrack, detectStorefront } from '../../server/services/itunesMusicProvider.js';

test('an iTunes result maps to a track with 600px artwork; one without a preview is dropped', () => {
  const track = mapItunesTrack({
    trackId: 12345,
    trackName: 'Midnight City',
    artistName: 'M83',
    previewUrl: 'https://audio.itunes.com/preview.m4a',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
    collectionName: 'Hurry Up, We Are Dreaming',
  });
  assert.equal(track?.id, 'itunes:12345');
  assert.equal(track.provider, 'itunes');
  assert.ok(track.albumArt.includes('600x600bb'));
  assert.equal(mapItunesTrack({ trackId: 999 }), null);
});

const STOREFRONTS = [
  ['Japanese City Pop', 'JP'],
  ['Korean Trot', 'KR'],
  ['K-Pop', 'US'],
  ['Britpop', 'GB'],
  ['French House', 'US'],
  ['90s Grunge', 'US'],
];
for (const [query, storefront] of STOREFRONTS) {
  test(`detectStorefront("${query}") is ${storefront}`, () => {
    assert.equal(detectStorefront(query), storefront);
  });
}
