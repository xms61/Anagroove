import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { canonicalArtistKey } from '../../shared/musicIdentity.ts';
import { logger } from '../logger.ts';
import { errorMessage } from '../errors.ts';
import { DATA_DIR } from '../paths.ts';
import { runCatalogMigrations, type MigrationResult } from './catalogMigrations.ts';
import { lazySingleton } from './lazySingleton.ts';
import { isAuthenticMetadata } from '../policy/authenticityRules.ts';
import type { YearRange } from '../types.ts';
import {
  baseTitleKey,
  classifyVersion,
  cleanDisplayText,
  detectTrackLanguage,
  extractIsrcCountryCode,
  isAcceptedVersion,
  isAllowedLanguage,
  isValidDuration,
  normalizeDeezerRank,
  normalizeIsrc,
  normalizeReleaseDate,
  provisionalPopularity,
  normalizeReleaseYear,
} from './trackNormalization.ts';

const DEFAULT_DB_PATH = path.join(DATA_DIR, 'catalog.sqlite');

/** A provider id as crawlers pass it: Deezer and iTunes ids arrive as numbers, Spotify ids as strings. */
type ProviderId = string | number | null;

export interface ArtistRow {
  id: number;
  canonical_name: string;
  display_name: string;
  spotify_id: ProviderId;
  deezer_id: ProviderId;
  itunes_artist_id: ProviderId;
  fans_count: number;
  genres_json?: string | null;
  primary_language?: string | null;
}

export interface ArtistInput {
  name: unknown;
  spotifyId?: ProviderId;
  deezerId?: ProviderId;
  itunesArtistId?: ProviderId;
  genres?: string[];
  fansCount?: number;
}

/**
 * A track as crawlers and ingest scripts hand it over. Popularity inputs: `spotifyPopularity`
 * (0-100), `deezerRank` (0 - ~1M) or legacy `popularity` (0-100, or a Deezer rank when > 100).
 */
export interface TrackInput {
  title?: string | null;
  artist?: string | null;
  isrc?: string | null;
  album?: string | null;
  durationMs?: number | null;
  releaseYear?: number | string | null;
  releaseDate?: string | null;
  popularity?: number | null;
  deezerRank?: number | null;
  spotifyPopularity?: number | null;
  isExplicit?: boolean;
  provider?: string;
  providerTrackId?: string | number | null;
  sampleUrl?: string | null;
  sampleCodec?: string;
  sampleDurationSec?: number;
  externalUrl?: string | null;
  rawMetadata?: unknown;
  artistMetadata?: Omit<ArtistInput, 'name'>;
}

export interface UpsertResult {
  trackId: number;
  isNew: boolean;
  isMerged: boolean;
}

export interface SampleInput {
  provider?: string;
  providerTrackId?: string;
  sampleUrl?: string | null;
  audioCodec?: string;
  sampleDurationSec?: number;
  httpStatus?: number;
}

/** One track of a selection window (`sampleCatalogTracks`). */
export interface CatalogRow {
  id: number;
  isrc: string | null;
  language: string | null;
  title: string;
  artist: string;
  album: string | null;
  duration_ms: number | null;
  release_year: number | null;
  release_date: string | null;
  popularity: number | null;
  rand_key: number;
  deezer_id: string | null;
  spotify_id: string | null;
  itunes_id: string | null;
  sample_url: string | null;
}

export interface CatalogWindowQuery {
  ftsQuery?: string;
  genres?: string[];
  artist?: string;
  languages?: string[] | null;
  yearRange?: YearRange | null;
  minPopularity?: number;
  maxPopularity?: number;
  excludeTrackIds?: number[];
  poolSize?: number;
  start?: number;
}

export interface PreviewLookup {
  id: number;
  isrc: string | null;
  title: string;
  artist: string;
  deezer_id: string | null;
}

interface TrackRow {
  id: number;
}

type RejectionReason = 'missingFields' | 'title' | 'language' | 'version' | 'inauthentic' | 'duration';

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

/** Genres stored as a JSON array; anything else reads as none. */
function parseGenres(json: string | null | undefined): string[] {
  try {
    const genres = JSON.parse(json || '[]');
    return Array.isArray(genres) ? genres : [];
  } catch {
    return [];
  }
}

function prepareStatements(db: DatabaseSync) {
  return {
    getArtistByCanonical: db.prepare('SELECT * FROM artists WHERE canonical_name = ?'),
    getArtistByDeezerId: db.prepare('SELECT * FROM artists WHERE deezer_id = ?'),
    getArtistBySpotifyId: db.prepare('SELECT * FROM artists WHERE spotify_id = ?'),
    getArtistByItunesId: db.prepare('SELECT * FROM artists WHERE itunes_artist_id = ?'),

    insertArtist: db.prepare(`
      INSERT INTO artists (canonical_name, display_name, spotify_id, deezer_id, itunes_artist_id, genres_json, fans_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_name) DO UPDATE SET
        spotify_id = COALESCE(excluded.spotify_id, artists.spotify_id),
        deezer_id = COALESCE(excluded.deezer_id, artists.deezer_id),
        itunes_artist_id = COALESCE(excluded.itunes_artist_id, artists.itunes_artist_id),
        fans_count = MAX(artists.fans_count, excluded.fans_count)
    `),

    updateArtistGenres: db.prepare('UPDATE artists SET genres_json = ? WHERE id = ?'),

    updateArtistProviderIds: db.prepare(`
      UPDATE artists
      SET spotify_id = COALESCE(?, spotify_id),
          deezer_id = COALESCE(?, deezer_id),
          itunes_artist_id = COALESCE(?, itunes_artist_id),
          fans_count = MAX(fans_count, ?)
      WHERE id = ?
    `),

    getTrackByIsrc: db.prepare('SELECT * FROM tracks WHERE isrc = ?'),

    // Tier 2: one row per song and artist, whatever the release or duration
    findMatchingTrack: db.prepare(`
      SELECT * FROM tracks
      WHERE artist_id = ?
        AND canonical_title = ?
      ORDER BY (version_type = 'original') DESC, popularity DESC
      LIMIT 1
    `),

    insertTrack: db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, release_date,
                          country_code, language, popularity, is_explicit, version_type, deezer_rank, spotify_popularity, rand_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    updateTrack: db.prepare(`
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
    `),

    // A plain original replaces a remaster as the row's display release
    promoteOriginal: db.prepare(`
      UPDATE tracks
      SET display_title = ?, version_type = 'original', duration_ms = ?, album_name = COALESCE(?, album_name), updated_at = datetime('now')
      WHERE id = ? AND version_type = 'remaster'
    `),

    insertSample: db.prepare(`
      INSERT OR REPLACE INTO track_samples (track_id, provider, provider_track_id, sample_url, audio_codec, sample_duration_sec, http_status, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `),

    insertProvider: db.prepare(`
      INSERT OR REPLACE INTO track_providers (track_id, provider, provider_track_id, external_url, raw_metadata_json, harvested_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `),

    getPreviewLookup: db.prepare(`
      SELECT t.id, t.isrc, t.display_title AS title, a.display_name AS artist,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      WHERE t.id = ?
    `),

    countTracks: db.prepare('SELECT COUNT(*) AS c FROM tracks'),
    countArtists: db.prepare('SELECT COUNT(*) AS c FROM artists'),
  };
}

const artistFrom = (statement: StatementSync, value: SQLInputValue) => statement.get(value) as unknown as ArtistRow | undefined;

function countOf(db: DatabaseSync, sql: string): number {
  return Number(db.prepare(sql).get()?.count);
}

export class SqliteCatalog {
  readonly dbPath: string;
  /** Open until close(); a closed catalog throws "database is not open" on use. */
  readonly db: DatabaseSync;
  readonly migration: MigrationResult;
  private readonly statements: ReturnType<typeof prepareStatements>;
  private rejectionStats: Record<RejectionReason, number> = { missingFields: 0, title: 0, language: 0, version: 0, inauthentic: 0, duration: 0 };

  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);

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

    this.migration = runCatalogMigrations(this.db, { dbPath });
    this.statements = prepareStatements(this.db);
  }

  /**
   * Ensures artist exists in the database, updating provider IDs if known.
   */
  getOrCreateArtist({ name, spotifyId = null, deezerId = null, itunesArtistId = null, genres = [], fansCount = 0 }: ArtistInput): ArtistRow | null {
    if (!name || typeof name !== 'string') return null;

    const displayName = cleanDisplayText(name);
    const canonical = normalizeDedupeArtist(displayName);
    if (!canonical) return null;

    const { statements } = this;
    let artist = artistFrom(statements.getArtistByCanonical, canonical);
    if (!artist && deezerId) {
      artist = artistFrom(statements.getArtistByDeezerId, deezerId);
    }
    if (!artist && spotifyId) {
      artist = artistFrom(statements.getArtistBySpotifyId, spotifyId);
    }
    if (!artist && itunesArtistId) {
      artist = artistFrom(statements.getArtistByItunesId, itunesArtistId);
    }

    if (!artist) {
      const genresJson = genres && genres.length > 0 ? JSON.stringify(genres) : null;
      try {
        const res = statements.insertArtist.run(
          canonical,
          displayName,
          spotifyId,
          deezerId,
          itunesArtistId,
          genresJson,
          fansCount || 0
        );
        artist = {
          id: Number(res.lastInsertRowid),
          canonical_name: canonical,
          display_name: displayName,
          spotify_id: spotifyId,
          deezer_id: deezerId,
          itunes_artist_id: itunesArtistId,
          fans_count: fansCount || 0,
        };
      } catch {
        // In case of race condition or provider id clash, fallback fetch
        artist = (deezerId && artistFrom(statements.getArtistByDeezerId, deezerId)) ||
                 artistFrom(statements.getArtistByCanonical, canonical);
      }
    } else {
      // Update any newly discovered provider links or higher fan count
      try {
        statements.updateArtistProviderIds.run(
          spotifyId,
          deezerId,
          itunesArtistId,
          fansCount || 0,
          artist.id
        );
      } catch {
        // Safe guard against provider ID collisions across alias rows
      }
      this.addArtistGenres(artist, genres);
    }

    return artist ?? null;
  }

  /** Adds genres an existing artist doesn't have yet (e.g. the theme of a playlist they appear in). */
  private addArtistGenres(artist: ArtistRow, genres: string[] | undefined) {
    if (!Array.isArray(genres) || genres.length === 0) return;
    const current = parseGenres(artist.genres_json);
    const merged = [...new Set([...current, ...genres])];
    if (merged.length === current.length) return;
    artist.genres_json = JSON.stringify(merged);
    this.statements.updateArtistGenres.run(artist.genres_json, artist.id);
  }

  private reject(reason: RejectionReason): null {
    this.rejectionStats[reason] = (this.rejectionStats[reason] || 0) + 1;
    return null;
  }

  /**
   * Counts of upserts refused by the admission policy since this catalog was opened.
   */
  getRejectionStats(): Record<string, number> {
    return { ...this.rejectionStats };
  }

  /**
   * Ingests a track with deterministic deduplication across Deezer, iTunes, and Spotify,
   * enforcing the catalog admission policy:
   * - languages: en / ja / ko only
   * - versions: original recordings only (a remaster counts as the original)
   * - duration: 45 s - 20 min; ISRC/year/date validated or dropped
   * Merges provider links and samples into an existing row when the song is already known.
   * Returns null when the track is rejected.
   */
  upsertTrack(trackData: TrackInput): UpsertResult | null {
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
      return this.reject('missingFields');
    }
    const { statements } = this;

    const displayTitle = cleanDisplayText(title);
    const albumName = cleanDisplayText(album) || null;
    const canonicalTitle = normalizeDedupeTitle(displayTitle);
    if (!canonicalTitle) return this.reject('title');

    const isrc = normalizeIsrc(rawIsrc);
    // A known artist's catalog-wide language outweighs one short (often romanized) title
    const knownArtist = artistFrom(statements.getArtistByCanonical, normalizeDedupeArtist(artist));
    const language = detectTrackLanguage(displayTitle, artist, { isrc, artistLanguage: knownArtist?.primary_language ?? null });
    if (!isAllowedLanguage(language)) return this.reject('language');

    const versionType = classifyVersion(displayTitle, albumName || '');
    if (!isAcceptedVersion(versionType)) return this.reject('version');

    if (!isAuthenticMetadata({ title: displayTitle, artist, album: albumName || '' })) return this.reject('inauthentic');

    const duration = Math.round(Number(durationMs) || 0);
    if (!isValidDuration(duration)) return this.reject('duration');

    const releaseDate = normalizeReleaseDate(rawReleaseDate);
    const releaseYear = normalizeReleaseYear(rawReleaseYear) ?? (releaseDate ? normalizeReleaseYear(releaseDate) : null);
    const legacyRank = deezerRank === null && Number(popularity) > 100 ? Number(popularity) : null;
    const rank = normalizeDeezerRank(deezerRank ?? legacyRank);
    const spotify = spotifyPopularity !== null && spotifyPopularity !== undefined && Number.isFinite(Number(spotifyPopularity))
      ? Math.max(0, Math.min(100, Math.round(Number(spotifyPopularity))))
      : null;
    const score = provisionalPopularity({ deezerRank: rank, spotifyPopularity: spotify });

    const artistRow = this.getOrCreateArtist({
      name: artist,
      ...artistMetadata,
    });
    if (!artistRow) return this.reject('missingFields');

    let existingTrack: TrackRow | undefined;
    let isMerged = false;

    // 1. Tier 1 Deduplication: Exact ISRC Match (same master recording)
    if (isrc) {
      existingTrack = statements.getTrackByIsrc.get(isrc) as unknown as TrackRow | undefined;
      if (existingTrack) isMerged = true;
    }

    // 2. Tier 2 Deduplication: same artist + same base title (one row per song)
    if (!existingTrack) {
      existingTrack = statements.findMatchingTrack.get(artistRow.id, canonicalTitle) as unknown as TrackRow | undefined;
      if (existingTrack) isMerged = true;
    }

    let trackId: number;
    let isNew = false;
    const countryCode = extractIsrcCountryCode(isrc);

    if (existingTrack) {
      trackId = existingTrack.id;
      // Only fill an ISRC on the row if no other row owns it
      const isrcForRow = isrc && !statements.getTrackByIsrc.get(isrc) ? isrc : null;
      statements.updateTrack.run(
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
        statements.promoteOriginal.run(displayTitle, duration, albumName, trackId);
      }
    } else {
      isNew = true;
      const res = statements.insertTrack.run(
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
      statements.insertSample.run(
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
    statements.insertProvider.run(
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
   */
  upsertBatch(trackBatch: TrackInput[] = []): { inserted: number; merged: number; total: number } {
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
      logger.error('sqlite_catalog', `Batch transaction failed: ${errorMessage(err)}`);
      throw err;
    }

    return { inserted, merged, total: trackBatch.length };
  }

  /**
   * Inserts or updates an audio sample for a track in SQLite.
   * Enables persistent caching of on-the-fly lazy preview resolutions.
   */
  insertSample(trackId: number, {
    provider = 'deezer',
    providerTrackId = '',
    sampleUrl,
    audioCodec = 'mp3',
    sampleDurationSec = 30,
    httpStatus = 200,
  }: SampleInput = {}): boolean {
    if (!trackId || !sampleUrl) return false;
    try {
      this.statements.insertSample.run(
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
      logger.warn('sqlite_catalog', `Failed to insert sample for track ${trackId}: ${errorMessage(err)}`);
      return false;
    }
  }

  /**
   * Returns the identifiers needed to mint a fresh preview for one catalog track.
   */
  getPreviewLookup(trackId: number): PreviewLookup | null {
    if (!Number.isInteger(trackId) || trackId <= 0) return null;
    return (this.statements.getPreviewLookup.get(trackId) as unknown as PreviewLookup | undefined) || null;
  }

  /**
   * Random window over the catalog for song selection: every filter runs in SQL on indexed
   * columns, then rows are read in `rand_key` order from a random start (wrapping around), so
   * the cost is independent of catalog size and no `ORDER BY RANDOM()` is needed. One row per
   * track (best sample chosen by subquery), never one per sample.
   *
   * `start` in [0, 1) comes from the caller's (seeded) RNG, which makes the window reproducible.
   * A theme (`ftsQuery`) matches through the trigram index, or LIKE when that finds < 10 rows.
   */
  sampleCatalogTracks({
    ftsQuery = '',
    genres = [],
    artist = '',
    languages = null,
    yearRange = null,
    minPopularity = 0,
    maxPopularity = 100,
    excludeTrackIds = [],
    poolSize = 400,
    start = Math.random(),
  }: CatalogWindowQuery = {}): CatalogRow[] {
    const conditions = ["t.version_type IN ('original', 'remaster')"];
    const params: SQLInputValue[] = [];

    if (artist && typeof artist === 'string' && artist.trim()) {
      // Resolve the artist rows first so the track lookup uses the artist_id index
      const name = artist.trim();
      const collaborations = ['&', ',', 'x', 'and', 'with', 'feat.', 'ft.'].map(joiner => `${name}${joiner === ',' ? ',' : ` ${joiner}`} %`);
      const artistRows = this.db.prepare(
        `SELECT id FROM artists WHERE canonical_name = ? OR display_name = ? OR ${collaborations.map(() => 'display_name LIKE ?').join(' OR ')}`
      ).all(normalizeDedupeArtist(name), name, ...collaborations) as { id: number }[];
      const artistIds = artistRows.map(r => r.id);
      if (artistIds.length === 0) return [];
      conditions.push(`t.artist_id IN (${artistIds.map(() => '?').join(', ')})`);
      params.push(...artistIds);
    }
    if (Array.isArray(genres) && genres.length > 0) {
      conditions.push(`(${genres.map(() => 'a.genres_json LIKE ?').join(' OR ')})`);
      params.push(...genres.map(g => `%"${String(g).trim()}"%`));
    }
    if (Array.isArray(languages) && languages.length > 0) {
      conditions.push(`t.language IN (${languages.map(() => '?').join(', ')})`);
      params.push(...languages);
    }
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
    if (minPopularity > 0) {
      conditions.push('t.popularity >= ?');
      params.push(minPopularity);
    }
    if (maxPopularity < 100) {
      conditions.push('t.popularity <= ?');
      params.push(maxPopularity);
    }
    if (Array.isArray(excludeTrackIds) && excludeTrackIds.length > 0) {
      conditions.push(`t.id NOT IN (${excludeTrackIds.map(() => '?').join(', ')})`);
      params.push(...excludeTrackIds);
    }

    const select = `
      SELECT t.id, t.isrc, t.language, t.display_title AS title, a.display_name AS artist,
             t.album_name AS album, t.duration_ms, t.release_year, t.release_date, t.popularity, t.rand_key,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'spotify' LIMIT 1) AS spotify_id,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'itunes' LIMIT 1) AS itunes_id,
             (SELECT sample_url FROM track_samples WHERE track_id = t.id ORDER BY provider = 'deezer' DESC LIMIT 1) AS sample_url
      FROM tracks t
      JOIN artists a ON a.id = t.artist_id`;
    const startKey = Math.min(Math.max(Number(start) || 0, 0), 0.999999999);

    const windowed = (extraCondition: string | null, extraParams: SQLInputValue[]): CatalogRow[] => {
      const where = [...conditions, extraCondition].filter(Boolean).join(' AND ');
      const head = this.db.prepare(`${select} WHERE ${where} AND t.rand_key >= ? ORDER BY t.rand_key LIMIT ?`)
        .all(...params, ...extraParams, startKey, poolSize) as unknown as CatalogRow[];
      if (head.length >= poolSize) return head;
      const tail = this.db.prepare(`${select} WHERE ${where} AND t.rand_key < ? ORDER BY t.rand_key LIMIT ?`)
        .all(...params, ...extraParams, startKey, poolSize - head.length) as unknown as CatalogRow[];
      return [...head, ...tail];
    };

    if (ftsQuery && typeof ftsQuery === 'string' && ftsQuery.trim()) {
      try {
        const matched = windowed('t.id IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?)', [ftsQuery]);
        if (matched.length >= 10) return matched;
      } catch {
        // FTS syntax error (e.g. a token under 3 characters): fall back to LIKE
      }
      const term = `%${ftsQuery.replace(/['"*]/g, '').trim()}%`;
      return windowed('(t.display_title LIKE ? OR t.album_name LIKE ? OR a.display_name LIKE ?)', [term, term, term]);
    }
    return windowed(null, []);
  }

  countSummary(): { tracks: number; artists: number } {
    return {
      tracks: Number(this.statements.countTracks.get()?.c),
      artists: Number(this.statements.countArtists.get()?.c),
    };
  }

  /**
   * Returns high-level catalog statistics.
   */
  getStats() {
    const sampleCount = countOf(this.db, 'SELECT COUNT(*) as count FROM track_samples');
    const crossReferenced = countOf(this.db, `
      SELECT COUNT(*) as count FROM (
        SELECT track_id FROM track_providers GROUP BY track_id HAVING COUNT(provider) > 1
      )
    `);

    return {
      artists: countOf(this.db, 'SELECT COUNT(*) as count FROM artists'),
      tracks: countOf(this.db, 'SELECT COUNT(*) as count FROM tracks'),
      audioSamples: sampleCount,
      samples: sampleCount,
      providerLinks: countOf(this.db, 'SELECT COUNT(*) as count FROM track_providers'),
      crossReferencedTracks: crossReferenced,
      crossReferenced,
      languages: countOf(this.db, 'SELECT COUNT(DISTINCT language) as count FROM tracks WHERE language IS NOT NULL'),
      countryCodes: countOf(this.db, 'SELECT COUNT(DISTINCT country_code) as count FROM tracks WHERE country_code IS NOT NULL'),
    };
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}

const catalogSingleton = lazySingleton(() => new SqliteCatalog());
// Opened (and migrated) on first use, not at import time
export const sqliteCatalog = catalogSingleton.instance;
export const peekSqliteCatalog = catalogSingleton.peek;
