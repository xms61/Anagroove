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

    // Enable WAL mode, busy timeout, foreign keys, memory-mapped I/O, and cache tuning
    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA busy_timeout = 10000;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA mmap_size = 2147483648;'); // 2GB memory-mapped I/O
      this.db.exec('PRAGMA cache_size = -64000;');    // 64MB memory page cache
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
      CREATE INDEX IF NOT EXISTS idx_tracks_pop_year ON tracks(popularity DESC, release_year);
      CREATE INDEX IF NOT EXISTS idx_tracks_lang_country ON tracks(language, country_code);
      CREATE INDEX IF NOT EXISTS idx_samples_track ON track_samples(track_id);
      CREATE INDEX IF NOT EXISTS idx_providers_lookup ON track_providers(track_id, provider);
      CREATE INDEX IF NOT EXISTS idx_providers_provider_id ON track_providers(provider, provider_track_id);
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
      // Composite index for the most common theme-filtered query pattern
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_lang_pop_year ON tracks(language, popularity DESC, release_year);');
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
   * Inserts or updates an audio sample for a track in SQLite.
   * Enables persistent caching of on-the-fly lazy preview resolutions.
   */
  insertSample(trackId, {
    provider = 'deezer',
    providerTrackId = '',
    sampleUrl,
    audioCodec = 'mp3',
    sampleDurationSec = 30,
    httpStatus = 200,
  } = {}) {
    if (!trackId || !sampleUrl) return false;
    try {
      this.stmtInsertSample.run(
        Number(trackId),
        String(provider || 'deezer'),
        String(providerTrackId || ''),
        String(sampleUrl),
        String(audioCodec || 'mp3'),
        Number(sampleDurationSec || 30),
        Number(httpStatus || 200)
      );
      return true;
    } catch (err) {
      logger.warn('sqlite_catalog', `Failed to insert sample for track ${trackId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Retrieves random playable tracks from SQLite.
   * By default returns tracks with verified audio samples (zero-latency).
   * When allowSampleless is true, also returns candidate tracks needing JIT lazy preview hydration.
   */
  getRandomPlayableTracks({
    count = 10,
    minPopularity = 0,
    yearRange = null,
    allowSampleless = false,
    limit = 50,
  } = {}) {
    let query = `
      SELECT t.id, t.isrc, t.display_title as title, a.display_name as artist,
             t.album_name as album, t.duration_ms, t.release_year, t.popularity,
             s.provider, s.provider_track_id, s.sample_url, s.audio_codec,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'spotify' LIMIT 1) AS spotify_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'itunes' LIMIT 1) AS itunes_id
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      ${allowSampleless ? 'LEFT' : 'INNER'} JOIN track_samples s ON t.id = s.track_id
      WHERE 1=1
    `;

    const params = [];

    if (!allowSampleless) {
      query += ' AND s.sample_url IS NOT NULL AND s.http_status = 200';
    }

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
   * Theme-aware catalog search combining FTS5 full-text matching on titles/artists/albums
   * with genre JSON filtering on artist metadata. Returns a popularity-weighted
   * random sample ideal for crossword puzzle candidate selection.
   *
   * Uses FTS5 MATCH (10-100x faster than LIKE '%term%') on 285k+ tracks.
   * Excludes recently-played track IDs at the SQL level to reduce wasted rejection sampling.
   */
  searchCatalogByTheme({
    ftsQuery = '',         // FTS5 search tokens, e.g. "rock grunge" or '"city pop"'
    genres = [],           // Genre strings to match in artists.genres_json
    artist = '',           // Specific artist canonical name
    language = null,       // Language filter: 'en', ['ko', 'en'], etc.
    yearRange = null,      // { start, end }
    minPopularity = 0,
    excludeTrackIds = [],  // Recently-played catalog track IDs to exclude
    allowSampleless = true,
    limit = 100,
  } = {}) {
    const params = [];
    const conditions = ['1=1'];

    // Audio sample join
    const sampleJoin = allowSampleless ? 'LEFT' : 'INNER';

    // Artist filter
    if (artist && typeof artist === 'string' && artist.trim()) {
      const canonical = normalizeDedupeArtist(artist);
      conditions.push('(a.canonical_name = ? OR a.display_name = ? OR a.display_name LIKE ? OR a.display_name LIKE ?)');
      params.push(canonical, artist.trim(), `${artist.trim()} %`, `${artist.trim()} &%`);
    }

    // Genre filter via JSON substring match on artists.genres_json
    if (Array.isArray(genres) && genres.length > 0) {
      const genreClauses = genres.map(() => 'a.genres_json LIKE ?').join(' OR ');
      conditions.push(`(${genreClauses})`);
      for (const g of genres) {
        params.push(`%"${g.trim()}"%`);
      }
    }

    // Language filter
    if (language) {
      if (Array.isArray(language) && language.length > 0) {
        const langClauses = language.map(() => 't.language = ?').join(' OR ');
        conditions.push(`(${langClauses})`);
        params.push(...language);
      } else if (typeof language === 'string' && language.trim()) {
        conditions.push('(t.language = ? OR t.language IS NULL)');
        params.push(language.trim());
      }
    }

    // Temporal filter
    if (yearRange && typeof yearRange === 'object') {
      if (yearRange.start !== undefined) {
        conditions.push('t.release_year >= ?');
        params.push(yearRange.start);
      }
      if (yearRange.end !== undefined) {
        conditions.push('t.release_year <= ?');
        params.push(yearRange.end);
      }
    }

    // Popularity floor
    if (minPopularity > 0) {
      conditions.push('t.popularity >= ?');
      params.push(minPopularity);
    }

    // Exclude recently-played tracks to reduce wasted rejection sampling
    if (Array.isArray(excludeTrackIds) && excludeTrackIds.length > 0) {
      const placeholders = excludeTrackIds.map(() => '?').join(', ');
      conditions.push(`t.id NOT IN (${placeholders})`);
      params.push(...excludeTrackIds);
    }

    // Audio sample filter
    if (!allowSampleless) {
      conditions.push('s.sample_url IS NOT NULL AND s.http_status = 200');
    }

    const whereClause = conditions.join(' AND ');

    // If FTS5 query is provided, use it for fast full-text matching
    if (ftsQuery && typeof ftsQuery === 'string' && ftsQuery.trim()) {
      try {
        // FTS5 join path: match on title, artist, album via virtual table
        const ftsResults = this.db.prepare(`
          SELECT t.id, t.isrc, t.language, t.display_title as title, a.display_name as artist,
                 t.album_name as album, t.duration_ms, t.release_year, t.popularity,
                 s.provider, s.provider_track_id, s.sample_url, s.audio_codec,
                 (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id,
                 (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'spotify' LIMIT 1) AS spotify_id,
                 (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'itunes' LIMIT 1) AS itunes_id
          FROM tracks_fts
          JOIN tracks t ON tracks_fts.rowid = t.id
          JOIN artists a ON t.artist_id = a.id
          ${sampleJoin} JOIN track_samples s ON t.id = s.track_id
          WHERE tracks_fts MATCH ?
            AND ${whereClause}
          ORDER BY (t.popularity * 3 + ABS(RANDOM()) % 100) DESC
          LIMIT ?
        `).all(ftsQuery, ...params, limit);

        if (ftsResults && ftsResults.length >= 10) {
          return ftsResults;
        }
        // Fall through to LIKE fallback if FTS returns insufficient results
      } catch {
        // FTS5 syntax error or unavailable — fall through to LIKE fallback
      }

      // LIKE fallback when FTS5 returns too few results or errors
      const term = `%${ftsQuery.replace(/['"*]/g, '').trim()}%`;
      const fallbackConditions = [...conditions,
        '(t.canonical_title LIKE ? OR t.display_title LIKE ? OR t.album_name LIKE ? OR a.display_name LIKE ?)'
      ];
      return this.db.prepare(`
        SELECT t.id, t.isrc, t.language, t.display_title as title, a.display_name as artist,
               t.album_name as album, t.duration_ms, t.release_year, t.popularity,
               s.provider, s.provider_track_id, s.sample_url, s.audio_codec,
               (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id,
               (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'spotify' LIMIT 1) AS spotify_id,
               (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'itunes' LIMIT 1) AS itunes_id
        FROM tracks t
        JOIN artists a ON t.artist_id = a.id
        ${sampleJoin} JOIN track_samples s ON t.id = s.track_id
        WHERE ${fallbackConditions.join(' AND ')}
        ORDER BY (t.popularity * 3 + ABS(RANDOM()) % 100) DESC
        LIMIT ?
      `).all(...params, term, term, term, term, limit);
    }

    // No FTS query — genre/artist/language filter only
    return this.db.prepare(`
      SELECT t.id, t.isrc, t.language, t.display_title as title, a.display_name as artist,
             t.album_name as album, t.duration_ms, t.release_year, t.popularity,
             s.provider, s.provider_track_id, s.sample_url, s.audio_codec,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'spotify' LIMIT 1) AS spotify_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'itunes' LIMIT 1) AS itunes_id
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      ${sampleJoin} JOIN track_samples s ON t.id = s.track_id
      WHERE ${whereClause}
      ORDER BY (t.popularity * 3 + ABS(RANDOM()) % 100) DESC
      LIMIT ?
    `).all(...params, limit);
  }

  /**
   * Advanced multi-attribute search for crossword puzzle candidate retrieval.
   * Matches artists, genres, text tokens, temporal bounds, and answer length constraints.
   */
  queryCatalogForCrossword({
    artist = '',
    text = '',
    genres = [],
    language = null,
    yearRange = null,
    minPopularity = 0,
    answerLength = null,
    allowSampleless = true,
    requireSample = false,
    variety = false,
    limit = 60,
  } = {}) {
    let query = `
      SELECT t.id, t.isrc, t.language, t.display_title as title, a.display_name as artist,
             t.album_name as album, t.duration_ms, t.release_year, t.popularity,
             s.provider, s.provider_track_id, s.sample_url, s.audio_codec,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'spotify' LIMIT 1) AS spotify_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'itunes' LIMIT 1) AS itunes_id
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      ${requireSample || !allowSampleless ? 'INNER' : 'LEFT'} JOIN track_samples s ON t.id = s.track_id
      WHERE 1=1
    `;

    const params = [];

    if (requireSample || !allowSampleless) {
      query += ' AND s.sample_url IS NOT NULL AND s.http_status = 200';
    }

    if (artist && typeof artist === 'string' && artist.trim()) {
      const canonical = normalizeDedupeArtist(artist);
      query += ' AND (a.canonical_name = ? OR a.display_name = ? OR a.display_name LIKE ? OR a.display_name LIKE ?)';
      params.push(canonical, artist.trim(), `${artist.trim()} %`, `${artist.trim()} &%`);
    }

    if (text && typeof text === 'string' && text.trim()) {
      const term = `%${text.trim()}%`;
      query += ' AND (t.canonical_title LIKE ? OR t.display_title LIKE ? OR t.album_name LIKE ? OR a.display_name LIKE ?)';
      params.push(term, term, term, term);
    }

    if (Array.isArray(genres) && genres.length > 0) {
      const genreClauses = genres.map(() => 'a.genres_json LIKE ?').join(' OR ');
      query += ` AND (${genreClauses})`;
      for (const g of genres) {
        params.push(`%"${g.trim()}"%`);
      }
    }

    if (language) {
      if (Array.isArray(language) && language.length > 0) {
        const langClauses = language.map(() => 't.language = ?').join(' OR ');
        query += ` AND (${langClauses})`;
        params.push(...language);
      } else if (typeof language === 'string' && language.trim()) {
        query += ' AND (t.language = ? OR t.language IS NULL)';
        params.push(language.trim());
      }
    }

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

    if (answerLength) {
      if (typeof answerLength === 'object') {
        if (answerLength.min !== undefined) {
          query += ' AND (LENGTH(t.canonical_title) >= ? OR LENGTH(a.canonical_name) >= ?)';
          params.push(answerLength.min, answerLength.min);
        }
        if (answerLength.max !== undefined) {
          query += ' AND (LENGTH(t.canonical_title) <= ? OR LENGTH(a.canonical_name) <= ?)';
          params.push(answerLength.max, answerLength.max);
        }
      } else if (typeof answerLength === 'number') {
        query += ' AND (LENGTH(t.canonical_title) <= ? OR LENGTH(a.canonical_name) <= ?)';
        params.push(answerLength, answerLength);
      }
    }

    // Prioritize tracks with active previews, then popularity, with randomized tie-breaking
    if (variety) {
      query += ' ORDER BY (CASE WHEN s.sample_url IS NOT NULL THEN 1 ELSE 0 END) DESC, CAST(t.popularity / 100000 AS INT) DESC, RANDOM() LIMIT ?';
    } else {
      query += ' ORDER BY (CASE WHEN s.sample_url IS NOT NULL THEN 1 ELSE 0 END) DESC, t.popularity DESC, RANDOM() LIMIT ?';
    }
    params.push(limit);

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
      samples: Number(sampleCount),
      providerLinks: Number(providerCount),
      crossReferencedTracks: Number(crossReferenced),
      crossReferenced: Number(crossReferenced),
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
