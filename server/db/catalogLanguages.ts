/**
 * Recomputes artist-level languages (voted over each artist's catalog) and re-resolves every
 * track's language with them. Pure local work: no network. Used by migration v3 and by
 * `npm run catalog:recompute` after new crawls.
 */
import type { DatabaseSync } from 'node:sqlite';
import { classifyArtistLanguage, resolveTrackLanguage } from './languageClassifier.ts';

export interface LanguageRecompute {
  artists: number;
  tracks: number;
  changed: number;
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
  const artistRows = db.prepare('SELECT id, display_name FROM artists').all() as { id: number; display_name: string }[];
  const artistNames = new Map(artistRows.map(r => [r.id, r.display_name]));

  let artists = 0;
  let currentArtist: number | null = null;
  let titles: string[] = [];
  let isrcs: (string | null)[] = [];
  const flush = () => {
    if (currentArtist === null) return;
    const { language } = classifyArtistLanguage({ titles, isrcs, name: artistNames.get(currentArtist) || '' });
    setArtistLanguage.run(language, currentArtist);
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

  return { artists, tracks: rows.length, changed };
}
