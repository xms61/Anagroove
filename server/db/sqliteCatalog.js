import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { logger } from '../logger.js';
import { DATA_DIR } from '../paths.js';
import { runCatalogMigrations } from './catalogMigrations.js';
import { lazySingleton } from './lazySingleton.js';
import { isAuthenticMetadata } from '../policy/authenticityRules.js';
import {
  baseTitleKey,
  classifyVersion,
  detectTrackLanguage,
  extractIsrcCountryCode,
  isAcceptedVersion,
  isAllowedLanguage,
  isValidDuration,
  normalizeIsrc,
  normalizePopularity,
  normalizeReleaseDate,
  normalizeReleaseYear,
} from './trackNormalization.js';

const DEFAULT_DB_PATH = path.join(DATA_DIR, 'catalog.sqlite');

/**
 * Dedupe key for a song title: Unicode-aware, credit/version decorations removed.
 */
export function normalizeDedupeTitle(title = '') {
  return baseTitleKey(title);
}

/**
 * Normalizes artist for high-confidence composite key deduplication.
 */
export function normalizeDedupeArtist(artist = '') {
  return canonicalArtistKey(artist);
}

export { detectTrackLanguage, extractIsrcCountryCode };

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
    this.migration = runCatalogMigrations(this.db, { dbPath: this.dbPath });
    this.rejectionStats = { missingFields: 0, title: 0, language: 0, version: 0, inauthentic: 0, duration: 0 };
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

    // Tier 2: one row per song and artist, whatever the release or duration
    this.stmtFindMatchingTrack = this.db.prepare(`
      SELECT * FROM tracks
      WHERE artist_id = ?
        AND canonical_title = ?
      ORDER BY (version_type = 'original') DESC, popularity DESC
      LIMIT 1
    `);

    this.stmtInsertTrack = this.db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, release_date,
                          country_code, language, popularity, is_explicit, version_type, deezer_rank, spotify_popularity, rand_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateTrack = this.db.prepare(`
      UPDATE tracks
      SET isrc = COALESCE(isrc, ?),
          deezer_rank = CASE WHEN ? IS NULL THEN deezer_rank ELSE MAX(COALESCE(deezer_rank, 0), ?) END,
          spotify_popularity = COALESCE(?, spotify_popularity),
          popularity = MAX(popularity, ?),
          release_year = COALESCE(release_year, ?),
          release_date = COALESCE(release_date, ?),
          album_name = COALESCE(album_name, ?),
          country_code = COALESCE(country_code, ?),
          language = COALESCE(language, ?),
          updated_at = datetime('now')
      WHERE id = ?
    `);

    // A plain original replaces a remaster as the row's display release
    this.stmtPromoteOriginal = this.db.prepare(`
      UPDATE tracks
      SET display_title = ?, version_type = 'original', duration_ms = ?, album_name = COALESCE(?, album_name), updated_at = datetime('now')
      WHERE id = ? AND version_type = 'remaster'
    `);

    this.stmtInsertSample = this.db.prepare(`
      INSERT OR REPLACE INTO track_samples (track_id, provider, provider_track_id, sample_url, audio_codec, sample_duration_sec, http_status, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtInsertProvider = this.db.prepare(`
      INSERT OR REPLACE INTO track_providers (track_id, provider, provider_track_id, external_url, raw_metadata_json, harvested_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
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

  _reject(reason) {
    this.rejectionStats[reason] = (this.rejectionStats[reason] || 0) + 1;
    return null;
  }

  /**
   * Counts of upserts refused by the admission policy since this catalog was opened.
   */
  getRejectionStats() {
    return { ...this.rejectionStats };
  }

  /**
   * Ingests a track with deterministic deduplication across Deezer, iTunes, and Spotify,
   * enforcing the catalog admission policy:
   * - languages: en / ja / ko only
   * - versions: original recordings only (a remaster counts as the original)
   * - duration: 45 s - 20 min; ISRC/year/date validated or dropped
   * Merges provider links and samples into an existing row when the song is already known.
   *
   * Popularity inputs: `spotifyPopularity` (0-100), `deezerRank` (0 - ~1M) or legacy
   * `popularity` (0-100, or a Deezer rank when > 100). Stored as one 0-100 score.
   *
   * @param {Object} trackData
   * @returns {{ trackId: number, isNew: boolean, isMerged: boolean } | null} null when rejected
   */
  upsertTrack(trackData) {
    const {
      title,
      artist,
      isrc: rawIsrc = null,
      album = '',
      durationMs = 0,
      releaseYear: rawReleaseYear = null,
      releaseDate: rawReleaseDate = null,
      popularity = null,
      deezerRank = null,
      spotifyPopularity = null,
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
      return this._reject('missingFields');
    }

    const displayTitle = String(title).trim();
    const albumName = album ? String(album).trim() : null;
    const canonicalTitle = normalizeDedupeTitle(displayTitle);
    if (!canonicalTitle) return this._reject('title');

    const isrc = normalizeIsrc(rawIsrc);
    // A known artist's catalog-wide language outweighs one short (often romanized) title
    const knownArtist = this.stmtGetArtistByCanonical.get(normalizeDedupeArtist(artist));
    const language = detectTrackLanguage(displayTitle, artist, { isrc, artistLanguage: knownArtist?.primary_language ?? null });
    if (!isAllowedLanguage(language)) return this._reject('language');

    const versionType = classifyVersion(displayTitle, albumName || '');
    if (!isAcceptedVersion(versionType)) return this._reject('version');

    if (!isAuthenticMetadata({ title: displayTitle, artist, album: albumName || '' })) return this._reject('inauthentic');

    const duration = Math.round(Number(durationMs) || 0);
    if (!isValidDuration(duration)) return this._reject('duration');

    const releaseDate = normalizeReleaseDate(rawReleaseDate);
    const releaseYear = normalizeReleaseYear(rawReleaseYear) ?? (releaseDate ? normalizeReleaseYear(releaseDate) : null);
    const legacyRank = deezerRank === null && Number(popularity) > 100 ? Number(popularity) : null;
    const rank = Number(deezerRank ?? legacyRank) > 0 ? Math.round(Number(deezerRank ?? legacyRank)) : null;
    const spotify = spotifyPopularity !== null && spotifyPopularity !== undefined && Number.isFinite(Number(spotifyPopularity))
      ? Math.max(0, Math.min(100, Math.round(Number(spotifyPopularity))))
      : null;
    const score = normalizePopularity({ popularity, deezerRank: rank, spotifyPopularity: spotify });

    const artistRow = this.getOrCreateArtist({
      name: artist,
      ...artistMetadata,
    });
    if (!artistRow) return this._reject('missingFields');

    let existingTrack = null;
    let isMerged = false;

    // 1. Tier 1 Deduplication: Exact ISRC Match (same master recording)
    if (isrc) {
      existingTrack = this.stmtGetTrackByIsrc.get(isrc);
      if (existingTrack) isMerged = true;
    }

    // 2. Tier 2 Deduplication: same artist + same base title (one row per song)
    if (!existingTrack) {
      existingTrack = this.stmtFindMatchingTrack.get(artistRow.id, canonicalTitle);
      if (existingTrack) isMerged = true;
    }

    let trackId;
    let isNew = false;
    const countryCode = extractIsrcCountryCode(isrc);

    if (existingTrack) {
      trackId = existingTrack.id;
      // Only fill an ISRC on the row if no other row owns it
      const isrcForRow = isrc && !this.stmtGetTrackByIsrc.get(isrc) ? isrc : null;
      this.stmtUpdateTrack.run(
        isrcForRow,
        rank,
        rank,
        spotify,
        score,
        releaseYear,
        releaseDate,
        albumName,
        countryCode,
        language,
        trackId
      );
      if (versionType === 'original') {
        this.stmtPromoteOriginal.run(displayTitle, duration, albumName, trackId);
      }
    } else {
      isNew = true;
      const res = this.stmtInsertTrack.run(
        isrc,
        canonicalTitle,
        displayTitle,
        artistRow.id,
        albumName,
        duration,
        releaseYear,
        releaseDate,
        countryCode,
        language,
        score,
        isExplicit ? 1 : 0,
        versionType,
        rank,
        spotify,
        Math.random()
      );
      trackId = Number(res.lastInsertRowid);
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
   * Returns the identifiers needed to mint a fresh preview for one catalog track.
   */
  getPreviewLookup(trackId) {
    if (!Number.isInteger(trackId) || trackId <= 0) return null;
    this.stmtGetPreviewLookup ??= this.db.prepare(`
      SELECT t.id, t.isrc, t.display_title AS title, a.display_name AS artist,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      WHERE t.id = ?
    `);
    return this.stmtGetPreviewLookup.get(trackId) || null;
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
      WHERE t.version_type IN ('original', 'remaster')
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
    // Originals only (a remaster is the same recording)
    const conditions = ["t.version_type IN ('original', 'remaster')"];

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
      WHERE t.version_type IN ('original', 'remaster')
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
      query += ' ORDER BY (CASE WHEN s.sample_url IS NOT NULL THEN 1 ELSE 0 END) DESC, CAST(t.popularity / 10 AS INT) DESC, RANDOM() LIMIT ?';
    } else {
      query += ' ORDER BY (CASE WHEN s.sample_url IS NOT NULL THEN 1 ELSE 0 END) DESC, t.popularity DESC, RANDOM() LIMIT ?';
    }
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Cheap counts for progress reporting (getStats() aggregates provider links and is slow on large catalogs).
   */
  countSummary() {
    this.stmtCountTracks ??= this.db.prepare('SELECT COUNT(*) AS c FROM tracks');
    this.stmtCountArtists ??= this.db.prepare('SELECT COUNT(*) AS c FROM artists');
    return {
      tracks: Number(this.stmtCountTracks.get().c),
      artists: Number(this.stmtCountArtists.get().c),
    };
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

const catalogSingleton = lazySingleton(() => new SqliteCatalog());
// Opened (and migrated) on first use, not at import time
export const sqliteCatalog = catalogSingleton.instance;
export const peekSqliteCatalog = catalogSingleton.peek;
