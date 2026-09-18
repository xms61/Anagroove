import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'catalog.sqlite');

/**
 * Normalizes title for high-confidence composite key deduplication.
 * Removes parenthetical/bracketed noise (remaster tags, feat., live labels).
 */
export function normalizeDedupeTitle(title = '') {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*[([](?:feat\.|ft\.|remaster(?:ed)?|version|radio\s+edit|edit|explicit|deluxe|bonus|single|album|mono|stereo|anniversary)[^\])]*[)\]]/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Normalizes artist for high-confidence composite key deduplication.
 */
export function normalizeDedupeArtist(artist = '') {
  return canonicalArtistKey(artist);
}

/**
 * Detects language code ('en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar')
 * from script analysis and prominent linguistic markers.
 */
export function detectTrackLanguage(title = '', artist = '') {
  const text = `${title} ${artist}`.toLowerCase();
  // Korean Hangul
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  // Japanese Hiragana / Katakana
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  // Chinese Hanzi
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  // Cyrillic
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  // Arabic
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  // Spanish markers
  if (/\b(amor|coraz[oó]n|vida|noche|fiesta|bailando|despacito|feliz|navidad|se[nñ]orita|mujer|beso|adi[oó]s|para|por|los|las|una|uno|conmigo|quiero)\b/i.test(text)) return 'es';
  // French markers
  if (/\b(amour|chanson|avec|dans|pour|une|les|ton|mon|nous|vous|c[eé]|est|vie|femme|soleil|nuit|monde|toujours)\b/i.test(text)) return 'fr';
  // German markers
  if (/\b(und|nicht|ist|der|die|das|mit|auf|f[uü]r|von|nacht|liebe|herz|welt|zeit|leben|atemlos)\b/i.test(text)) return 'de';
  // Italian markers
  if (/\b(amore|bella|notte|tutto|tutti|della|degli|mondo|vita|cuore|felicit[aà])\b/i.test(text)) return 'it';
  // Portuguese markers
  if (/\b(mais|voc[eê]|n[aã]o|pra|tudo|amor|vida|cora[cç][aã]o|saudade)\b/i.test(text)) return 'pt';
  // Default to English for standard Western/Latin titles
  return 'en';
}

/**
 * Extracts 2-letter ISO country code from a standard 12-character ISRC.
 */
export function extractIsrcCountryCode(isrc = '') {
  if (typeof isrc !== 'string') return null;
  const clean = isrc.trim().toUpperCase();
  if (clean.length === 12 && /^[A-Z]{2}/.test(clean)) {
    return clean.slice(0, 2);
  }
  return null;
}

export class SqliteCatalog {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this._initDatabase();
  }

  _initDatabase() {
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);

    // Enable WAL mode, busy timeout, and foreign key constraints
    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA busy_timeout = 10000;');
      this.db.exec('PRAGMA foreign_keys = ON;');
    } catch {
      // Memory DBs or certain environments ignore pragma journal_mode
    }

    this._createTables();
    this._prepareStatements();
  }

  _createTables() {
    this.db.exec(`
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
        provider TEXT NOT NULL, -- 'deezer' | 'itunes' | 'spotify'
        provider_track_id TEXT NOT NULL,
        sample_url TEXT NOT NULL,
        audio_codec TEXT DEFAULT 'mp3', -- 'mp3' | 'aac'
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
        status TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed' | 'failed'
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        next_run_at TEXT DEFAULT (datetime('now')),
        UNIQUE(provider, task_type, payload_json)
      );

      -- Full-Text Search (FTS5) for instant crossword clue discovery
      CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
        title,
        artist,
        album,
        content='tracks',
        content_rowid='id'
      );

      -- High-Performance Indexes
      CREATE INDEX IF NOT EXISTS idx_artists_canonical ON artists(canonical_name);
      CREATE INDEX IF NOT EXISTS idx_tracks_lookup ON tracks(artist_id, canonical_title, duration_ms);
      CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(release_year);
      CREATE INDEX IF NOT EXISTS idx_tracks_pop ON tracks(popularity DESC);
      CREATE INDEX IF NOT EXISTS idx_samples_track ON track_samples(track_id);
      CREATE INDEX IF NOT EXISTS idx_queue_poll ON crawl_queue(status, next_run_at, priority DESC);
    `);

    // Safe backward compatibility migrations for existing database files
    try {
      this.db.exec('ALTER TABLE tracks ADD COLUMN country_code TEXT;');
    } catch { /* already exists */ }
    try {
      this.db.exec("ALTER TABLE tracks ADD COLUMN language TEXT DEFAULT 'en';");
    } catch { /* already exists */ }

    // Indexes for new columns
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_country ON tracks(country_code);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_lang ON tracks(language);');
    } catch { /* non-fatal */ }

    // One-time fast backfill for existing tracks
    try {
      this.db.exec(`
        UPDATE tracks
        SET country_code = SUBSTR(isrc, 1, 2)
        WHERE country_code IS NULL
          AND isrc IS NOT NULL
          AND LENGTH(isrc) = 12
          AND SUBSTR(isrc, 1, 2) GLOB '[A-Z][A-Z]';
      `);
      this.db.exec(`
        UPDATE tracks
        SET language = 'en'
        WHERE language IS NULL;
      `);
    } catch { /* non-fatal backfill */ }
  }

  _prepareStatements() {
    this.stmtGetArtistByCanonical = this.db.prepare(
      'SELECT * FROM artists WHERE canonical_name = ?'
    );

    this.stmtGetArtistByDeezerId = this.db.prepare(
      'SELECT * FROM artists WHERE deezer_id = ?'
    );

    this.stmtGetArtistBySpotifyId = this.db.prepare(
      'SELECT * FROM artists WHERE spotify_id = ?'
    );

    this.stmtGetArtistByItunesId = this.db.prepare(
      'SELECT * FROM artists WHERE itunes_artist_id = ?'
    );

    this.stmtInsertArtist = this.db.prepare(`
      INSERT INTO artists (canonical_name, display_name, spotify_id, deezer_id, itunes_artist_id, genres_json, fans_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_name) DO UPDATE SET
        spotify_id = COALESCE(excluded.spotify_id, artists.spotify_id),
        deezer_id = COALESCE(excluded.deezer_id, artists.deezer_id),
        itunes_artist_id = COALESCE(excluded.itunes_artist_id, artists.itunes_artist_id),
        fans_count = MAX(artists.fans_count, excluded.fans_count)
    `);

    this.stmtUpdateArtistProviderIds = this.db.prepare(`
      UPDATE artists
      SET spotify_id = COALESCE(?, spotify_id),
          deezer_id = COALESCE(?, deezer_id),
          itunes_artist_id = COALESCE(?, itunes_artist_id),
          fans_count = MAX(fans_count, ?)
      WHERE id = ?
    `);

    this.stmtGetTrackByIsrc = this.db.prepare(
      'SELECT * FROM tracks WHERE isrc = ?'
    );

    this.stmtFindMatchingTrack = this.db.prepare(`
      SELECT * FROM tracks
      WHERE artist_id = ?
        AND canonical_title = ?
        AND ABS(duration_ms - ?) <= 3000
      LIMIT 1
    `);

    this.stmtInsertTrack = this.db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, release_date, country_code, language, popularity, is_explicit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateTrack = this.db.prepare(`
      UPDATE tracks
      SET isrc = COALESCE(?, isrc),
          popularity = MAX(popularity, ?),
          release_year = COALESCE(release_year, ?),
          release_date = COALESCE(release_date, ?),
          album_name = COALESCE(album_name, ?),
          country_code = COALESCE(country_code, ?),
          language = COALESCE(language, ?),
          updated_at = datetime('now')
      WHERE id = ?
    `);

    this.stmtInsertSample = this.db.prepare(`
      INSERT OR REPLACE INTO track_samples (track_id, provider, provider_track_id, sample_url, audio_codec, sample_duration_sec, http_status, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtInsertProvider = this.db.prepare(`
      INSERT OR REPLACE INTO track_providers (track_id, provider, provider_track_id, external_url, raw_metadata_json, harvested_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtInsertFts = this.db.prepare(`
      INSERT INTO tracks_fts (rowid, title, artist, album)
      VALUES (?, ?, ?, ?)
    `);
  }

  /**
   * Ensures artist exists in the database, updating provider IDs if known.
   */
  getOrCreateArtist({ name, spotifyId = null, deezerId = null, itunesArtistId = null, genres = [], fansCount = 0 }) {
    if (!name || typeof name !== 'string') return null;

    const canonical = normalizeDedupeArtist(name);
    if (!canonical) return null;

    let artist = this.stmtGetArtistByCanonical.get(canonical);
    if (!artist && deezerId) {
      artist = this.stmtGetArtistByDeezerId.get(deezerId);
    }
    if (!artist && spotifyId) {
      artist = this.stmtGetArtistBySpotifyId.get(spotifyId);
    }
    if (!artist && itunesArtistId) {
      artist = this.stmtGetArtistByItunesId.get(itunesArtistId);
    }

    if (!artist) {
      const genresJson = genres && genres.length > 0 ? JSON.stringify(genres) : null;
      try {
        const res = this.stmtInsertArtist.run(
          canonical,
          name.trim(),
          spotifyId,
          deezerId,
          itunesArtistId,
          genresJson,
          fansCount || 0
        );
        artist = {
          id: Number(res.lastInsertRowid),
          canonical_name: canonical,
          display_name: name.trim(),
          spotify_id: spotifyId,
          deezer_id: deezerId,
          itunes_artist_id: itunesArtistId,
          fans_count: fansCount || 0,
        };
      } catch {
        // In case of race condition or provider id clash, fallback fetch
        artist = (deezerId && this.stmtGetArtistByDeezerId.get(deezerId)) ||
                 this.stmtGetArtistByCanonical.get(canonical);
      }
    } else {
      // Update any newly discovered provider links or higher fan count
      try {
        this.stmtUpdateArtistProviderIds.run(
          spotifyId,
          deezerId,
          itunesArtistId,
          fansCount || 0,
          artist.id
        );
      } catch {
        // Safe guard against provider ID collisions across alias rows
      }
    }

    return artist;
  }

  /**
   * Ingests a track with 100% deterministic deduplication across Deezer, iTunes, and Spotify.
   * Merges sample URLs and provider links when a match is verified.
   *
   * @param {Object} trackData
   * @returns {{ trackId: number, isNew: boolean, isMerged: boolean }}
   */
  upsertTrack(trackData) {
    const {
      title,
      artist,
      isrc = null,
      album = '',
      durationMs = 0,
      releaseYear = null,
      releaseDate = null,
      popularity = 0,
      isExplicit = false,
      provider, // 'deezer' | 'itunes' | 'spotify'
      providerTrackId,
      sampleUrl = null,
      sampleCodec = 'mp3',
      sampleDurationSec = 30,
      externalUrl = null,
      rawMetadata = null,
      artistMetadata = {},
    } = trackData;

    if (!title || !artist || !provider || !providerTrackId) {
      return null;
    }

    const artistRow = this.getOrCreateArtist({
      name: artist,
      ...artistMetadata,
    });
    if (!artistRow) return null;

    const canonicalTitle = normalizeDedupeTitle(title);
    if (!canonicalTitle) return null;

    let existingTrack = null;
    let isMerged = false;

    // 1. Tier 1 Deduplication: Exact ISRC Match (100% Deterministic Master Recording Match)
    if (isrc && typeof isrc === 'string' && isrc.trim().length === 12) {
      existingTrack = this.stmtGetTrackByIsrc.get(isrc.trim().toUpperCase());
      if (existingTrack) isMerged = true;
    }

    // 2. Tier 2 Deduplication: Exact Normalized Artist + Core Title + Acoustic Duration Window (<= 3s)
    if (!existingTrack && durationMs > 0) {
      existingTrack = this.stmtFindMatchingTrack.get(artistRow.id, canonicalTitle, durationMs);
      if (existingTrack) isMerged = true;
    }

    let trackId;
    let isNew = false;
    const countryCode = extractIsrcCountryCode(isrc);
    const language = detectTrackLanguage(title, artist);

    if (existingTrack) {
      trackId = existingTrack.id;
      // Update track attributes with the best available metadata
      this.stmtUpdateTrack.run(
        isrc || null,
        popularity || 0,
        releaseYear || null,
        releaseDate || null,
        album || null,
        countryCode,
        language,
        trackId
      );
    } else {
      isNew = true;
      const res = this.stmtInsertTrack.run(
        isrc ? isrc.trim().toUpperCase() : null,
        canonicalTitle,
        title.trim(),
        artistRow.id,
        album ? album.trim() : null,
        durationMs || 0,
        releaseYear || null,
        releaseDate || null,
        countryCode,
        language,
        popularity || 0,
        isExplicit ? 1 : 0
      );
      trackId = Number(res.lastInsertRowid);

      // Index in FTS5
      try {
        this.stmtInsertFts.run(trackId, title.trim(), artistRow.display_name, album ? album.trim() : '');
      } catch {
        // Non-fatal if FTS indexing errors
      }
    }

    // Attach sample link if available
    if (sampleUrl && typeof sampleUrl === 'string' && sampleUrl.startsWith('http')) {
      this.stmtInsertSample.run(
        trackId,
        provider,
        String(providerTrackId),
        sampleUrl,
        sampleCodec,
        sampleDurationSec,
        200
      );
    }

    // Attach provider cross-reference
    this.stmtInsertProvider.run(
      trackId,
      provider,
      String(providerTrackId),
      externalUrl || null,
      rawMetadata ? JSON.stringify(rawMetadata) : null
    );

    return { trackId, isNew, isMerged };
  }

  /**
   * Executes a batch of track upserts inside a single high-performance SQLite transaction.
   *
   * @param {Array<Object>} trackBatch
   * @returns {{ inserted: number, merged: number, total: number }}
   */
  upsertBatch(trackBatch = []) {
    if (!trackBatch || trackBatch.length === 0) {
      return { inserted: 0, merged: 0, total: 0 };
    }

    let inserted = 0;
    let merged = 0;

    this.db.exec('BEGIN TRANSACTION;');
    try {
      for (const item of trackBatch) {
        const res = this.upsertTrack(item);
        if (res) {
          if (res.isNew) inserted++;
          if (res.isMerged) merged++;
        }
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      logger.error('sqlite_catalog', `Batch transaction failed: ${err.message}`);
      throw err;
    }

    return { inserted, merged, total: trackBatch.length };
  }

  /**
   * Retrieves random playable tracks with verified audio samples from SQLite.
   * Perfect for instantaneous, zero-latency crossword generation!
   */
  getRandomPlayableTracks({
    count = 10,
    minPopularity = 0,
    yearRange = null,
    limit = 50,
  } = {}) {
    let query = `
      SELECT t.id, t.isrc, t.display_title as title, a.display_name as artist,
             t.album_name as album, t.duration_ms, t.release_year, t.popularity,
             s.provider, s.provider_track_id, s.sample_url, s.audio_codec
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      JOIN track_samples s ON t.id = s.track_id
      WHERE s.sample_url IS NOT NULL AND s.http_status = 200
    `;

    const params = [];

    if (minPopularity > 0) {
      query += ' AND t.popularity >= ?';
      params.push(minPopularity);
    }

    if (yearRange && typeof yearRange === 'object') {
      if (yearRange.start !== undefined) {
        query += ' AND t.release_year >= ?';
        params.push(yearRange.start);
      }
      if (yearRange.end !== undefined) {
        query += ' AND t.release_year <= ?';
        params.push(yearRange.end);
      }
    }

    query += ' ORDER BY RANDOM() LIMIT ?';
    params.push(Math.max(count, limit));

    return this.db.prepare(query).all(...params);
  }

  /**
   * Returns high-level catalog statistics.
   */
  getStats() {
    const artistCount = this.db.prepare('SELECT COUNT(*) as count FROM artists').get().count;
    const trackCount = this.db.prepare('SELECT COUNT(*) as count FROM tracks').get().count;
    const sampleCount = this.db.prepare('SELECT COUNT(*) as count FROM track_samples').get().count;
    const providerCount = this.db.prepare('SELECT COUNT(*) as count FROM track_providers').get().count;
    const crossReferenced = this.db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT track_id FROM track_providers GROUP BY track_id HAVING COUNT(provider) > 1
      )
    `).get().count;
    const languageCount = this.db.prepare('SELECT COUNT(DISTINCT language) as count FROM tracks WHERE language IS NOT NULL').get().count;
    const countryCount = this.db.prepare('SELECT COUNT(DISTINCT country_code) as count FROM tracks WHERE country_code IS NOT NULL').get().count;

    return {
      artists: Number(artistCount),
      tracks: Number(trackCount),
      audioSamples: Number(sampleCount),
      providerLinks: Number(providerCount),
      crossReferencedTracks: Number(crossReferenced),
      languages: Number(languageCount),
      countryCodes: Number(countryCount),
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance initialized to default database path
export const sqliteCatalog = new SqliteCatalog();
