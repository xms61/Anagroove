/**
 * Catalog coverage: can every theme and a set of typical custom prompts be served from the local
 * catalog, with enough variety? For each target it measures the catalog window (tracks, distinct
 * artists, languages) and generates a few seeded puzzles to check they fill up and differ.
 * Used by `npm run catalog:coverage`; run it with SPOTYSPICE_OFFLINE=1 so nothing leaves the catalog.
 */
import { THEMES } from '../../shared/themes.ts';
import { buildQueryPlan } from '../services/queryBuilder.js';
import { isAnimeTarget } from '../policy/selectionPolicy.js';
import { catalogCandidates } from './candidates.js';
import { createRng } from './random.js';
import { getRandomSongPool } from './songPool.js';

/** Minimum window per target kind. A puzzle takes ~12 songs, one per artist, over ~10 puzzles. */
export const COVERAGE_TARGETS = Object.freeze({
  theme: { tracks: 150, artists: 40 },
  prompt: { tracks: 60, artists: 20 },
  artist: { tracks: 15, artists: 1 },
});

export const BENCHMARK_PROMPTS = Object.freeze([
  // moods and topics (title text search)
  'songs about rain', 'summer road trip', 'love songs', 'breakup songs', 'songs about the moon', 'night drive',
  'party anthems', 'christmas songs', 'songs about fire', 'dancing all night',
  // eras
  '60s rock', '70s disco', '80s synth-pop', '90s grunge', '90s hip hop', '2000s pop-punk', '2010s edm',
  'rock before 1990', 'pop from 2020-2026',
  // genres
  'classic rock', 'indie rock', 'neo soul', 'motown', 'country', 'jazz', 'reggae', 'heavy metal', 'punk', 'folk',
  'k-pop girl groups', '80s Japanese city pop', 'j-rock', 'video game music', 'movie soundtracks',
  // artists
  'songs by Queen', 'songs by Taylor Swift', 'songs by BTS', 'songs by Daft Punk', 'songs by YOASOBI',
]);

const WINDOW_SIZE = 5000;
const PUZZLE_SIZE = 12;
const PUZZLE_RUNS = 5;

/** Average pairwise Jaccard overlap of the puzzles' song ids (0 = all different, 1 = identical). */
export function averageOverlap(puzzles) {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < puzzles.length; i++) {
    for (let j = i + 1; j < puzzles.length; j++) {
      const a = new Set(puzzles[i]);
      const b = new Set(puzzles[j]);
      const union = new Set([...a, ...b]).size;
      total += union === 0 ? 0 : [...a].filter(id => b.has(id)).length / union;
      pairs++;
    }
  }
  return pairs === 0 ? 0 : total / pairs;
}

/**
 * Measures one theme or prompt.
 * @returns {{ label: string, kind: 'theme'|'prompt'|'artist', tracks: number, capped: boolean, artists: number,
 *             languages: Record<string, number>, puzzleSongs: number, overlap: number, ok: boolean }}
 */
export async function measureTarget({ catalog, label, genre = 'all', prompt = '' }) {
  const queryPlan = buildQueryPlan({ genre, prompt });
  const kind = queryPlan.artist ? 'artist' : (prompt ? 'prompt' : 'theme');
  const rows = catalogCandidates({ catalog, queryPlan, prompt, rng: createRng(`coverage-${label}`), poolSize: WINDOW_SIZE });
  const languages = {};
  for (const row of rows) languages[row.language] = (languages[row.language] || 0) + 1;

  const puzzles = [];
  for (let run = 0; run < PUZZLE_RUNS; run++) {
    const songs = await getRandomSongPool({ genre, prompt, count: PUZZLE_SIZE, seed: `coverage-${label}-${run}` });
    puzzles.push(songs.map(song => song.id));
  }

  const artists = new Set(rows.map(row => row.artist)).size;
  const puzzleSongs = Math.min(...puzzles.map(puzzle => puzzle.length));
  const target = COVERAGE_TARGETS[kind];
  return {
    label,
    kind,
    tracks: rows.length,
    capped: rows.length >= WINDOW_SIZE,
    artists,
    languages,
    puzzleSongs,
    overlap: Number(averageOverlap(puzzles).toFixed(2)),
    ok: rows.length >= target.tracks && artists >= target.artists && puzzleSongs >= PUZZLE_SIZE,
  };
}

/** Every theme (the anime theme is served from its own catalog and skipped) and every benchmark prompt. */
export async function measureCoverage({ catalog, prompts = BENCHMARK_PROMPTS } = {}) {
  const results = [];
  for (const theme of THEMES.filter(t => !isAnimeTarget(t.id, ''))) {
    results.push(await measureTarget({ catalog, label: `theme: ${theme.id}`, genre: theme.id }));
  }
  for (const prompt of prompts) {
    results.push(await measureTarget({ catalog, label: prompt, prompt }));
  }
  return results;
}
