import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog, normalizeDedupeTitle } from '../../server/db/sqliteCatalog.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.js';
import { evaluateCatalogGate } from '../../server/db/catalogGate.js';
import { CatalogValidator } from '../../server/db/catalogValidator.js';

/**
 * Starboy (clean), a duplicate Starboy row, an audiobook and an 8-second clip.
 * The last three are legacy rows that upsertTrack refuses today, so they are inserted with SQL.
 */
function fixtureCatalog() {
  const catalog = new SqliteCatalog(':memory:');
  catalog.upsertTrack({
    title: 'Starboy', artist: 'The Weeknd', isrc: 'USUM71607007', album: 'Starboy', durationMs: 230000, popularity: 950000,
    provider: 'deezer', providerTrackId: '138597793', sampleUrl: 'https://cdns-preview.deezer.com/preview-1.mp3', releaseYear: 2016,
    artistMetadata: { genres: ['Pop', 'R&B'] },
  });
  catalog.db.prepare(`
    INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, release_date, country_code, language, popularity, is_explicit)
    VALUES ('USUM71607008', 'starboy', 'Starboy', 1, 'Starboy (Deluxe)', 231000, 2016, '2016-11-25', 'US', 'en', 900000, 1)
  `).run();

  const insertLegacyTrack = ({ title, artist, isrc, album, durationMs, providerTrackId, genres = null }) => {
    catalog.db.prepare('INSERT OR IGNORE INTO artists (canonical_name, display_name, genres_json) VALUES (?, ?, ?)')
      .run(artist.toLowerCase(), artist, genres ? JSON.stringify(genres) : null);
    const artistId = catalog.db.prepare('SELECT id FROM artists WHERE canonical_name = ?').get(artist.toLowerCase()).id;
    const trackId = Number(catalog.db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, language, popularity)
      VALUES (?, ?, ?, ?, ?, ?, 'de', 41)
    `).run(isrc, normalizeDedupeTitle(title), title, artistId, album, durationMs).lastInsertRowid);
    catalog.insertSample(trackId, { provider: 'deezer', providerTrackId, sampleUrl: `https://cdns-preview.deezer.com/${providerTrackId}.mp3` });
    catalog.db.prepare("INSERT INTO track_providers (track_id, provider, provider_track_id) VALUES (?, 'deezer', ?)").run(trackId, providerTrackId);
  };
  insertLegacyTrack({ title: 'Kapitel 1 - Das Schloss', artist: 'Gruselkabinett', isrc: 'DEUM71600001', album: 'Folge 01', durationMs: 120000, providerTrackId: '999999', genres: ['Spoken Word'] });
  insertLegacyTrack({ title: 'Intro SFX', artist: 'Sound Effects FX', isrc: 'USFX71600001', album: 'Effects', durationMs: 8000, providerTrackId: '888888' });

  return { catalog, validator: new CatalogValidator(catalog.db) };
}

test('a fresh catalog passes the integrity and foreign-key checks', () => {
  const { catalog, validator } = fixtureCatalog();
  const pragmas = validator.checkPragmas();
  assert.equal(pragmas.integrityOk, true);
  assert.equal(pragmas.foreignKeysOk, true);
  catalog.close();
});

test('diagnostics find the duplicate, the too-short clip and the audiobook', () => {
  const { catalog, validator } = fixtureCatalog();
  const duplicates = validator.findDuplicates();
  assert.equal(duplicates.softDuplicateClustersCount, 1);
  assert.equal(duplicates.softDuplicatesSample[0].artist, 'The Weeknd');

  const anomalies = validator.findDataAnomalies();
  assert.equal(anomalies.durationAnomalies.tooShortCount, 1);
  assert.equal(anomalies.contamination.audiobooksCount, 1);
  assert.equal(anomalies.contamination.totalContaminatedCount, 1);

  const { overview, popularity } = validator.generateStatistics();
  assert.equal(overview.totalTracks, 4);
  assert.equal(overview.totalArtists, 3);
  assert.equal(overview.sampleCoveragePct, 75);
  assert.ok(popularity.normalizedAvgPop > 0);
  catalog.close();
});

test('the cleanup dry run changes nothing; applying it merges the duplicate and deletes the junk', () => {
  const { catalog, validator } = fixtureCatalog();
  assert.equal(runCatalogCleanup(catalog.db).applied, false);
  assert.equal(validator.generateStatistics().overview.totalTracks, 4);

  const cleanup = runCatalogCleanup(catalog.db, { apply: true });
  assert.equal(cleanup.steps.find(s => s.name === 'duplicates').removed, 1);
  assert.equal(cleanup.steps.find(s => s.name === 'policy').deleted, 2);
  assert.equal(validator.generateStatistics().overview.totalTracks, 1);
  assert.equal(validator.findDuplicates().softDuplicateClustersCount, 0);
  catalog.close();
});

test('the markdown report includes the gate section', () => {
  const { catalog, validator } = fixtureCatalog();
  const cleanup = runCatalogCleanup(catalog.db, { apply: true });
  const report = validator.generateMarkdownReport({
    pragmas: validator.checkPragmas(),
    orphans: validator.findOrphans(),
    duplicates: validator.findDuplicates(),
    anomalies: validator.findDataAnomalies(),
    stats: validator.generateStatistics(),
    cleanup,
    gate: evaluateCatalogGate(catalog.db, { minYearCoverage: 0, minIsrcCoverage: 0 }),
  });
  assert.ok(report.includes('# SpotySpice Database Validation'));
  assert.ok(report.includes('## 8. Validation Gate'));
  catalog.close();
});
