import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { deezerRankToScore } from '../../server/db/trackNormalization.js';
import {
  resolveTrackPreview,
  batchResolvePreviews,
  extractNumericCatalogTrackId,
  clearPreviewCacheForTesting,
} from '../../server/services/previewResolver.js';
import { parseDelimitedLine, mapRowToCandidate, parseSqlInsertTuple } from '../ingest_musicmovearr.js';

test('delimited lines keep quoted delimiters (CSV) and split on tabs (TSV)', () => {
  assert.deepEqual(parseDelimitedLine('"101","Discovery, Vol. 1","Daft Punk"', ','), ['101', 'Discovery, Vol. 1', 'Daft Punk']);
  assert.deepEqual(parseDelimitedLine('202\tInstant Crush\tJulian Casablancas', '\t'), ['202', 'Instant Crush', 'Julian Casablancas']);
});

test('a dump row maps to an upsert candidate without a preview URL', () => {
  const headers = ['id', 'title', 'artist', 'album', 'duration', 'rank', 'isrc', 'release_date'];
  const row = ['3135556', 'One More Time', 'Daft Punk', 'Discovery', '320', '850000', 'USVI20000001', '2001-03-12'];
  const candidate = mapRowToCandidate(row, headers, 'deezer');
  assert.ok(candidate);
  assert.equal(candidate.providerTrackId, '3135556');
  assert.equal(candidate.title, 'One More Time');
  assert.equal(candidate.artist, 'Daft Punk');
  assert.equal(candidate.durationMs, 320000, 'seconds become milliseconds');
  assert.equal(candidate.deezerRank, 850000);
  assert.equal(candidate.popularity, deezerRankToScore(850000));
  assert.equal(candidate.countryCode, 'US');
  assert.equal(candidate.language, 'en');
  assert.equal(candidate.sampleUrl, null, 'previews are resolved lazily');
});

test('SQL INSERT tuples parse strings without quotes and NULL as null', () => {
  const values = parseSqlInsertTuple("(1001, 'Get Lucky', 'Pharrell Williams', 248000, 92, NULL)");
  assert.equal(values.length, 6);
  assert.equal(values[1], 'Get Lucky');
  assert.equal(values[5], null);
});

const CATALOG_IDS = [
  [{ id: 'deezer:104' }, null],
  [{ id: 'sqlite:42' }, 42],
  [{ catalogTrackId: 99 }, 99],
  [{ id: 105 }, 105],
];
for (const [track, expected] of CATALOG_IDS) {
  test(`extractNumericCatalogTrackId(${JSON.stringify(track)}) is ${expected}`, () => {
    assert.equal(extractNumericCatalogTrackId(track), expected);
  });
}

test('a track with a stored sample resolves to it without a lookup', async () => {
  clearPreviewCacheForTesting();
  const resolved = await resolveTrackPreview({ id: 'sqlite:1', title: 'Around The World', artist: 'Daft Punk', sample_url: 'https://cdnt-preview.dzcdn.net/around.mp3' });
  assert.equal(resolved?.source, 'existing');
  assert.equal(resolved.url, 'https://cdnt-preview.dzcdn.net/around.mp3');
});

test('batch resolution keeps tracks that already carry a preview', async () => {
  const result = await batchResolvePreviews([
    { id: 'track-1', sample_url: 'https://cdnt-preview.dzcdn.net/1.mp3' },
    { id: 'track-2', audioUrl: 'https://cdnt-preview.dzcdn.net/2.mp3' },
  ]);
  assert.equal(result.resolvedTracks.length, 2);
  assert.equal(result.failedTracks.length, 0);
});

test('a sampleless row is served with its Deezer id, and a lazily resolved preview is stored', () => {
  const catalog = new SqliteCatalog(':memory:');
  const inserted = catalog.upsertTrack({
    title: 'Lazy Sampleless Song', artist: 'Lazy Band', album: 'Lazy Album', durationMs: 210000, releaseYear: 2024,
    provider: 'deezer', providerTrackId: '999888', sampleUrl: null,
  });
  assert.equal(inserted.isNew, true);

  const [lazy] = catalog.sampleCatalogTracks({ start: 0 });
  assert.equal(lazy.deezer_id, '999888');
  assert.equal(lazy.sample_url, null);

  const stored = catalog.insertSample(lazy.id, {
    provider: 'deezer', providerTrackId: '999888', sampleUrl: 'https://cdnt-preview.dzcdn.net/lazy-hydrated.mp3',
    audioCodec: 'mp3', sampleDurationSec: 30, httpStatus: 200,
  });
  assert.equal(stored, true);
  assert.equal(catalog.sampleCatalogTracks({ start: 0 })[0].sample_url, 'https://cdnt-preview.dzcdn.net/lazy-hydrated.mp3');
  catalog.close();
});
