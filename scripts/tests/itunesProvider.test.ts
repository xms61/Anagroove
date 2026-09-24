import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itunesMusicProvider, mapItunesTrack } from '../../server/services/itunesMusicProvider.ts';

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

test('an iTunes artist search keeps only songs credited to that artist', async (t) => {
  const song = (trackId: number, artistName: string) => ({ trackId, artistName, trackName: `Song ${trackId}`, previewUrl: `https://audio.test/${trackId}.m4a` });
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ results: [song(1, 'Mitski'), song(2, 'Mitski Tribute Band'), song(3, 'MITSKI')] }));
  });
  const tracks = await itunesMusicProvider.getCandidateTracks({ artist: 'Mitski', limit: 10 });
  assert.deepEqual(tracks.map(track => track.providerTrackId), ['1', '3']);
  assert.match(urls[0], /attribute=artistTerm/);
});
