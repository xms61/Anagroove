/**
 * Recomputes artist-level languages (voted over each artist's catalog) and re-resolves every
 * track's language with them. Scene genres (K-Pop, Japanese, …) that the vote doesn't confirm are
 * removed from the artist. Pure local work: no network. Used by migration v3 and by
 * `npm run catalog:recompute` after new crawls. The artist's Deezer release titles and the tracks'
 * lyrics languages (v9 columns, filled by catalog:enrich) are read when the columns exist: migration
 * v3 runs this before they do.
 */
import type { DatabaseSync } from 'node:sqlite';
import { classifyArtistLanguage, resolveTrackLanguage } from './languageClassifier.ts';
import { SCENE_GENRES } from '../../shared/themes.ts';
import { columnNames } from './tableColumns.ts';

export interface LanguageRecompute {
  artists: number;
  tracks: number;
  changed: number;
  sceneGenresRemoved: number;
}

/** Genres stored as a JSON array; anything else reads as none. */
export function parseGenres(json: string | null | undefined): string[] {
  try {
    const genres = JSON.parse(json || '[]');
    return Array.isArray(genres) ? genres : [];
  } catch {
    return [];
  }
}

/** An artist's genres without the scene genres of languages other than its own (none while unvoted). */
export function withoutForeignSceneGenres(genres: string[], language: string | null): string[] {
  if (!language) return genres;
  const foreign = Object.entries(SCENE_GENRES).filter(([scene]) => scene !== language).flatMap(([, sceneGenres]) => sceneGenres);
  return genres.filter(genre => !foreign.includes(genre));
}

interface TrackLanguageRow {
  id: number;
  display_title: string;
  isrc: string | null;
  language: string | null;
  lyrics_language: string | null;
  display_name: string;
  primary_language: string | null;
}

export function recomputeCatalogLanguages(db: DatabaseSync): LanguageRecompute {
  // SAVEPOINT batches the writes whether or not the caller already holds a transaction
  db.exec('SAVEPOINT recompute_languages;');
  try {
    const result = recompute(db);
    db.exec('RELEASE recompute_languages;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK TO recompute_languages; RELEASE recompute_languages;');
    throw err;
  }
}

function recompute(db: DatabaseSync): LanguageRecompute {
  const setArtistLanguage = db.prepare('UPDATE artists SET primary_language = ? WHERE id = ?');
  const setArtistGenres = db.prepare('UPDATE artists SET genres_json = ? WHERE id = ?');
  const discography = columnNames(db, 'artists').has('discography_titles_json') ? 'discography_titles_json' : 'NULL';
  const artistRows = db.prepare(`SELECT id, display_name, genres_json, ${discography} AS discography FROM artists`).all() as
    { id: number; display_name: string; genres_json: string | null; discography: string | null }[];
  const artistsById = new Map(artistRows.map(r => [r.id, { name: r.display_name, genres: parseGenres(r.genres_json), discography: parseGenres(r.discography) }]));

  let artists = 0;
  let sceneGenresRemoved = 0;
  let currentArtist: number | null = null;
  let titles: string[] = [];
  let albums: (string | null)[] = [];
  let isrcs: (string | null)[] = [];
  const flush = () => {
    if (currentArtist === null) return;
    const { name = '', genres = [], discography = [] } = artistsById.get(currentArtist) || {};
    const { language } = classifyArtistLanguage({ titles: [...new Set([...titles, ...discography])], albums, isrcs, name, genres });
    setArtistLanguage.run(language, currentArtist);
    const kept = withoutForeignSceneGenres(genres, language);
    if (kept.length < genres.length) {
      setArtistGenres.run(kept.length > 0 ? JSON.stringify(kept) : null, currentArtist);
      sceneGenresRemoved += genres.length - kept.length;
    }
    artists++;
  };

  const trackRows = db.prepare('SELECT artist_id, display_title, album_name, isrc FROM tracks ORDER BY artist_id').iterate() as
    Iterable<{ artist_id: number; display_title: string; album_name: string | null; isrc: string | null }>;
  for (const row of trackRows) {
    if (row.artist_id !== currentArtist) {
      flush();
      currentArtist = row.artist_id;
      titles = [];
      albums = [];
      isrcs = [];
    }
    titles.push(row.display_title);
    albums.push(row.album_name);
    isrcs.push(row.isrc);
  }
  flush();

  const setTrackLanguage = db.prepare('UPDATE tracks SET language = ? WHERE id = ?');
  const lyrics = columnNames(db, 'tracks').has('lyrics_language') ? 't.lyrics_language' : 'NULL';
  const rows = db.prepare(`
    SELECT t.id, t.display_title, t.isrc, t.language, ${lyrics} AS lyrics_language, a.display_name, a.primary_language
    FROM tracks t JOIN artists a ON a.id = t.artist_id
  `).all() as unknown as TrackLanguageRow[];

  let changed = 0;
  for (const row of rows) {
    const language = resolveTrackLanguage({
      title: row.display_title,
      artist: row.display_name,
      isrc: row.isrc,
      artistLanguage: row.primary_language,
      lyricsLanguage: row.lyrics_language,
    });
    if (language !== row.language) {
      setTrackLanguage.run(language, row.id);
      changed++;
    }
  }

  return { artists, tracks: rows.length, changed, sceneGenresRemoved };
}

/** Artist votes and track languages at one point in time, to report what a recompute changed. */
export interface LanguageSnapshot {
  artists: Map<number, string | null>;
  tracks: Map<number, string | null>;
}

export interface LanguageChanges {
  /** Counts per transition, e.g. { "en→fr": 12, "none→es": 3 }. */
  artists: Record<string, number>;
  tracks: Record<string, number>;
  /** The most-followed artists whose vote changed. */
  topArtists: { name: string; fans: number; from: string | null; to: string | null }[];
}

export function languageSnapshot(db: DatabaseSync): LanguageSnapshot {
  const artists = db.prepare('SELECT id, primary_language AS language FROM artists').all() as { id: number; language: string | null }[];
  const tracks = db.prepare('SELECT id, language FROM tracks').all() as { id: number; language: string | null }[];
  return {
    artists: new Map(artists.map(r => [r.id, r.language])),
    tracks: new Map(tracks.map(r => [r.id, r.language])),
  };
}

export function languageChanges(db: DatabaseSync, before: LanguageSnapshot, topCount = 30): LanguageChanges {
  const after = languageSnapshot(db);
  const count = (tally: Record<string, number>, from: string | null | undefined, to: string | null) => {
    const key = `${from ?? 'none'}→${to ?? 'none'}`;
    tally[key] = (tally[key] || 0) + 1;
  };
  const changes: LanguageChanges = { artists: {}, tracks: {}, topArtists: [] };
  const changedArtists: number[] = [];
  for (const [id, language] of after.artists) {
    if (before.artists.get(id) === language) continue;
    count(changes.artists, before.artists.get(id), language);
    changedArtists.push(id);
  }
  for (const [id, language] of after.tracks) {
    if (before.tracks.get(id) !== language) count(changes.tracks, before.tracks.get(id), language);
  }
  const details = db.prepare(`
    SELECT id, display_name AS name, fans_count AS fans FROM artists
    WHERE id IN (SELECT value FROM json_each(?)) ORDER BY fans_count DESC LIMIT ?
  `).all(JSON.stringify(changedArtists), topCount) as { id: number; name: string; fans: number | null }[];
  changes.topArtists = details.map(r => ({ name: r.name, fans: r.fans || 0, from: before.artists.get(r.id) ?? null, to: after.artists.get(r.id) ?? null }));
  return changes;
}
