#!/usr/bin/env node
import '../server/config.js';
import { SqliteCatalog } from '../server/db/sqliteCatalog.js';
import { LATEST_CATALOG_VERSION } from '../server/db/catalogMigrations.js';
import { parseFlags, parseOrExit } from './lib/cli.js';

const USAGE = `
Applies pending catalog schema migrations (the server also applies them on first use).

  npm run db:migrate                                  migrate server/data/catalog.sqlite (backup first)
  npm run db:migrate -- --no-backup                   skip the backup copy
  npm run db:migrate -- --db=path/to/catalog.sqlite`;

const flags = parseOrExit(() => parseFlags({ db: { type: 'string' }, 'no-backup': { type: 'boolean' } }), USAGE);
if (flags['no-backup']) process.env.SPOTYSPICE_SKIP_DB_BACKUP = '1';

const started = Date.now();
const catalog = flags.db ? new SqliteCatalog(flags.db) : new SqliteCatalog();
const { from, to, applied, backupPath } = catalog.migration!;

if (applied.length === 0) {
  console.log(`Catalog already at schema v${to} (latest v${LATEST_CATALOG_VERSION}). Nothing to do.`);
} else {
  console.log(`Migrated catalog v${from} -> v${to} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const name of applied) console.log(`  - ${name}`);
  if (backupPath) console.log(`Backup: ${backupPath}`);
}

catalog.db!.exec('PRAGMA wal_checkpoint(TRUNCATE);');
catalog.close();
