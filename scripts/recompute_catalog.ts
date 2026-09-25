#!/usr/bin/env node
import '../server/config.ts';
import { SqliteCatalog } from '../server/db/sqliteCatalog.ts';
import { languageChanges, languageSnapshot, recomputeCatalogLanguages, type LanguageChanges } from '../server/db/catalogLanguages.ts';
import { recomputeCatalogPopularity } from '../server/db/catalogPopularity.ts';
import { parseFlags, parseOrExit } from './lib/cli.ts';

const USAGE = `
Recomputes derived catalog fields after crawls and enrichment (local, no network):
artist languages (K-pop/J-pop scene genres the vote doesn't confirm are removed), then track
languages, then the per-language popularity percentile. Prints what the language votes changed.

  npm run catalog:recompute
  npm run catalog:recompute -- --dry-run       languages only, rolled back: review the changes first
  npm run catalog:recompute -- --db=path/to/catalog.sqlite`;

const flags = parseOrExit(() => parseFlags({ db: { type: 'string' }, 'dry-run': { type: 'boolean' } }), USAGE);
const catalog = flags.db ? new SqliteCatalog(flags.db) : new SqliteCatalog();
const db = catalog.db;
const dryRun = Boolean(flags['dry-run']);
const started = Date.now();

function tally(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries.map(([transition, n]) => `${transition} ${n.toLocaleString()}`).join(' · ') : 'none';
}

function printLanguageChanges({ artists, tracks, topArtists }: LanguageChanges) {
  console.log(`Artist votes changed:    ${tally(artists)}`);
  console.log(`Track languages changed: ${tally(tracks)}`);
  if (topArtists.length === 0) return;
  console.log('Most-followed artists whose vote changed:');
  for (const { name, fans, from, to } of topArtists) {
    console.log(`  ${name} (${fans.toLocaleString()} fans): ${from ?? 'none'} → ${to ?? 'none'}`);
  }
}

if (dryRun) db.exec('BEGIN');
const before = languageSnapshot(db);
console.log(`Languages:  ${JSON.stringify(recomputeCatalogLanguages(db))}`);
printLanguageChanges(languageChanges(db, before));

if (dryRun) {
  db.exec('ROLLBACK');
  catalog.close();
  console.log('Dry run: nothing was written.');
} else {
  console.log(`Popularity: ${recomputeCatalogPopularity(db).toLocaleString()} scores changed`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  catalog.close();
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
