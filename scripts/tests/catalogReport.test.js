import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.js';
import { evaluateCatalogGate } from '../../server/db/catalogGate.js';
import { catalogStatistics, renderValidationReport } from '../../server/db/catalogReport.js';

function smallCatalog() {
  const catalog = new SqliteCatalog(':memory:');
  const put = (title, artist, year, extra = {}) => catalog.upsertTrack({ title, artist, durationMs: 200000, provider: 'deezer', providerTrackId: title, releaseYear: year, ...extra });
  put('Starboy', 'The Weeknd', 2016, { artistMetadata: { genres: ['Pop', 'R&B'] }, sampleUrl: 'https://cdn.test/1.mp3' });
  put('Blinding Lights', 'The Weeknd', 2019);
  put('夜に駆ける', 'YOASOBI', null, { isrc: 'JPU901900001' });
  return catalog;
}

test('statistics count the inventory, coverage, languages, decades and genres', () => {
  const catalog = smallCatalog();
  const stats = catalogStatistics(catalog.db);
  assert.equal(stats.overview.tracks, 3);
  assert.equal(stats.overview.artists, 2);
  assert.equal(stats.overview.releaseYearKnown, 66.7);
  assert.equal(stats.overview.tracksWithSample, 33.3);
  assert.deepEqual(stats.languages.map(l => [l.language, l.count]), [['en', 2], ['ja', 1]]);
  assert.deepEqual(stats.decades.map(d => [d.decade, d.count]), [['2010s', 2], ['unknown', 1]]);
  assert.deepEqual(stats.genres.top, [{ genre: 'Pop', artists: 1 }, { genre: 'R&B', artists: 1 }]);
  assert.deepEqual({ ...stats.topArtists[0] }, { artist: 'The Weeknd', tracks: 2, fans: 0 });
  catalog.close();
});

test('the report shows the gate, the cleanup dry run and the statistics', () => {
  const catalog = smallCatalog();
  const report = renderValidationReport({
    dbPath: ':memory:',
    stats: catalogStatistics(catalog.db),
    cleanup: runCatalogCleanup(catalog.db),
    gate: evaluateCatalogGate(catalog.db, { minYearCoverage: 0, minIsrcCoverage: 0 }),
  });
  for (const heading of ['## 1. Validation gate', '## 2. Cleanup', '**Dry run:**', '## 3. Inventory', '| ja | 1 |', '## 5. Genres and artists']) {
    assert.ok(report.includes(heading), heading);
  }
  catalog.close();
});
