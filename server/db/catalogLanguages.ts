/**
 * Recomputes artist-level languages (voted over each artist's catalog) and re-resolves every
 * track's language with them. Scene genres (K-Pop, Japanese, …) that the vote doesn't confirm are
 * removed from the artist. Pure local work: no network. Used by migration v3 and by
 * `npm run catalog:recompute` after new crawls.
 */
import type { DatabaseSync } from 'node:sqlite';
import { classifyArtistLanguage, resolveTrackLanguage } from './languageClassifier.ts';
import { SCENE_GENRES } from '../../shared/themes.ts';

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
  const artistRows = db.prepare('SELECT id, display_name, genres_json FROM artists').all() as { id: number; display_name: string; genres_json: string | null }[];
  const artistsById = new Map(artistRows.map(r => [r.id, { name: r.display_name, genres: parseGenres(r.genres_json) }]));

  let artists = 0;
  let sceneGenresRemoved = 0;
  let currentArtist: number | null = null;
  let titles: string[] = [];
  let isrcs: (string | null)[] = [];
  const flush = () => {
    if (currentArtist === null) return;
    const { name = '', genres = [] } = artistsById.get(currentArtist) || {};
    const { language } = classifyArtistLanguage({ titles, isrcs, name, genres });
    setArtistLanguage.run(language, currentArtist);
    const kept = withoutForeignSceneGenres(genres, language);
    if (kept.length < genres.length) {
      setArtistGenres.run(kept.length > 0 ? JSON.stringify(kept) : null, currentArtist);
      sceneGenresRemoved += genres.length - kept.length;
    }
    artists++;
  };

  const trackRows = db.prepare('SELECT artist_id, display_title, isrc FROM tracks ORDER BY artist_id').iterate() as
    Iterable<{ artist_id: number; display_title: string; isrc: string | null }>;
  for (const row of trackRows) {
    if (row.artist_id !== currentArtist) {
      flush();
      currentArtist = row.artist_id;
      titles = [];
      isrcs = [];
    }
    titles.push(row.display_title);
    isrcs.push(row.isrc);
  }
  flush();

  const setTrackLanguage = db.prepare('UPDATE tracks SET language = ? WHERE id = ?');
  const rows = db.prepare(`
    SELECT t.id, t.display_title, t.isrc, t.language, a.display_name, a.primary_language
    FROM tracks t JOIN artists a ON a.id = t.artist_id
  `).all() as unknown as TrackLanguageRow[];

  let changed = 0;
  for (const row of rows) {
    const language = resolveTrackLanguage({
      title: row.display_title,
      artist: row.display_name,
      isrc: row.isrc,
      artistLanguage: row.primary_language,
    });
    if (language !== row.language) {
      setTrackLanguage.run(language, row.id);
      changed++;
    }
  }

  return { artists, tracks: rows.length, changed, sceneGenresRemoved };
}
