import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DEFAULT_ANIME_DB_PATH = path.join(DATA_DIR, 'anime_catalog.sqlite');

export function normalizeAnimeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export class AnimeCatalog {
  constructor(dbPath = DEFAULT_ANIME_DB_PATH) {
    if (typeof dbPath === 'object' && dbPath !== null && typeof dbPath.prepare === 'function') {
      this.db = dbPath;
      this.dbPath = ':memory:';
    } else {
      this.dbPath = dbPath;
      if (this.dbPath !== ':memory:') {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      this.db = new DatabaseSync(this.dbPath);
    }

    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA busy_timeout = 10000;');
    } catch {
      // WAL mode not supported in :memory: databases
    }

    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS anime_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anime_title TEXT NOT NULL,
        canonical_anime_title TEXT NOT NULL,
        english_anime_title TEXT,
        song_title TEXT NOT NULL,
        canonical_song_title TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        canonical_artist_name TEXT NOT NULL,
        theme_type TEXT NOT NULL, -- 'OP' | 'ED'
        theme_number INTEGER NOT NULL DEFAULT 1,
        theme_slug TEXT NOT NULL, -- e.g. 'OP1', 'ED2'
        year INTEGER,
        season TEXT,
        mal_id INTEGER,
        anilist_id INTEGER,
        original_file_path TEXT NOT NULL UNIQUE,
        duration_ms INTEGER DEFAULT 90000,
        popularity INTEGER DEFAULT 80,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS anime_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anime_track_id INTEGER NOT NULL REFERENCES anime_tracks(id) ON DELETE CASCADE,
        sample_index INTEGER NOT NULL, -- 1, 2, or 3
        sample_path TEXT NOT NULL,
        sample_url TEXT NOT NULL,
        offset_seconds INTEGER NOT NULL,
        duration_seconds INTEGER DEFAULT 20,
        UNIQUE(anime_track_id, sample_index)
      );

      CREATE INDEX IF NOT EXISTS idx_anime_year ON anime_tracks(year);
      CREATE INDEX IF NOT EXISTS idx_anime_type ON anime_tracks(theme_type);
      CREATE INDEX IF NOT EXISTS idx_anime_title ON anime_tracks(canonical_anime_title);
      CREATE INDEX IF NOT EXISTS idx_anime_artist ON anime_tracks(canonical_artist_name);
      CREATE INDEX IF NOT EXISTS idx_anime_samples_track ON anime_samples(anime_track_id);
    `);
  }

  upsertAnimeTrack(track) {
    const canonicalAnime = normalizeAnimeText(track.animeTitle);
    const canonicalSong = normalizeAnimeText(track.songTitle);
    const canonicalArtist = normalizeAnimeText(track.artistName);

    const stmt = this.db.prepare(`
      INSERT INTO anime_tracks (
        anime_title, canonical_anime_title, english_anime_title,
        song_title, canonical_song_title,
        artist_name, canonical_artist_name,
        theme_type, theme_number, theme_slug,
        year, season, mal_id, anilist_id,
        original_file_path, duration_ms, popularity
      ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(original_file_path) DO UPDATE SET
        anime_title = excluded.anime_title,
        canonical_anime_title = excluded.canonical_anime_title,
        english_anime_title = excluded.english_anime_title,
        song_title = excluded.song_title,
        canonical_song_title = excluded.canonical_song_title,
        artist_name = excluded.artist_name,
        canonical_artist_name = excluded.canonical_artist_name,
        theme_type = excluded.theme_type,
        theme_number = excluded.theme_number,
        theme_slug = excluded.theme_slug,
        year = excluded.year,
        season = excluded.season,
        mal_id = excluded.mal_id,
        anilist_id = excluded.anilist_id,
        duration_ms = excluded.duration_ms,
        popularity = excluded.popularity
    `);

    stmt.run(
      track.animeTitle,
      canonicalAnime,
      track.englishAnimeTitle || null,
      track.songTitle,
      canonicalSong,
      track.artistName,
      canonicalArtist,
      (track.themeType || 'OP').toUpperCase(),
      track.themeNumber || 1,
      track.themeSlug || `${(track.themeType || 'OP').toUpperCase()}${track.themeNumber || 1}`,
      track.year || null,
      track.season || null,
      track.malId || null,
      track.anilistId || null,
      track.originalFilePath,
      track.durationMs || 90000,
      track.popularity || 80
    );

    const row = this.db.prepare(`SELECT id FROM anime_tracks WHERE original_file_path = ?`).get(track.originalFilePath);
    return row?.id;
  }

  insertSample({ animeTrackId, sampleIndex, samplePath, sampleUrl, offsetSeconds, durationSeconds = 20 }) {
    const stmt = this.db.prepare(`
      INSERT INTO anime_samples (anime_track_id, sample_index, sample_path, sample_url, offset_seconds, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(anime_track_id, sample_index) DO UPDATE SET
        sample_path = excluded.sample_path,
        sample_url = excluded.sample_url,
        offset_seconds = excluded.offset_seconds,
        duration_seconds = excluded.duration_seconds
    `);
    return stmt.run(animeTrackId, sampleIndex, samplePath, sampleUrl, offsetSeconds, durationSeconds);
  }

  getSamplesForTrack(animeTrackId) {
    return this.db.prepare(`
      SELECT sample_index, sample_url, offset_seconds, duration_seconds
      FROM anime_samples
      WHERE anime_track_id = ?
      ORDER BY sample_index ASC
    `).all(animeTrackId);
  }

  /**
   * Retrieves random playable anime tracks with verified sample audio.
   * Formatted directly for consumption by SpotySpice's crossword solver.
   */
  getRandomAnimeTracks({
    count = 10,
    yearRange = null,
    type = null, // 'OP', 'ED', or null for both
    search = null, // Optional keyword or anime search term
    requireSamples = true,
  } = {}) {
    let whereClauses = [];
    let params = [];

    if (requireSamples) {
      whereClauses.push(`EXISTS (SELECT 1 FROM anime_samples s WHERE s.anime_track_id = t.id)`);
    }

    if (type) {
      whereClauses.push(`t.theme_type = ?`);
      params.push(type.toUpperCase());
    }

    if (yearRange && typeof yearRange === 'object') {
      if (yearRange.start) {
        whereClauses.push(`t.year >= ?`);
        params.push(yearRange.start);
      }
      if (yearRange.end) {
        whereClauses.push(`t.year <= ?`);
        params.push(yearRange.end);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${normalizeAnimeText(search)}%`;
      whereClauses.push(`(t.canonical_anime_title LIKE ? OR t.canonical_song_title LIKE ? OR t.canonical_artist_name LIKE ?)`);
      params.push(q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sql = `
      SELECT t.*
      FROM anime_tracks t
      ${whereSql}
      ORDER BY RANDOM()
      LIMIT ?
    `;
    params.push(Math.max(1, count));

    const rows = this.db.prepare(sql).all(...params);

    return rows.map(r => {
      const samples = this.getSamplesForTrack(r.id);
      // Randomly pick one of the 2-3 sample variations for immediate playback
      const chosenSample = samples.length > 0
        ? samples[Math.floor(Math.random() * samples.length)]
        : null;

      return {
        id: `anime:${r.id}`,
        catalogTrackId: r.id,
        provider: 'anime_oped',
        providerTrackId: String(r.id),
        title: r.song_title,
        artist: r.artist_name,
        album: `${r.anime_title} (${r.theme_slug})`,
        animeTitle: r.anime_title,
        englishAnimeTitle: r.english_anime_title,
        themeType: r.theme_type,
        themeNumber: r.theme_number,
        themeSlug: r.theme_slug,
        releaseYear: r.year,
        year: r.year,
        season: r.season,
        language: 'ja',
        popularity: r.popularity || 85,
        audioUrl: chosenSample ? chosenSample.sample_url : '',
        sampleVariations: samples.map(s => ({
          index: s.sample_index,
          url: s.sample_url,
          offset: s.offset_seconds,
          duration: s.duration_seconds,
        })),
        isAnimeOped: true,
      };
    });
  }

  getStats() {
    const totalTracks = this.db.prepare(`SELECT COUNT(*) as count FROM anime_tracks`).get().count;
    const totalOps = this.db.prepare(`SELECT COUNT(*) as count FROM anime_tracks WHERE theme_type = 'OP'`).get().count;
    const totalEds = this.db.prepare(`SELECT COUNT(*) as count FROM anime_tracks WHERE theme_type = 'ED'`).get().count;
    const totalSamples = this.db.prepare(`SELECT COUNT(*) as count FROM anime_samples`).get().count;
    const tracksWithSamples = this.db.prepare(`SELECT COUNT(DISTINCT anime_track_id) as count FROM anime_samples`).get().count;
    const yearStats = this.db.prepare(`SELECT MIN(year) as minYear, MAX(year) as maxYear FROM anime_tracks WHERE year IS NOT NULL`).get();

    return {
      totalTracks,
      totalOps,
      totalEds,
      totalSamples,
      tracksWithSamples,
      sampleCoveragePct: totalTracks > 0 ? Number(((tracksWithSamples / totalTracks) * 100).toFixed(2)) : 0,
      minYear: yearStats?.minYear,
      maxYear: yearStats?.maxYear,
    };
  }

  close() {
    try {
      this.db.exec('PRAGMA optimize;');
    } catch {
      // ignore
    }
  }
}

export const animeCatalog = new AnimeCatalog();
