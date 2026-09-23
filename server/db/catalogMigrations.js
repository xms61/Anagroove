/**
 * Versioned schema migrations for catalog.sqlite, tracked in PRAGMA user_version.
 * Each migration runs in its own transaction. Before migrating a populated file
 * database, a full copy is written next to it with VACUUM INTO (skip with
 * SPOTYSPICE_SKIP_DB_BACKUP=1).
 */
import path from 'path';
import { logger } from '../logger.js';
import {
  baseTitleKey,
  classifyVersion,
  deezerRankToScore,
  detectTrackLanguage,
} from './trackNormalization.js';
import { recomputeCatalogLanguages } from './catalogLanguages.js';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';

function baselineSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      spotify_id TEXT UNIQUE,
      deezer_id INTEGER UNIQUE,
      itunes_artist_id INTEGER UNIQUE,
      genres_json TEXT,
      fans_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isrc TEXT UNIQUE,
      canonical_title TEXT NOT NULL,
      display_title TEXT NOT NULL,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      album_name TEXT,
      duration_ms INTEGER NOT NULL,
      release_year INTEGER,
      release_date TEXT,
      country_code TEXT,
      language TEXT DEFAULT 'en',
      popularity INTEGER DEFAULT 0,
      is_explicit INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS track_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_track_id TEXT NOT NULL,
      sample_url TEXT NOT NULL,
      audio_codec TEXT DEFAULT 'mp3',
      sample_duration_sec INTEGER DEFAULT 30,
      http_status INTEGER DEFAULT 200,
      last_checked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(track_id, provider)
    );

    CREATE TABLE IF NOT EXISTS track_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_track_id TEXT NOT NULL,
      external_url TEXT,
      raw_metadata_json TEXT,
      harvested_at TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, provider_track_id)
    );

    CREATE TABLE IF NOT EXISTS crawl_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      task_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      next_run_at TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, task_type, payload_json)
    );

    CREATE INDEX IF NOT EXISTS idx_artists_canonical ON artists(canonical_name);
    CREATE INDEX IF NOT EXISTS idx_tracks_lookup ON tracks(artist_id, canonical_title, duration_ms);
    CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(release_year);
    CREATE INDEX IF NOT EXISTS idx_tracks_pop ON tracks(popularity DESC);
    CREATE INDEX IF NOT EXISTS idx_tracks_pop_year ON tracks(popularity DESC, release_year);
    CREATE INDEX IF NOT EXISTS idx_samples_track ON track_samples(track_id);
    CREATE INDEX IF NOT EXISTS idx_providers_lookup ON track_providers(track_id, provider);
    CREATE INDEX IF NOT EXISTS idx_providers_provider_id ON track_providers(provider, provider_track_id);
    CREATE INDEX IF NOT EXISTS idx_queue_poll ON crawl_queue(status, next_run_at, priority DESC);
  `);

  // Columns added to early catalogs after their creation
  const trackColumns = new Set(db.prepare('PRAGMA table_info(tracks)').all().map(c => c.name));
  if (!trackColumns.has('country_code')) db.exec('ALTER TABLE tracks ADD COLUMN country_code TEXT;');
  if (!trackColumns.has('language')) db.exec("ALTER TABLE tracks ADD COLUMN language TEXT DEFAULT 'en';");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_lang_country ON tracks(language, country_code);
    CREATE INDEX IF NOT EXISTS idx_tracks_country ON tracks(country_code);
    CREATE INDEX IF NOT EXISTS idx_tracks_lang ON tracks(language);
    CREATE INDEX IF NOT EXISTS idx_tracks_lang_pop_year ON tracks(language, popularity DESC, release_year);

    UPDATE tracks SET country_code = SUBSTR(isrc, 1, 2)
    WHERE country_code IS NULL AND isrc IS NOT NULL AND LENGTH(isrc) = 12 AND SUBSTR(isrc, 1, 2) GLOB '[A-Z][A-Z]';
    UPDATE tracks SET language = 'en' WHERE language IS NULL;
  `);
}

/** FTS5 trigram index over title/artist/album, kept in sync by triggers. */
export function createTracksFts(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS tracks_fts_ai;
    DROP TRIGGER IF EXISTS tracks_fts_ad;
    DROP TRIGGER IF EXISTS tracks_fts_au;
    DROP TABLE IF EXISTS tracks_fts;

    -- Contentless trigram index: substring matching that also works for kana, hangul and kanji
    CREATE VIRTUAL TABLE tracks_fts USING fts5(
      title,
      artist,
      album,
      content='',
      contentless_delete=1,
      tokenize='trigram remove_diacritics 1'
    );

    INSERT INTO tracks_fts (rowid, title, artist, album)
    SELECT t.id, t.display_title, a.display_name, COALESCE(t.album_name, '')
    FROM tracks t JOIN artists a ON a.id = t.artist_id;

    CREATE TRIGGER tracks_fts_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts (rowid, title, artist, album)
      VALUES (new.id, new.display_title, (SELECT display_name FROM artists WHERE id = new.artist_id), COALESCE(new.album_name, ''));
    END;

    CREATE TRIGGER tracks_fts_ad AFTER DELETE ON tracks BEGIN
      DELETE FROM tracks_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER tracks_fts_au AFTER UPDATE OF display_title, album_name, artist_id ON tracks BEGIN
      DELETE FROM tracks_fts WHERE rowid = old.id;
      INSERT INTO tracks_fts (rowid, title, artist, album)
      VALUES (new.id, new.display_title, (SELECT display_name FROM artists WHERE id = new.artist_id), COALESCE(new.album_name, ''));
    END;
  `);
}

function registerNormalizationFunctions(db) {
  db.function('ss_base_title', { deterministic: true }, (title) => baseTitleKey(title || ''));
  db.function('ss_version_type', { deterministic: true }, (title, album) => classifyVersion(title || '', album || ''));
  db.function('ss_language', { deterministic: true }, (title, artist, isrc) => detectTrackLanguage(title || '', artist || '', { isrc }));
  db.function('ss_deezer_score', { deterministic: true }, (rank) => deezerRankToScore(rank));
}

function schemaV2(db) {
  registerNormalizationFunctions(db);

  const trackColumns = new Set(db.prepare('PRAGMA table_info(tracks)').all().map(c => c.name));
  if (!trackColumns.has('version_type')) db.exec("ALTER TABLE tracks ADD COLUMN version_type TEXT NOT NULL DEFAULT 'original';");
  if (!trackColumns.has('deezer_rank')) db.exec('ALTER TABLE tracks ADD COLUMN deezer_rank INTEGER;');
  if (!trackColumns.has('spotify_popularity')) db.exec('ALTER TABLE tracks ADD COLUMN spotify_popularity INTEGER;');
  if (!trackColumns.has('rand_key')) db.exec('ALTER TABLE tracks ADD COLUMN rand_key REAL NOT NULL DEFAULT 0;');

  db.exec(`
    -- Raw provider popularity: legacy rows stored the Deezer rank (up to ~1M) in "popularity"
    UPDATE tracks SET deezer_rank = popularity WHERE popularity > 100;
    UPDATE tracks SET spotify_popularity = (
      SELECT MAX(CAST(json_extract(p.raw_metadata_json, '$.popularity') AS INTEGER))
      FROM track_providers p
      WHERE p.track_id = tracks.id AND p.provider = 'spotify' AND json_valid(p.raw_metadata_json)
    );

    -- "popularity" becomes the single 0-100 score (Spotify reference, else mapped Deezer rank)
    UPDATE tracks SET popularity = CASE
      WHEN spotify_popularity IS NOT NULL THEN MAX(0, MIN(100, spotify_popularity))
      WHEN deezer_rank IS NOT NULL THEN ss_deezer_score(deezer_rank)
      ELSE MAX(0, MIN(100, COALESCE(popularity, 0)))
    END;

    -- Unicode-aware base titles (kana/hangul/kanji no longer collapse to ''), version classes,
    -- ISRC-aware language, and a random sampling key
    UPDATE tracks SET
      canonical_title = ss_base_title(display_title),
      version_type = ss_version_type(display_title, album_name),
      language = ss_language(display_title, (SELECT display_name FROM artists WHERE id = tracks.artist_id), isrc),
      rand_key = (ABS(RANDOM()) % 1000000000) / 1000000000.0;

    CREATE INDEX IF NOT EXISTS idx_tracks_base ON tracks(artist_id, canonical_title);
    CREATE INDEX IF NOT EXISTS idx_tracks_pick ON tracks(language, popularity, rand_key);
    CREATE INDEX IF NOT EXISTS idx_tracks_version ON tracks(version_type);
  `);

  createTracksFts(db);
}

function schemaV3(db) {
  const artistColumns = new Set(db.prepare('PRAGMA table_info(artists)').all().map(c => c.name));
  if (!artistColumns.has('primary_language')) db.exec('ALTER TABLE artists ADD COLUMN primary_language TEXT;');
  if (!artistColumns.has('enriched_at')) db.exec('ALTER TABLE artists ADD COLUMN enriched_at TEXT;');

  const trackColumns = new Set(db.prepare('PRAGMA table_info(tracks)').all().map(c => c.name));
  // Set once a provider lookup has been attempted, so enrichment passes are resumable and never loop
  if (!trackColumns.has('enriched_at')) db.exec('ALTER TABLE tracks ADD COLUMN enriched_at TEXT;');
  if (!trackColumns.has('itunes_checked_at')) db.exec('ALTER TABLE tracks ADD COLUMN itunes_checked_at TEXT;');

  db.exec('CREATE INDEX IF NOT EXISTS idx_artists_language ON artists(primary_language);');

  // Identity keys used to strip every combining mark, deleting kana dakuten (アイドル -> アイトル)
  // and decomposing hangul; recompute them with the corrected normalization. New keys only keep
  // more information, so they cannot collide (OR IGNORE keeps the old key if one ever did).
  registerNormalizationFunctions(db);
  db.function('ss_artist_key', { deterministic: true }, (name) => canonicalArtistKey(name || ''));
  db.exec(`
    UPDATE OR IGNORE artists SET canonical_name = ss_artist_key(display_name)
    WHERE canonical_name <> ss_artist_key(display_name) AND ss_artist_key(display_name) <> '';
    UPDATE tracks SET canonical_title = ss_base_title(display_title)
    WHERE canonical_title <> ss_base_title(display_title);
  `);

  // Replace the old title-regex languages ("Die With A Smile" was German) with the
  // artist-voted ELD classifier
  recomputeCatalogLanguages(db);
}

function schemaV4(db) {
  const trackColumns = new Set(db.prepare('PRAGMA table_info(tracks)').all().map(c => c.name));
  // Set once the track's Deezer album has been looked up for its release date (catalog:enrich --albums)
  if (!trackColumns.has('album_checked_at')) db.exec('ALTER TABLE tracks ADD COLUMN album_checked_at TEXT;');
}

export const CATALOG_MIGRATIONS = Object.freeze([
  { version: 1, name: 'baseline schema', up: baselineSchema },
  { version: 2, name: 'schema v2: base titles, version types, 0-100 popularity, trigram FTS', up: schemaV2 },
  { version: 3, name: 'schema v3: artist languages, enrichment markers, ELD language classifier', up: schemaV3 },
  { version: 4, name: 'schema v4: album enrichment marker', up: schemaV4 },
]);

export const LATEST_CATALOG_VERSION = CATALOG_MIGRATIONS[CATALOG_MIGRATIONS.length - 1].version;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function hasCatalogData(db) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tracks'").get();
  if (!table) return false;
  return Boolean(db.prepare('SELECT 1 FROM tracks LIMIT 1').get());
}

/**
 * Applies pending migrations.
 * @returns {{ from: number, to: number, applied: string[], backupPath: string | null }}
 */
export function runCatalogMigrations(db, { dbPath = ':memory:', backup = process.env.SPOTYSPICE_SKIP_DB_BACKUP !== '1' } = {}) {
  const from = Number(db.prepare('PRAGMA user_version').get().user_version) || 0;
  const pending = CATALOG_MIGRATIONS.filter(m => m.version > from);
  if (pending.length === 0) return { from, to: from, applied: [], backupPath: null };

  let backupPath = null;
  if (backup && dbPath !== ':memory:' && hasCatalogData(db)) {
    backupPath = path.join(path.dirname(dbPath), `${path.basename(dbPath, '.sqlite')}.backup-v${from}-${timestamp()}.sqlite`);
    logger.info('migrations', `Backing up catalog before migrating v${from} -> v${LATEST_CATALOG_VERSION}: ${backupPath}`);
    db.prepare('VACUUM INTO ?').run(backupPath);
  }

  const applied = [];
  for (const migration of pending) {
    const started = Date.now();
    db.exec('BEGIN IMMEDIATE;');
    try {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version};`);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw new Error(`Catalog migration v${migration.version} (${migration.name}) failed: ${err.message}`, { cause: err });
    }
    applied.push(migration.name);
    if (dbPath !== ':memory:') {
      logger.info('migrations', `Applied v${migration.version} (${migration.name}) in ${Date.now() - started}ms`);
    }
  }

  return { from, to: LATEST_CATALOG_VERSION, applied, backupPath };
}
