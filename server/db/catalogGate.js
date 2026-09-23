/**
 * Catalog validation gate (`npm run db:validate -- --ci`): hard checks that a cleaned catalog
 * must pass. Every check reports its measured value so a failing run shows what to fix.
 */
import { checkAuthenticity } from '../policy/authenticityRules.js';
import {
  ACCEPTED_VERSION_TYPES,
  ALLOWED_LANGUAGES,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  classifyVersion,
  cleanDisplayText,
  isAcceptedVersion,
} from './trackNormalization.js';

export const DEFAULT_GATE_THRESHOLDS = Object.freeze({
  minYearCoverage: 0.95,
  minIsrcCoverage: 0.95,
});

const sqlList = (values) => values.map(v => `'${v}'`).join(', ');

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Partial<typeof DEFAULT_GATE_THRESHOLDS>} [thresholds]
 * @returns {{ ok: boolean, checks: Array<{ id: string, label: string, ok: boolean, value: number, limit: string }> }}
 */
export function evaluateCatalogGate(db, thresholds = {}) {
  const { minYearCoverage, minIsrcCoverage } = { ...DEFAULT_GATE_THRESHOLDS, ...thresholds };
  const count = (sql) => Number(db.prepare(sql).get().c) || 0;
  const checks = [];
  const zero = (id, label, value) => checks.push({ id, label, ok: value === 0, value, limit: '= 0' });

  const quick = db.prepare('PRAGMA quick_check;').all();
  const integrityOk = quick.length === 1 && quick[0].quick_check === 'ok';
  checks.push({ id: 'integrity', label: 'SQLite quick_check', ok: integrityOk, value: integrityOk ? 0 : quick.length, limit: 'ok' });
  zero('foreign_keys', 'Foreign key violations', db.prepare('PRAGMA foreign_key_check;').all().length);

  const tracks = count('SELECT COUNT(*) AS c FROM tracks');

  zero('duplicates', 'Duplicate (artist, base title) groups', count(`
    SELECT COUNT(*) AS c FROM (SELECT 1 FROM tracks GROUP BY artist_id, canonical_title HAVING COUNT(*) > 1)
  `));
  zero('language', `Tracks outside ${ALLOWED_LANGUAGES.join('/')}`, count(`
    SELECT COUNT(*) AS c FROM tracks WHERE language IS NULL OR language NOT IN (${sqlList(ALLOWED_LANGUAGES)})
  `));
  zero('version', `Stored version not ${ACCEPTED_VERSION_TYPES.join('/')}`, count(`
    SELECT COUNT(*) AS c FROM tracks WHERE version_type NOT IN (${sqlList(ACCEPTED_VERSION_TYPES)})
  `));
  zero('popularity', 'Popularity outside 0-100', count(`
    SELECT COUNT(*) AS c FROM tracks WHERE popularity IS NULL OR popularity < 0 OR popularity > 100
  `));
  zero('duration', `Duration outside ${MIN_DURATION_MS / 1000}s-${MAX_DURATION_MS / 60000}min`, count(`
    SELECT COUNT(*) AS c FROM tracks WHERE duration_ms IS NULL OR duration_ms < ${MIN_DURATION_MS} OR duration_ms > ${MAX_DURATION_MS}
  `));
  zero('title', 'Empty base-title keys', count("SELECT COUNT(*) AS c FROM tracks WHERE canonical_title IS NULL OR canonical_title = ''"));
  zero('unlinked', 'Tracks without a provider link', count(`
    SELECT COUNT(*) AS c FROM tracks t WHERE NOT EXISTS (SELECT 1 FROM track_providers p WHERE p.track_id = t.id)
  `));
  zero('orphans', 'Orphan samples/providers/artists', count(`
    SELECT
      (SELECT COUNT(*) FROM track_samples WHERE track_id NOT IN (SELECT id FROM tracks)) +
      (SELECT COUNT(*) FROM track_providers WHERE track_id NOT IN (SELECT id FROM tracks)) +
      (SELECT COUNT(*) FROM tracks WHERE artist_id NOT IN (SELECT id FROM artists)) +
      (SELECT COUNT(*) FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)) AS c
  `));

  // Re-derived from the text with today's rules, independent of the stored columns
  let versionPattern = 0;
  let inauthentic = 0;
  let uncleanText = 0;
  for (const row of db.prepare(`
    SELECT t.display_title, t.album_name, a.display_name AS artist
    FROM tracks t JOIN artists a ON a.id = t.artist_id
  `).iterate()) {
    if (!isAcceptedVersion(classifyVersion(row.display_title, row.album_name || ''))) versionPattern++;
    if (!checkAuthenticity({ title: row.display_title, artist: row.artist, album: row.album_name || '' }).authentic) inauthentic++;
    if (row.display_title !== cleanDisplayText(row.display_title)) uncleanText++;
  }
  zero('version_pattern', 'Titles matching a non-original version pattern', versionPattern);
  zero('inauthentic', 'Tracks failing the authenticity rules', inauthentic);
  zero('text', 'Titles with HTML entities or stray whitespace', uncleanText);

  const coverage = (sql) => (tracks === 0 ? 1 : count(sql) / tracks);
  const yearCoverage = coverage('SELECT COUNT(*) AS c FROM tracks WHERE release_year IS NOT NULL');
  const isrcCoverage = coverage('SELECT COUNT(*) AS c FROM tracks WHERE isrc IS NOT NULL');
  checks.push({ id: 'year_coverage', label: 'Release year coverage', ok: yearCoverage >= minYearCoverage, value: yearCoverage, limit: `>= ${minYearCoverage}` });
  checks.push({ id: 'isrc_coverage', label: 'ISRC coverage', ok: isrcCoverage >= minIsrcCoverage, value: isrcCoverage, limit: `>= ${minIsrcCoverage}` });

  const ftsRows = count('SELECT COUNT(*) AS c FROM tracks_fts');
  checks.push({ id: 'fts', label: 'FTS rows = track rows', ok: ftsRows === tracks, value: ftsRows, limit: `= ${tracks}` });

  return { ok: checks.every(check => check.ok), checks };
}
