#!/usr/bin/env node
import '../server/config.js';
import { SqliteCatalog } from '../server/db/sqliteCatalog.js';
import { recomputeCatalogLanguages } from '../server/db/catalogLanguages.js';
import { recomputeCatalogPopularity } from '../server/db/catalogPopularity.js';
import { parseFlags, parseOrExit } from './lib/cli.js';

const USAGE = `
Recomputes derived catalog fields after crawls and enrichment (local, no network):
artist languages, then track languages, then the per-language popularity percentile.

  npm run catalog:recompute
  npm run catalog:recompute -- --db=path/to/catalog.sqlite`;

const flags = parseOrExit(() => parseFlags({ db: { type: 'string' } }), USAGE);
const catalog = flags.db ? new SqliteCatalog(flags.db) : new SqliteCatalog();
const started = Date.now();

console.log(`Languages:  ${JSON.stringify(recomputeCatalogLanguages(catalog.db))}`);
console.log(`Popularity: ${recomputeCatalogPopularity(catalog.db).toLocaleString()} scores changed`);

catalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
catalog.close();
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
