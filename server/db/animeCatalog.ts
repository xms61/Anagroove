import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from '../paths.js';
import { lazySingleton } from './lazySingleton.js';

const DEFAULT_ANIME_DB_PATH = path.join(DATA_DIR, 'anime_catalog.sqlite');

/** An OP/ED theme to store (from the ingest scripts). */
export interface AnimeTrackInput {
  animeTitle: string;
  englishAnimeTitle?: string | null;
  songTitle: string;
  artistName: string;
  themeType?: string;
  themeNumber?: number;
  themeSlug?: string;
  year?: number | null;
  season?: string | null;
  malId?: number | null;
  anilistId?: number | null;
  imageUrl?: string | null;
  image_url?: string | null;
  originalFilePath: string;
  durationMs?: number;
  popularity?: number;
}

interface AnimeTrackRow {
  id: number;
  anime_title: string;
  english_anime_title: string | null;
  song_title: string;
  artist_name: string;
  theme_type: string;
  theme_number: number;
  theme_slug: string;
  year: number | null;
  season: string | null;
  mal_id: number | null;
  anilist_id: number | null;
  image_url: string | null;
  popularity: number | null;
}

export interface AnimeSampleRow {
  sample_index: number;
  sample_url: string;
  offset_seconds: number;
  duration_seconds: number;
}

/** A playable anime theme, shaped like a catalog song for the puzzle generator. */
export type AnimeSong = {
  id: string;
  catalogTrackId: number;
  provider: 'anime_oped';
  providerTrackId: string;
  title: string;
  artist: string;
  album: string;
  animeTitle: string;
  englishAnimeTitle: string | null;
  themeType: string;
  themeNumber: number;
  themeSlug: string;
  releaseYear: number | null;
  year: number | null;
  season: string | null;
  language: 'ja';
  popularity: number;
  audioUrl: string;
  albumArt: string;
  imageUrl: string;
  anilistId: number | null;
  malId: number | null;
  sampleVariations: { index: number; url: string; offset: number; duration: number }[];
  isAnimeOped: true;
};

export interface AnimeTrackQuery {
  count?: number;
  yearRange?: { start?: number | null; end?: number | null } | null;
  /** 'OP', 'ED', or null for both */
  type?: string | null;
  /** Keyword matched against anime, song and artist */
  search?: string | null;
  requireSamples?: boolean;
}

export function normalizeAnimeText(str: unknown): string {
  if (!str) return '';
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export class AnimeCatalog {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  /** A file path (or ':memory:'), or an already open database (tests). */
  constructor(dbPath: string | DatabaseSync = DEFAULT_ANIME_DB_PATH) {
    if (typeof dbPath !== 'string') {
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

    this.initSchema();
  }

  private initSchema(): void {
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
        image_url TEXT,
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

    // Backward-compatible schema migration for image_url
    try {
      this.db.exec('ALTER TABLE anime_tracks ADD COLUMN image_url TEXT;');
    } catch {
      // Column already exists
    }
  }

  /** Inserts or updates a theme by its source file; returns the row id. */
  upsertAnimeTrack(track: AnimeTrackInput): number | undefined {
    const canonicalAnime = normalizeAnimeText(track.animeTitle);
    const canonicalSong = normalizeAnimeText(track.songTitle);
    const canonicalArtist = normalizeAnimeText(track.artistName);

    const stmt = this.db.prepare(`
      INSERT INTO anime_tracks (
        anime_title, canonical_anime_title, english_anime_title,
        song_title, canonical_song_title,
        artist_name, canonical_artist_name,
        theme_type, theme_number, theme_slug,
        year, season, mal_id, anilist_id, image_url,
        original_file_path, duration_ms, popularity
      ) VALUES (
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
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
        image_url = COALESCE(excluded.image_url, anime_tracks.image_url),
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
      track.imageUrl || track.image_url || null,
      track.originalFilePath,
      track.durationMs || 90000,
      track.popularity || 80
    );

    const row = this.db.prepare(`SELECT id FROM anime_tracks WHERE original_file_path = ?`).get(track.originalFilePath) as { id: number } | undefined;
    return row?.id;
  }

  updateTrackImageUrl(id: number | null | undefined, imageUrl: string | null | undefined): boolean {
    if (!id || !imageUrl) return false;
    try {
      const stmt = this.db.prepare('UPDATE anime_tracks SET image_url = ? WHERE id = ?');
      stmt.run(imageUrl, id);
      return true;
    } catch {
      return false;
    }
  }

  updateAnimeCoverByTitle(animeTitle: string | null | undefined, imageUrl: string | null | undefined): number {
    if (!animeTitle || !imageUrl) return 0;
    try {
      const canonicalAnime = normalizeAnimeText(animeTitle);
      const stmt = this.db.prepare('UPDATE anime_tracks SET image_url = ? WHERE canonical_anime_title = ?');
      const result = stmt.run(imageUrl, canonicalAnime);
      return Number(result?.changes) || 0;
    } catch {
      return 0;
    }
  }

  insertSample({ animeTrackId, sampleIndex, samplePath, sampleUrl, offsetSeconds, durationSeconds = 20 }: {
    animeTrackId: number;
    sampleIndex: number;
    samplePath: string;
    sampleUrl: string;
    offsetSeconds: number;
    durationSeconds?: number;
  }) {
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

  getSamplesForTrack(animeTrackId: number): AnimeSampleRow[] {
    return this.db.prepare(`
      SELECT sample_index, sample_url, offset_seconds, duration_seconds
      FROM anime_samples
      WHERE anime_track_id = ?
      ORDER BY sample_index ASC
    `).all(animeTrackId) as unknown as AnimeSampleRow[];
  }

  /**
   * Retrieves random playable anime tracks with verified sample audio.
   * Formatted directly for consumption by Anagroove's crossword solver.
   */
  getRandomAnimeTracks({
    count = 10,
    yearRange = null,
    type = null, // 'OP', 'ED', or null for both
    search = null, // Optional keyword or anime search term
    requireSamples = true,
  }: AnimeTrackQuery = {}): AnimeSong[] {
    const whereClauses: string[] = [];
    const params: SQLInputValue[] = [];

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

    const rows = this.db.prepare(sql).all(...params) as unknown as AnimeTrackRow[];

    return rows.map((r): AnimeSong => {
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
        albumArt: r.image_url || '',
        imageUrl: r.image_url || '',
        anilistId: r.anilist_id || null,
        malId: r.mal_id || null,
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
    const count = (sql: string) => Number(this.db.prepare(sql).get()?.count) || 0;
    const totalTracks = count(`SELECT COUNT(*) as count FROM anime_tracks`);
    const totalOps = count(`SELECT COUNT(*) as count FROM anime_tracks WHERE theme_type = 'OP'`);
    const totalEds = count(`SELECT COUNT(*) as count FROM anime_tracks WHERE theme_type = 'ED'`);
    const totalSamples = count(`SELECT COUNT(*) as count FROM anime_samples`);
    const tracksWithSamples = count(`SELECT COUNT(DISTINCT anime_track_id) as count FROM anime_samples`);
    const yearStats = this.db.prepare(`SELECT MIN(year) as minYear, MAX(year) as maxYear FROM anime_tracks WHERE year IS NOT NULL`).get() as
      { minYear: number | null; maxYear: number | null } | undefined;

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

  close(): void {
    try {
      this.db.exec('PRAGMA optimize;');
    } catch {
      // ignore
    }
  }
}

// Opened on first use, not at import time
export const animeCatalog: AnimeCatalog = lazySingleton(() => new AnimeCatalog()).instance;
