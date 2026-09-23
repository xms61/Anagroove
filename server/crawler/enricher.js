/**
 * Catalog enrichment: fills metadata that Deezer search/playlist payloads never include.
 * Every step selects its own work list with SQL and stamps what it attempted, so runs are
 * resumable, can be capped with a limit, and never re-request the same row forever.
 *
 *   deezer    /track/{id}   -> ISRC, release date, rank (popularity) for in-scope tracks
 *   artists   /artist/{id}  -> fan count; /album/{id} -> genres
 *   itunes    iTunes search -> strict artist + base title + duration match, attached to the
 *                              existing row (never creates tracks)
 *   languages local         -> recompute artist/track languages (no network)
 */
import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { recomputeCatalogLanguages } from '../db/catalogLanguages.js';
import {
  ALLOWED_LANGUAGES,
  baseTitleKey,
  extractIsrcCountryCode,
  normalizeIsrc,
  normalizePopularity,
  normalizeReleaseDate,
  normalizeReleaseYear,
} from '../db/trackNormalization.js';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { politeFetch, deezerRateLimiter, itunesRateLimiter } from './rateLimiter.js';
import { logger } from '../logger.js';

const IN_SCOPE = `t.language IN (${ALLOWED_LANGUAGES.map(l => `'${l}'`).join(', ')}) AND t.version_type IN ('original', 'remaster')`;
const ITUNES_DURATION_TOLERANCE_MS = 3000;

export class CatalogEnricher {
  constructor(catalog = sqliteCatalog, { fetchImpl = politeFetch } = {}) {
    this.catalog = catalog;
    this.fetch = fetchImpl;
    this.abortRequested = false;
  }

  stop() {
    this.abortRequested = true;
  }

  get db() {
    return this.catalog.db;
  }

  /** @returns {Promise<{ status: 'ok'|'missing'|'error', data?: any }>} */
  async _getJson(url, rateLimiter) {
    try {
      const res = await this.fetch(url, {}, { rateLimiter, maxRetries: 2 });
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) return { status: 'error' };
      const data = await res.json();
      // Deezer reports unknown ids as 200 + { error: { code: 800 } }
      if (data?.error) return { status: data.error.code === 800 ? 'missing' : 'error' };
      return { status: 'ok', data };
    } catch (err) {
      logger.warn('enricher', `Request failed for ${url}: ${err.message}`);
      return { status: 'error' };
    }
  }

  /**
   * Deezer /track/{id}: ISRC, release date, rank. Most popular tracks first.
   */
  async enrichDeezerTracks({ limit = 2000, onProgress = () => {} } = {}) {
    const work = this.db.prepare(`
      SELECT t.id, t.isrc, t.release_year, t.deezer_rank, t.spotify_popularity,
             (SELECT provider_track_id FROM track_providers WHERE track_id = t.id AND provider = 'deezer' LIMIT 1) AS deezer_id
      FROM tracks t
      WHERE ${IN_SCOPE}
        AND t.enriched_at IS NULL
        AND (t.isrc IS NULL OR t.release_year IS NULL OR t.deezer_rank IS NULL)
        AND EXISTS (SELECT 1 FROM track_providers p WHERE p.track_id = t.id AND p.provider = 'deezer')
      ORDER BY t.popularity DESC
      LIMIT ?
    `).all(limit);

    const isrcOwner = this.db.prepare('SELECT id FROM tracks WHERE isrc = ?');
    const update = this.db.prepare(`
      UPDATE tracks SET
        isrc = COALESCE(isrc, ?),
        country_code = COALESCE(country_code, ?),
        release_year = COALESCE(release_year, ?),
        release_date = COALESCE(release_date, ?),
        deezer_rank = COALESCE(?, deezer_rank),
        popularity = ?,
        enriched_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `);
    const markAttempted = this.db.prepare("UPDATE tracks SET enriched_at = datetime('now') WHERE id = ?");

    const stats = { checked: 0, updated: 0, isrcFilled: 0, yearFilled: 0, isrcConflicts: 0, missing: 0, errors: 0 };
    for (const row of work) {
      if (this.abortRequested) break;
      stats.checked++;
      const { status, data } = await this._getJson(`https://api.deezer.com/track/${row.deezer_id}`, deezerRateLimiter);
      if (status === 'error') {
        stats.errors++; // left un-stamped so a later run retries
        continue;
      }
      if (status === 'missing') {
        stats.missing++;
        markAttempted.run(row.id);
        continue;
      }

      let isrc = row.isrc ? null : normalizeIsrc(data.isrc);
      if (isrc) {
        const owner = isrcOwner.get(isrc);
        if (owner && owner.id !== row.id) {
          // Another row is the same recording: a duplicate for the cleanup phase to merge
          stats.isrcConflicts++;
          isrc = null;
        }
      }
      const releaseDate = normalizeReleaseDate(data.release_date);
      const releaseYear = row.release_year ? null : normalizeReleaseYear(releaseDate || '');
      const rank = Number(data.rank) > 0 ? Math.max(Number(data.rank), row.deezer_rank || 0) : row.deezer_rank;
      const popularity = normalizePopularity({ spotifyPopularity: row.spotify_popularity, deezerRank: rank });

      update.run(isrc, extractIsrcCountryCode(isrc), releaseYear, releaseDate, rank || null, popularity, row.id);
      stats.updated++;
      if (isrc) stats.isrcFilled++;
      if (releaseYear) stats.yearFilled++;
      if (stats.checked % 100 === 0) onProgress({ step: 'deezer', ...stats, total: work.length });
    }
    return stats;
  }

  /**
   * Deezer /artist/{id} (fan count) and one /album/{id} (genres) per in-scope artist.
   */
  async enrichArtists({ limit = 500, onProgress = () => {} } = {}) {
    const work = this.db.prepare(`
      SELECT a.id, a.deezer_id, a.genres_json,
             (SELECT json_extract(p.raw_metadata_json, '$.albumId')
              FROM tracks t JOIN track_providers p ON p.track_id = t.id AND p.provider = 'deezer'
              WHERE t.artist_id = a.id AND json_valid(p.raw_metadata_json) AND json_extract(p.raw_metadata_json, '$.albumId') IS NOT NULL
              LIMIT 1) AS album_id,
             (SELECT COUNT(*) FROM tracks t WHERE t.artist_id = a.id AND ${IN_SCOPE}) AS in_scope_tracks
      FROM artists a
      WHERE a.enriched_at IS NULL AND a.deezer_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM tracks t WHERE t.artist_id = a.id AND ${IN_SCOPE})
      ORDER BY in_scope_tracks DESC
      LIMIT ?
    `).all(limit);

    const update = this.db.prepare(`
      UPDATE artists SET
        fans_count = MAX(COALESCE(fans_count, 0), ?),
        genres_json = ?,
        enriched_at = datetime('now')
      WHERE id = ?
    `);

    const stats = { checked: 0, fansFilled: 0, genresFilled: 0, errors: 0 };
    for (const row of work) {
      if (this.abortRequested) break;
      stats.checked++;
      const artist = await this._getJson(`https://api.deezer.com/artist/${row.deezer_id}`, deezerRateLimiter);
      if (artist.status === 'error') {
        stats.errors++;
        continue;
      }

      let genres;
      try {
        genres = row.genres_json ? JSON.parse(row.genres_json) : [];
      } catch {
        genres = [];
      }
      if (row.album_id) {
        const album = await this._getJson(`https://api.deezer.com/album/${row.album_id}`, deezerRateLimiter);
        const albumGenres = (album.data?.genres?.data || []).map(g => g.name).filter(Boolean);
        if (albumGenres.length > 0) {
          genres = [...new Set([...genres, ...albumGenres])];
          stats.genresFilled++;
        }
      }

      const fans = Number(artist.data?.nb_fan) || 0;
      if (fans > 0) stats.fansFilled++;
      update.run(fans, genres.length > 0 ? JSON.stringify(genres) : null, row.id);
      if (stats.checked % 50 === 0) onProgress({ step: 'artists', ...stats, total: work.length });
    }
    return stats;
  }

  /**
   * Cross-references in-scope tracks with iTunes. A result is accepted only when the artist,
   * the base title and the duration (within 3 s) all match; it is attached to the existing
   * row as an iTunes provider link + preview, never inserted as a new track.
   */
  async crossReferenceItunes({ limit = 100, onProgress = () => {} } = {}) {
    const work = this.db.prepare(`
      SELECT t.id, t.display_title, t.canonical_title, t.duration_ms, a.display_name AS artist, a.canonical_name
      FROM tracks t JOIN artists a ON a.id = t.artist_id
      WHERE ${IN_SCOPE}
        AND t.itunes_checked_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM track_providers p WHERE p.track_id = t.id AND p.provider = 'itunes')
      ORDER BY t.popularity DESC
      LIMIT ?
    `).all(limit);

    const markChecked = this.db.prepare("UPDATE tracks SET itunes_checked_at = datetime('now') WHERE id = ?");
    const providerOwner = this.db.prepare("SELECT track_id FROM track_providers WHERE provider = 'itunes' AND provider_track_id = ?");
    const insertProvider = this.db.prepare(`
      INSERT INTO track_providers (track_id, provider, provider_track_id, external_url, raw_metadata_json, harvested_at)
      VALUES (?, 'itunes', ?, ?, ?, datetime('now'))
    `);
    const setItunesArtist = this.db.prepare('UPDATE artists SET itunes_artist_id = COALESCE(itunes_artist_id, ?) WHERE canonical_name = ? AND NOT EXISTS (SELECT 1 FROM artists WHERE itunes_artist_id = ?)');

    const stats = { checked: 0, matched: 0, noMatch: 0, errors: 0 };
    for (const row of work) {
      if (this.abortRequested) break;
      stats.checked++;
      const term = `${row.artist} ${row.display_title}`.replace(/[/\\?%*:|"<>]/g, ' ').slice(0, 100);
      const { status, data } = await this._getJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10`,
        itunesRateLimiter
      );
      if (status === 'error') {
        stats.errors++;
        continue;
      }

      const match = (data?.results || []).find(it =>
        canonicalArtistKey(it.artistName || '') === row.canonical_name &&
        baseTitleKey(it.trackName || '') === row.canonical_title &&
        Math.abs((it.trackTimeMillis || 0) - row.duration_ms) <= ITUNES_DURATION_TOLERANCE_MS &&
        !providerOwner.get(String(it.trackId))
      );

      if (match) {
        insertProvider.run(row.id, String(match.trackId), match.trackViewUrl || null, JSON.stringify({ itunesArtistId: match.artistId, collectionId: match.collectionId }));
        if (match.previewUrl) {
          this.catalog.insertSample(row.id, { provider: 'itunes', providerTrackId: String(match.trackId), sampleUrl: match.previewUrl, audioCodec: 'm4a' });
        }
        if (match.artistId) setItunesArtist.run(match.artistId, row.canonical_name, match.artistId);
        stats.matched++;
      } else {
        stats.noMatch++;
      }
      markChecked.run(row.id);
      if (stats.checked % 25 === 0) onProgress({ step: 'itunes', ...stats, total: work.length });
    }
    return stats;
  }

  /** Local language recompute (after crawls add titles/ISRCs to artists). */
  recomputeLanguages() {
    return recomputeCatalogLanguages(this.db);
  }
}

export const catalogEnricher = new CatalogEnricher();
