import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog, normalizeDedupeTitle } from '../../server/db/sqliteCatalog.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.js';
import { evaluateCatalogGate } from '../../server/db/catalogGate.js';
import { CatalogValidator } from '../../server/db/catalogValidator.js';

test('Database Validation Engine, Dupe Detection & Diagnostics', async () => {
  const memCatalog = new SqliteCatalog(':memory:');
  const validator = new CatalogValidator(memCatalog.db);

  // 1. Pragmas check
  const pragmas = validator.checkPragmas();
  assert(pragmas.integrityOk === true, 'In-memory catalog passes integrity check');
  assert(pragmas.foreignKeysOk === true, 'In-memory catalog has zero foreign key violations');

  // 2. Populate test data with duplicates and anomalies
  // Track 1
  memCatalog.upsertTrack({
    title: 'Starboy',
    artist: 'The Weeknd',
    isrc: 'USUM71607007',
    album: 'Starboy',
    durationMs: 230000,
    popularity: 950000,
    provider: 'deezer',
    providerTrackId: '138597793',
    sampleUrl: 'https://cdns-preview.deezer.com/preview-1.mp3',
    releaseYear: 2016,
    artistMetadata: { genres: ['Pop', 'R&B'] },
  });

  // Track 2: Soft duplicate of Track 1 (same artist, same canonical title, duration delta = 1000ms)
  memCatalog.db.prepare(`
    INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, release_date, country_code, language, popularity, is_explicit)
    VALUES ('USUM71607008', 'starboy', 'Starboy', 1, 'Starboy (Deluxe)', 231000, 2016, '2016-11-25', 'US', 'en', 900000, 1)
  `).run();

  // Legacy junk from before the admission policy existed (upsertTrack now refuses these rows)
  const insertLegacyTrack = ({ title, artist, canonicalArtist, isrc, album, durationMs, providerTrackId, sampleUrl, genres = null }) => {
    memCatalog.db.prepare('INSERT OR IGNORE INTO artists (canonical_name, display_name, genres_json) VALUES (?, ?, ?)')
      .run(canonicalArtist, artist, genres ? JSON.stringify(genres) : null);
    const artistId = memCatalog.db.prepare('SELECT id FROM artists WHERE canonical_name = ?').get(canonicalArtist).id;
    const trackId = Number(memCatalog.db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, language, popularity)
      VALUES (?, ?, ?, ?, ?, ?, 'de', 41)
    `).run(isrc, normalizeDedupeTitle(title), title, artistId, album, durationMs).lastInsertRowid);
    memCatalog.insertSample(trackId, { provider: 'deezer', providerTrackId, sampleUrl });
    memCatalog.db.prepare("INSERT INTO track_providers (track_id, provider, provider_track_id) VALUES (?, 'deezer', ?)").run(trackId, providerTrackId);
  };

  // Track 3: Contaminated audiobook track
  insertLegacyTrack({
    title: 'Kapitel 1 - Das Schloss',
    artist: 'Gruselkabinett',
    canonicalArtist: 'gruselkabinett',
    isrc: 'DEUM71600001',
    album: 'Folge 01',
    durationMs: 120000,
    providerTrackId: '999999',
    sampleUrl: 'https://cdns-preview.deezer.com/preview-audiobook.mp3',
    genres: ['Spoken Word'],
  });

  // Track 4: Short duration anomaly (< 15s)
  insertLegacyTrack({
    title: 'Intro SFX',
    artist: 'Sound Effects FX',
    canonicalArtist: 'sound effects fx',
    isrc: 'USFX71600001',
    album: 'Effects',
    durationMs: 8000,
    providerTrackId: '888888',
    sampleUrl: 'https://cdns-preview.deezer.com/preview-sfx.mp3',
  });

  // 3. Test findDuplicates
  const dupes = validator.findDuplicates();
  assert(dupes.softDuplicateClustersCount === 1, 'Detects exactly 1 soft duplicate cluster');
  assert(dupes.softDuplicatesSample[0].artist === 'The Weeknd', 'Identifies duplicate artist as The Weeknd');

  // 4. Test findDataAnomalies
  const anomalies = validator.findDataAnomalies();
  assert(anomalies.durationAnomalies.tooShortCount === 1, 'Detects track under 15 seconds');
  assert(anomalies.contamination.audiobooksCount === 1, 'Detects Gruselkabinett audiobook contamination');
  assert(anomalies.contamination.totalContaminatedCount === 1, 'Tallies total contaminated tracks');

  // 5. Test generateStatistics
  const stats = validator.generateStatistics();
  assert(stats.overview.totalTracks === 4, 'Counts 4 total tracks in test database');
  assert(stats.overview.totalArtists === 3, 'Counts 3 distinct artists in test database');
  assert(stats.overview.sampleCoveragePct === 75, 'Computes 75% audio sample coverage (3/4 tracks with samples)');
  assert(stats.popularity.normalizedAvgPop > 0, 'Computes normalized average popularity');

  // 6. Cleanup dry run changes nothing
  const dryCleanup = runCatalogCleanup(memCatalog.db);
  assert(dryCleanup.applied === false && validator.generateStatistics().overview.totalTracks === 4, 'Cleanup dry run rolls back');

  // 7. Cleanup merges the duplicate and deletes the audiobook and the 8-second clip
  const cleanup = runCatalogCleanup(memCatalog.db, { apply: true });
  assert(cleanup.steps.find(s => s.name === 'duplicates').removed === 1, 'Cleanup merges the duplicate Starboy row');
  assert(cleanup.steps.find(s => s.name === 'policy').deleted === 2, 'Cleanup deletes the audiobook and the too-short clip');

  // 8. Verify post-cleanup state
  const postStats = validator.generateStatistics();
  assert(postStats.overview.totalTracks === 1, '1 canonical track remains after cleanup');
  const postDupes = validator.findDuplicates();
  assert(postDupes.softDuplicateClustersCount === 0, 'Zero duplicate groups remain after cleanup');

  // 9. Test Report Generation
  const reportMd = validator.generateMarkdownReport({
    pragmas,
    orphans: validator.findOrphans(),
    duplicates: postDupes,
    anomalies: validator.findDataAnomalies(),
    stats: postStats,
    cleanup,
    gate: evaluateCatalogGate(memCatalog.db, { minYearCoverage: 0, minIsrcCoverage: 0 }),
  });
  assert(typeof reportMd === 'string' && reportMd.includes('# SpotySpice Database Validation') && reportMd.includes('## 8. Validation Gate'), 'Generates valid markdown report string');
});
