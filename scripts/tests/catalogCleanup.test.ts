import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { classifyVersion, baseTitleKey } from '../../server/db/trackNormalization.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.ts';
import { evaluateCatalogGate } from '../../server/db/catalogGate.ts';

const NO_COVERAGE = { minYearCoverage: 0, minIsrcCoverage: 0 };

/**
 * A catalog written before the admission policy: rows go in with raw SQL because upsertTrack
 * would refuse them. Returns the ids the tests look at.
 */
function legacyCatalog() {
  const catalog = new SqliteCatalog(':memory:');
  const { db } = catalog;
  const artistId = (name) => {
    const key = canonicalArtistKey(name) || name;
    db.prepare('INSERT OR IGNORE INTO artists (canonical_name, display_name) VALUES (?, ?)').run(key, name);
    return db.prepare('SELECT id FROM artists WHERE canonical_name = ?').get(key).id;
  };
  const legacy = ({ title, artist, album = 'Album', language = 'en', durationMs = 200000, isrc = null, popularity = 50, year = null, deezerId = null, sampleId = deezerId, provider = true }) => {
    const id = Number(db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, language, popularity, version_type, rand_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.5)
    `).run(isrc, baseTitleKey(title), title, artistId(artist), album, durationMs, year, language, popularity, String(classifyVersion(title, album))).lastInsertRowid);
    if (provider && deezerId) db.prepare("INSERT INTO track_providers (track_id, provider, provider_track_id) VALUES (?, 'deezer', ?)").run(id, String(deezerId));
    if (sampleId) db.prepare("INSERT INTO track_samples (track_id, provider, provider_track_id, sample_url) VALUES (?, 'deezer', ?, ?)").run(id, String(sampleId), `https://cdn.test/${sampleId}.mp3`);
    return id;
  };

  const ids = {
    levitating: legacy({ title: 'Levitating', artist: 'Dua Lipa', isrc: 'GBAHT2000942', year: 2020, popularity: 80, deezerId: 1 }),
    gaga: legacy({ title: 'Die With A Smile', artist: 'Lady Gaga', popularity: 95, deezerId: 10 }),
    idol: legacy({ title: 'アイドル', artist: 'YOASOBI', language: 'ja', isrc: 'jpu902300400', deezerId: 60, popularity: 900000 }),
  };
  legacy({ title: 'Levitating (Live at the BRITs)', artist: 'Dua Lipa', popularity: 90, deezerId: 2 });
  legacy({ title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia (Deluxe)', year: 2019, popularity: 60, deezerId: 3 });
  legacy({ title: 'Die With A Smile', artist: 'Bruno Mars', popularity: 95, sampleId: 10, provider: false });
  for (const [i, title] of ['Por Esos Ojos', 'La Sala de Espera', 'Mi Corazón Contigo'].entries()) {
    legacy({ title, artist: 'Grupo Norteño', language: 'en', deezerId: 20 + i });
  }
  legacy({ title: 'I&#039;m Not The Only One', artist: 'Sam Smith', deezerId: 30, popularity: 70 });
  legacy({ title: "I'm Not The Only One", artist: 'Sam Smith', deezerId: 31, popularity: 40 });
  legacy({ title: 'The Riddle', artist: 'Gigi D&#039;Agostino', deezerId: 40 });
  legacy({ title: 'Bla Bla Bla', artist: "Gigi D'Agostino", deezerId: 41 });
  legacy({ title: 'Rain Sounds For Sleep', artist: 'Sleep Sounds', deezerId: 50 });
  legacy({ title: 'Intro', artist: 'Some Band', durationMs: 8000, deezerId: 51 });
  legacy({ title: 'Lost Song', artist: 'Some Band', deezerId: null, sampleId: null });
  legacy({ title: '봄날', artist: 'BTS', language: 'ko', deezerId: 61 });
  return { catalog, db, ids };
}

const trackCount = (db) => db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;

test('the gate flags duplicates, versions, entities, durations, unlinked and inauthentic rows', () => {
  const { catalog, db } = legacyCatalog();
  const gate = evaluateCatalogGate(db, NO_COVERAGE);
  const failing = new Set(gate.checks.filter(c => !c.ok).map(c => c.id));
  assert.equal(gate.ok, false);
  for (const id of ['duplicates', 'version', 'text', 'duration', 'unlinked', 'inauthentic']) assert.ok(failing.has(id), id);
  catalog.close();
});

test('a dry run reports the changes and rolls them back', () => {
  const { catalog, db } = legacyCatalog();
  const before = trackCount(db);
  const dry = runCatalogCleanup(db);
  assert.equal(dry.applied, false);
  assert.equal(trackCount(db), before);
  assert.ok(dry.after.tracks < before);
  catalog.close();
});

test('cleanup folds a collaboration stored under a second artist into the provider owner', () => {
  const { catalog, db, ids } = legacyCatalog();
  const applied = runCatalogCleanup(db, { apply: true });
  assert.equal(applied.steps.find(s => s.name === 'recordings').removed, 1);
  assert.ok(!db.prepare("SELECT 1 FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.display_name = 'Bruno Mars'").get());
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM tracks WHERE id = ?').get(ids.gaga).c, 1);
  catalog.close();
});

test('cleanup deletes live, Spanish, utility, too-short and unlinked rows', () => {
  const { catalog, db } = legacyCatalog();
  const { reasons } = runCatalogCleanup(db, { apply: true }).steps.find(s => s.name === 'policy');
  assert.deepEqual(
    { version: reasons.version, language: reasons.language, inauthentic: reasons.inauthentic, duration: reasons.duration, unlinked: reasons.unlinked },
    { version: 1, language: 3, inauthentic: 1, duration: 1, unlinked: 1 }
  );
  catalog.close();
});

test('duplicate releases merge into one row with the earliest year, the ISRC and every provider link', () => {
  const { catalog, db, ids } = legacyCatalog();
  runCatalogCleanup(db, { apply: true });
  const levitating = db.prepare('SELECT release_year, isrc FROM tracks WHERE id = ?').get(ids.levitating);
  assert.equal(levitating.release_year, 2019);
  assert.equal(levitating.isrc, 'GBAHT2000942');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM track_providers WHERE track_id = ?').get(ids.levitating).c, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tracks WHERE display_title = 'I''m Not The Only One'").get().c, 1, 'the entity-encoded title merges too');
  catalog.close();
});

test('artists whose names only differed by HTML entities are merged', () => {
  const { catalog, db } = legacyCatalog();
  const applied = runCatalogCleanup(db, { apply: true });
  const gigi = db.prepare("SELECT COUNT(DISTINCT artist_id) AS artists, COUNT(*) AS tracks FROM tracks WHERE display_title IN ('The Riddle', 'Bla Bla Bla')").get();
  assert.deepEqual({ ...gigi }, { artists: 1, tracks: 2 });
  assert.equal(applied.steps.find(s => s.name === 'text').artistsMerged, 1);
  catalog.close();
});

test('Japanese and Korean rows survive with a normalized ISRC, registrant and Deezer rank', () => {
  const { catalog, db, ids } = legacyCatalog();
  runCatalogCleanup(db, { apply: true });
  const idol = db.prepare('SELECT language, isrc, country_code, deezer_rank FROM tracks WHERE id = ?').get(ids.idol);
  assert.deepEqual({ ...idol }, { language: 'ja', isrc: 'JPU902300400', country_code: 'JP', deezer_rank: 900000 }, 'the legacy rank moved out of popularity');
  assert.equal(db.prepare("SELECT language FROM tracks WHERE display_title = '봄날'").get()?.language, 'ko');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM artists WHERE id NOT IN (SELECT artist_id FROM tracks)').get().c, 0, 'artists without tracks are deleted');
  catalog.close();
});

test('a second cleanup run changes nothing', () => {
  const { catalog, db } = legacyCatalog();
  runCatalogCleanup(db, { apply: true });
  const again = runCatalogCleanup(db, { apply: true });
  const changed = again.steps
    .filter(s => s.name !== 'fts' && s.name !== 'languages')
    .flatMap(s => Object.entries(s).filter(([k, v]) => typeof v === 'number' && !['ms', 'rounds', 'unjudged'].includes(k) && v !== 0));
  assert.deepEqual(changed, []);
  assert.equal(again.after.tracks, again.before.tracks);
  catalog.close();
});

test('the cleaned catalog passes the gate; the default thresholds still require 95% year coverage', () => {
  const { catalog, db } = legacyCatalog();
  runCatalogCleanup(db, { apply: true });
  assert.ok(evaluateCatalogGate(db, NO_COVERAGE).ok);
  const strict = evaluateCatalogGate(db);
  assert.equal(strict.ok, false);
  assert.equal(strict.checks.find(c => c.id === 'year_coverage').ok, false);
  catalog.close();
});

test('the FTS index is rebuilt after cleanup and its triggers work again', () => {
  const { catalog, db, ids } = legacyCatalog();
  runCatalogCleanup(db, { apply: true });
  assert.deepEqual(db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH '"Levitating"'`).all().map(r => r.rowid), [ids.levitating]);
  const houdini = catalog.upsertTrack({ title: 'Houdini', artist: 'Dua Lipa', durationMs: 185000, provider: 'deezer', providerTrackId: '70', deezerRank: 500000 });
  assert.equal(db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH '"Houdini"'`).get()?.rowid, houdini.trackId);
  catalog.close();
});

test('CLI: --ci exits 1 on a failing catalog, --fix writes a backup first, then --ci passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anagroove-cli-'));
  const dbPath = path.join(dir, 'catalog.sqlite');
  const catalog = new SqliteCatalog(dbPath);
  catalog.upsertTrack({ title: 'Levitating', artist: 'Dua Lipa', durationMs: 203000, provider: 'deezer', providerTrackId: '1', isrc: 'GBAHT2000942', releaseYear: 2020, deezerRank: 900000 });
  catalog.db.prepare("INSERT INTO tracks (canonical_title, display_title, artist_id, album_name, duration_ms, language, popularity, version_type) VALUES ('levitating', 'Levitating (Live)', 1, 'A', 200000, 'en', 10, 'live')").run();
  catalog.close();
  const cli = (...args) => spawnSync(process.execPath, ['scripts/validate_and_sanitize_db.js', `--db=${dbPath}`, '--no-report', ...args], { encoding: 'utf8' });

  const dirty = cli('--ci', '--min-year-coverage=0', '--min-isrc-coverage=0');
  assert.equal(dirty.status, 1);
  assert.match(dirty.stdout, /Validation gate: FAIL/);

  assert.equal(cli('--fix', '--no-vacuum').status, 0);
  assert.equal(fs.readdirSync(dir).filter(f => f.startsWith('catalog.backup-cleanup-')).length, 1);

  const clean = cli('--ci', '--min-year-coverage=0', '--min-isrc-coverage=0');
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /Validation gate: PASS/);
  fs.rmSync(dir, { recursive: true, force: true });
});
