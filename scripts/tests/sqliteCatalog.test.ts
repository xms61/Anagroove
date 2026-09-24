import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.ts';
import { PROVISIONAL_POPULARITY } from '../../server/db/trackNormalization.ts';
import { runCatalogMigrations, LATEST_CATALOG_VERSION } from '../../server/db/catalogMigrations.ts';

const GET_LUCKY_DEEZER = {
  title: 'Get Lucky (feat. Pharrell Williams)',
  artist: 'Daft Punk',
  isrc: 'USQX91300105',
  album: 'Random Access Memories',
  durationMs: 369000,
  releaseYear: 2013,
  provider: 'deezer',
  providerTrackId: '67238732',
  sampleUrl: 'https://cdnt-preview.dzcdn.net/getlucky.mp3',
  sampleCodec: 'mp3',
  sampleDurationSec: 30,
  artistMetadata: { deezerId: 27, fansCount: 4000000 },
};

/** In-memory catalog plus an `ingest` helper that fills in a valid default track. */
function freshCatalog() {
  const catalog = new SqliteCatalog(':memory:');
  let nextId = 700000;
  const base = { durationMs: 200000, provider: 'deezer', album: 'Album', releaseYear: 2020 };
  const ingest = (extra) => catalog.upsertTrack({ ...base, providerTrackId: String(nextId++), ...extra });
  const row = (id, columns = '*') => catalog.db.prepare(`SELECT ${columns} FROM tracks WHERE id = ?`).get(id);
  return { catalog, ingest, row };
}

test('a fresh catalog is empty and at the latest schema version', () => {
  const { catalog } = freshCatalog();
  const stats = catalog.getStats();
  assert.equal(stats.tracks, 0);
  assert.equal(stats.artists, 0);
  assert.equal(catalog.db.prepare('PRAGMA user_version').get().user_version, LATEST_CATALOG_VERSION);
  catalog.close();
});

test('one song from three providers merges into one row (ISRC, then artist + base title)', () => {
  const { catalog, row } = freshCatalog();
  const deezer = catalog.upsertTrack(GET_LUCKY_DEEZER);
  assert.equal(deezer.isNew, true);
  assert.equal(row(deezer.trackId, 'country_code').country_code, 'US');
  assert.equal(row(deezer.trackId, 'language').language, 'en');

  const spotify = catalog.upsertTrack({
    title: 'Get Lucky', artist: 'Daft Punk', isrc: 'USQX91300105', album: 'Random Access Memories (Deluxe)',
    durationMs: 369640, provider: 'spotify', providerTrackId: '2Foc5Q5nqNiosCNqttzHof',
  });
  assert.equal(spotify.isMerged, true, 'same ISRC');
  assert.equal(spotify.trackId, deezer.trackId);

  const itunes = catalog.upsertTrack({
    title: 'Get Lucky', artist: 'Daft Punk', album: 'Get Lucky - Single', durationMs: 248000,
    provider: 'itunes', providerTrackId: '636988899', sampleUrl: 'https://audio-ssl.itunes.apple.com/getlucky.m4a',
  });
  assert.equal(itunes.isMerged, true, 'same artist and base title, whatever the duration');
  assert.equal(itunes.trackId, deezer.trackId);

  const stats = catalog.getStats();
  assert.equal(stats.tracks, 1);
  assert.equal(stats.audioSamples, 2);
  assert.equal(stats.providerLinks, 3);
  assert.equal(stats.crossReferencedTracks, 1);
  catalog.close();
});

test('upsertBatch inserts in one transaction and the year window filters on release year', () => {
  const { catalog } = freshCatalog();
  const result = catalog.upsertBatch([
    { title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', durationMs: 320000, releaseYear: 2001, provider: 'deezer', providerTrackId: '3135556' },
    { title: 'Harder, Better, Faster, Stronger', artist: 'Daft Punk', album: 'Discovery', durationMs: 224000, releaseYear: 2001, provider: 'deezer', providerTrackId: '3135557' },
    { title: 'Instant Crush', artist: 'Daft Punk', album: 'Random Access Memories', durationMs: 337000, releaseYear: 2013, provider: 'deezer', providerTrackId: '67238733' },
  ]);
  assert.equal(result.inserted, 3);
  assert.equal(result.total, 3);

  const window = catalog.sampleCatalogTracks({ yearRange: { start: 2000, end: 2005 }, start: 0 });
  assert.deepEqual(window.map(t => t.release_year), [2001, 2001]);
  catalog.close();
});

const REJECTED: [string, Record<string, unknown>, string][] = [
  ['radio edit', { title: 'Get Lucky (Radio Edit)', artist: 'Daft Punk' }, 'version'],
  ['live recording', { title: 'Around The World - Live', artist: 'Daft Punk' }, 'version'],
  ['remix', { title: 'One More Time (Skrillex Remix)', artist: 'Daft Punk' }, 'version'],
  ['track from a live album', { title: 'Digital Love', artist: 'Daft Punk', album: 'Alive 2007 (Live at Bercy)' }, 'version'],
  ['Spanish title', { title: 'Vida de Amor', artist: 'Los Cantantes' }, 'language'],
  ['Cyrillic title', { title: 'Короли ночи', artist: 'Группа' }, 'language'],
  ['Chinese title without a JP/KR ISRC', { title: '月亮代表我的心', artist: '邓丽君' }, 'language'],
  ['under 45 seconds', { title: 'Short Clip', artist: 'Clipper', durationMs: 8000 }, 'duration'],
];
for (const [name, track, reason] of REJECTED) {
  test(`admission policy rejects a ${name} (${reason})`, () => {
    const { catalog, ingest } = freshCatalog();
    assert.equal(ingest(track), null);
    assert.equal(catalog.getRejectionStats()[reason], 1);
    catalog.close();
  });
}

const ADMITTED_CJK = [
  ['kana title', { title: '夜に駆ける', artist: 'YOASOBI', isrc: 'JPU902000001' }, 'ja', '夜に駆ける'],
  ['kanji-only title with a JP ISRC', { title: '紅蓮華', artist: 'LiSA', isrc: 'JPU901900400' }, 'ja', '紅蓮華'],
  ['hangul title', { title: '봄날', artist: 'BTS' }, 'ko', '봄날'],
];
for (const [name, track, language, baseTitle] of ADMITTED_CJK) {
  test(`admission policy keeps a ${name} as ${language} with a Unicode base title`, () => {
    const { catalog, ingest, row } = freshCatalog();
    const result = ingest(track);
    assert.ok(result);
    assert.deepEqual({ ...row(result.trackId, 'language, canonical_title') }, { language, canonical_title: baseTitle });
    catalog.close();
  });
}

test('a plain original replaces the remaster as the displayed release and keeps both raw popularities', () => {
  const { catalog, ingest, row } = freshCatalog();
  const remaster = ingest({ title: 'Hey Jude - Remastered 2015', artist: 'The Beatles', durationMs: 431000, deezerRank: 562000 });
  const original = ingest({ title: 'Hey Jude', artist: 'The Beatles', durationMs: 425000, spotifyPopularity: 82 });
  assert.equal(original.trackId, remaster.trackId);
  assert.deepEqual({ ...row(remaster.trackId, 'display_title, version_type, popularity, deezer_rank, spotify_popularity') }, {
    display_title: 'Hey Jude', version_type: 'original', popularity: 82, deezer_rank: 562000, spotify_popularity: 82,
  });
  catalog.close();
});

test('a legacy Deezer rank passed as popularity is stored as the rank; the placeholder rank is dropped', () => {
  const { catalog, ingest, row } = freshCatalog();
  const legacy = ingest({ title: 'Legacy Rank Song', artist: 'Old Crawler', popularity: 950000 });
  assert.deepEqual({ ...row(legacy.trackId, 'deezer_rank, popularity') }, { deezer_rank: 950000, popularity: PROVISIONAL_POPULARITY });
  const placeholder = ingest({ title: 'Stock Tune', artist: 'Library Band', deezerRank: 100000 });
  assert.deepEqual({ ...row(placeholder.trackId, 'deezer_rank, popularity') }, { deezer_rank: null, popularity: 0 });
  catalog.close();
});

test('the trigram FTS index follows inserts and deletes', () => {
  const { catalog, ingest } = freshCatalog();
  const count = (term) => catalog.db.prepare('SELECT COUNT(*) AS c FROM tracks_fts WHERE tracks_fts MATCH ?').get(term).c;
  const ja = ingest({ title: '夜に駆ける', artist: 'YOASOBI', isrc: 'JPU902000001' });
  catalog.upsertTrack(GET_LUCKY_DEEZER);

  assert.equal(count('"駆ける"'), 1, 'Japanese substring');
  assert.ok(catalog.sampleCatalogTracks({ ftsQuery: '"lucky"', start: 0 }).some(t => String(t.title).startsWith('Get Lucky')));

  catalog.db.prepare('DELETE FROM tracks WHERE id = ?').run(ja.trackId);
  assert.equal(count('"駆ける"'), 0);
  assert.equal(
    catalog.db.prepare('SELECT COUNT(*) AS c FROM tracks_fts').get().c,
    catalog.db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c
  );
  catalog.close();
});

test('a legacy v0 catalog migrates to the latest version, and re-running is a no-op', () => {
  const legacyDb = new DatabaseSync(':memory:');
  legacyDb.exec(`
    CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      spotify_id TEXT UNIQUE, deezer_id INTEGER UNIQUE, itunes_artist_id INTEGER UNIQUE, genres_json TEXT, fans_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, isrc TEXT UNIQUE, canonical_title TEXT NOT NULL, display_title TEXT NOT NULL,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE, album_name TEXT, duration_ms INTEGER NOT NULL,
      release_year INTEGER, release_date TEXT, popularity INTEGER DEFAULT 0, is_explicit INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE track_providers (id INTEGER PRIMARY KEY AUTOINCREMENT, track_id INTEGER NOT NULL, provider TEXT NOT NULL,
      provider_track_id TEXT NOT NULL, external_url TEXT, raw_metadata_json TEXT, harvested_at TEXT, UNIQUE(provider, provider_track_id));
    CREATE VIRTUAL TABLE tracks_fts USING fts5(title, artist, album, content='tracks', content_rowid='id');
    INSERT INTO artists (id, canonical_name, display_name) VALUES (1, 'lisa', 'LiSA'), (2, 'the beatles', 'The Beatles');
    INSERT INTO tracks (id, isrc, canonical_title, display_title, artist_id, album_name, duration_ms, popularity)
      VALUES (1, 'JPU901900400', '', '紅蓮華', 1, 'LEO-NiNE', 239000, 562000),
             (2, NULL, 'heyjuderemastered2015', 'Hey Jude - Remastered 2015', 2, '1', 431000, 900000);
    INSERT INTO track_providers (track_id, provider, provider_track_id, raw_metadata_json) VALUES (2, 'spotify', 'sp1', '{"popularity":88}');
  `);

  const migration = runCatalogMigrations(legacyDb);
  assert.equal(migration.from, 0);
  assert.equal(migration.to, LATEST_CATALOG_VERSION);
  assert.equal(migration.applied.length, LATEST_CATALOG_VERSION);

  const [lisa, heyJude] = legacyDb.prepare('SELECT canonical_title, language, version_type, popularity, deezer_rank, spotify_popularity FROM tracks ORDER BY id').all();
  assert.equal(lisa.canonical_title, '紅蓮華');
  assert.equal(lisa.language, 'ja', 'Han title with a JP ISRC');
  assert.equal(lisa.deezer_rank, 562000, 'a legacy rank in `popularity` moves to deezer_rank');
  assert.equal(lisa.popularity, 0, 'v6: the only ranked Japanese track is the bottom of its language');
  assert.equal(heyJude.canonical_title, 'heyjude');
  assert.equal(heyJude.version_type, 'remaster');
  assert.equal(heyJude.spotify_popularity, 88, 'Spotify popularity comes from the raw provider metadata');
  assert.equal(heyJude.popularity, 88, 'v6: a Spotify popularity raises the percentile');
  assert.equal(legacyDb.prepare('SELECT COUNT(*) AS c FROM tracks_fts WHERE tracks_fts MATCH ?').get('"紅蓮華"').c, 1);

  assert.equal(runCatalogMigrations(legacyDb).applied.length, 0);
  legacyDb.close();
});

test('migration v7 translates German Deezer genre names already stored', () => {
  const { catalog } = freshCatalog();
  catalog.upsertTrack({ title: 'Theme', artist: 'Composer', durationMs: 200000, provider: 'deezer', providerTrackId: '1', artistMetadata: { genres: ['Filme/Videospiele', 'Films/Games', 'Klassik'] } });
  catalog.db.exec('PRAGMA user_version = 6');
  runCatalogMigrations(catalog.db, { backup: false });
  const { genres_json: json } = catalog.db.prepare("SELECT genres_json FROM artists WHERE display_name = 'Composer'").get();
  assert.deepEqual(JSON.parse(String(json)), ['Films/Games', 'Classical']);
  catalog.close();
});

test('a short busy timeout makes a blocked write fail fast instead of waiting', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anagroove-busy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'catalog.sqlite');
  const script = new SqliteCatalog(dbPath);
  const server = new SqliteCatalog(dbPath, { busyTimeoutMs: 100 });
  script.db.exec('BEGIN IMMEDIATE;');
  try {
    assert.equal(server.db.prepare('PRAGMA busy_timeout').get()?.timeout, 100);
    const start = Date.now();
    assert.throws(() => server.db.exec('CREATE TABLE busy_probe (x)'), /locked|busy/i);
    assert.ok(Date.now() - start < 1000, 'gave up after about 100 ms');
  } finally {
    script.db.exec('ROLLBACK;');
    script.close();
    server.close();
  }
});
