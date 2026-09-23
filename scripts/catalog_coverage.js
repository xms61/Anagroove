#!/usr/bin/env node
import path from 'path';
import { parseFlags, parseOrExit } from './lib/cli.js';

const USAGE = `
Measures whether every theme and a set of typical custom prompts can be served from the local
catalog with enough variety. Offline: no Deezer/iTunes requests.

  npm run catalog:coverage                       table for the real catalog
  npm run catalog:coverage -- --ci               exit 1 when a target misses its minimum
  npm run catalog:coverage -- --json             full results as JSON
  npm run catalog:coverage -- --data-dir=path    another data directory (with catalog.sqlite)`;

const flags = parseOrExit(() => parseFlags({
  ci: { type: 'boolean' },
  json: { type: 'boolean' },
  'data-dir': { type: 'string' },
}), USAGE);

// Before the server modules load: catalog only, quiet logs, optional data dir
process.env.SPOTYSPICE_OFFLINE = '1';
process.env.LOG_LEVEL ??= 'warn';
if (flags['data-dir']) process.env.SPOTYSPICE_DATA_DIR = path.resolve(flags['data-dir']);

const { sqliteCatalog } = await import('../server/db/sqliteCatalog.js');
const { measureCoverage, COVERAGE_TARGETS } = await import('../server/selection/coverage.js');

const started = Date.now();
const results = await measureCoverage({ catalog: sqliteCatalog });

if (flags.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const cell = (value, width) => String(value).padEnd(width);
  console.log(`\n${cell('Target', 28)}${cell('Tracks', 8)}${cell('Artists', 9)}${cell('Languages', 22)}${cell('Puzzle', 8)}${cell('Overlap', 9)}OK`);
  for (const r of results) {
    const languages = Object.entries(r.languages).map(([language, n]) => `${language} ${n}`).join(', ');
    console.log(`${cell(r.label.slice(0, 27), 28)}${cell(`${r.tracks}${r.capped ? '+' : ''}`, 8)}${cell(r.artists, 9)}${cell(languages.slice(0, 21), 22)}${cell(`${r.puzzleSongs}/12`, 8)}${cell(r.overlap, 9)}${r.ok ? 'yes' : 'NO'}`);
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} targets pass (themes >= ${COVERAGE_TARGETS.theme.tracks} tracks / ${COVERAGE_TARGETS.theme.artists} artists, prompts >= ${COVERAGE_TARGETS.prompt.tracks} / ${COVERAGE_TARGETS.prompt.artists}, artist prompts >= ${COVERAGE_TARGETS.artist.tracks} tracks, full 12-song puzzles) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

process.exit(flags.ci && results.some(r => !r.ok) ? 1 : 0);
