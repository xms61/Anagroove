#!/usr/bin/env node
import '../server/config.ts';
import { SqliteCatalog } from '../server/db/sqliteCatalog.ts';
import { recomputeCatalogLanguages } from '../server/db/catalogLanguages.ts';
import { recomputeCatalogPopularity } from '../server/db/catalogPopularity.ts';
import { parseFlags, parseOrExit } from './lib/cli.ts';

const USAGE = `
Recomputes derived catalog fields after crawls and enrichment (local, no network):
artist languages, then track languages, then the per-language popularity percentile.

  npm run catalog:recompute
  npm run catalog:recompute -- --db=path/to/catalog.sqlite`;

const flags = parseOrExit(() => parseFlags({ db: { type: 'string' } }), USAGE);
const catalog = flags.db ? new SqliteCatalog(flags.db) : new SqliteCatalog();
const db = catalog.db;
const started = Date.now();

console.log(`Languages:  ${JSON.stringify(recomputeCatalogLanguages(db))}`);
console.log(`Popularity: ${recomputeCatalogPopularity(db).toLocaleString()} scores changed`);

db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
catalog.close();
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
