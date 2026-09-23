#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { DATA_DIR } from '../server/paths.js';
import { catalogStatistics, renderValidationReport } from '../server/db/catalogReport.js';
import { CLEANUP_STEPS, compactCatalog, runCatalogCleanup } from '../server/db/catalogCleanup.js';
import { DEFAULT_GATE_THRESHOLDS, evaluateCatalogGate } from '../server/db/catalogGate.js';
import { LATEST_CATALOG_VERSION, runCatalogMigrations } from '../server/db/catalogMigrations.js';
import { listFlag, numberFlag, parseFlags, parseOrExit } from './lib/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `
Catalog validation, cleanup and CI gate.

  npm run db:validate                  diagnostics + cleanup dry run + gate, writes reports/database_validation_report.md
  npm run db:sanitize                  backup (VACUUM INTO), apply the cleanup, ANALYZE, checkpoint, VACUUM
  npm run db:validate -- --ci          exit 1 unless every gate check passes

Flags (after "--"):
  --db=path                   catalog file (default: server/data/catalog.sqlite)
  --steps=a,b                 cleanup steps to run (default: all): ${CLEANUP_STEPS.join(', ')}
  --no-backup                 --fix without the VACUUM INTO backup
  --no-vacuum                 --fix without the final VACUUM
  --min-year-coverage=0.95    gate threshold (0-1)
  --min-isrc-coverage=0.95    gate threshold (0-1)
  --no-report                 skip the markdown report
  --json                      print the full result as JSON`;

const OPTIONS = {
  fix: { type: 'boolean' },
  ci: { type: 'boolean' },
  json: { type: 'boolean' },
  'no-backup': { type: 'boolean' },
  'no-vacuum': { type: 'boolean' },
  'no-report': { type: 'boolean' },
  db: { type: 'string' },
  steps: { type: 'string' },
  'min-year-coverage': { type: 'string' },
  'min-isrc-coverage': { type: 'string' },
};
const flags = parseOrExit(() => {
  const values = parseFlags(OPTIONS);
  return {
    ...values,
    steps: listFlag(values, 'steps', CLEANUP_STEPS) ?? [...CLEANUP_STEPS],
    minYearCoverage: numberFlag(values, 'min-year-coverage') ?? DEFAULT_GATE_THRESHOLDS.minYearCoverage,
    minIsrcCoverage: numberFlag(values, 'min-isrc-coverage') ?? DEFAULT_GATE_THRESHOLDS.minIsrcCoverage,
  };
}, USAGE);
const flag = (name) => Boolean(flags[name]);

const shouldFix = flag('fix');
const ciMode = flag('ci');
const dbPath = path.resolve(flags.db || path.join(DATA_DIR, 'catalog.sqlite'));
const steps = flags.steps;
const thresholds = { minYearCoverage: flags.minYearCoverage, minIsrcCoverage: flags.minIsrcCoverage };

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function openCatalog() {
  if (!fs.existsSync(dbPath)) throw new Error(`Catalog not found at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON; PRAGMA cache_size = -64000;');
  return db;
}

function printStep(name, result) {
  const counts = Object.entries(result)
    .filter(([key, value]) => typeof value === 'number' && key !== 'ms')
    .map(([key, value]) => `${key}=${value.toLocaleString()}`);
  if (result.reasons) counts.push(...Object.entries(result.reasons).map(([key, value]) => `${key}=${value.toLocaleString()}`));
  console.log(`   ${name.padEnd(11)} ${counts.join('  ')}  (${(result.ms / 1000).toFixed(1)}s)`);
}

function main() {
  console.log(`\nCatalog: ${dbPath}`);
  const db = openCatalog();

  try {
    const version = Number(db.prepare('PRAGMA user_version').get().user_version) || 0;
    let backupPath = null;
    if (shouldFix && !flag('no-backup')) {
      backupPath = path.join(path.dirname(dbPath), `${path.basename(dbPath, '.sqlite')}.backup-cleanup-${timestamp()}.sqlite`);
      console.log(`Backing up to ${backupPath} ...`);
      db.prepare('VACUUM INTO ?').run(backupPath);
    }
    if (version < LATEST_CATALOG_VERSION) {
      if (!shouldFix) {
        throw new Error(`Catalog is at schema v${version} (latest v${LATEST_CATALOG_VERSION}). Run \`npm run db:migrate\` first.`);
      }
      // The cleanup backup above already covers the migration
      const migration = runCatalogMigrations(db, { dbPath, backup: false });
      console.log(`Migrated v${migration.from} -> v${migration.to}`);
    }

    let stats = catalogStatistics(db);
    const { overview } = stats;
    console.log(`\nTracks ${overview.tracks.toLocaleString()}, artists ${overview.artists.toLocaleString()} (${overview.artistsEnriched}% enriched), release year known ${overview.releaseYearKnown}%`);
    console.log(`Languages: ${stats.languages.map(l => `${l.language} ${l.count.toLocaleString()}`).join(', ')}`);

    let cleanup = null;
    if (!ciMode) {
      console.log(`\n${shouldFix ? 'Applying' : 'Dry-running'} cleanup (${steps.join(', ')}) ...`);
      cleanup = runCatalogCleanup(db, { apply: shouldFix, steps, onStep: printStep });
      console.log(`   tracks ${cleanup.before.tracks.toLocaleString()} -> ${cleanup.after.tracks.toLocaleString()}, artists ${cleanup.before.artists.toLocaleString()} -> ${cleanup.after.artists.toLocaleString()}${shouldFix ? '' : '  (rolled back)'}`);
      if (shouldFix) {
        console.log('Compacting (ANALYZE, WAL checkpoint' + (flag('no-vacuum') ? '' : ', VACUUM') + ') ...');
        compactCatalog(db, { vacuum: !flag('no-vacuum') });
        if (backupPath) console.log(`Backup kept at ${backupPath} (delete it once you're happy with the result).`);
      }
    }

    const gate = evaluateCatalogGate(db, thresholds);
    console.log(`\nValidation gate: ${gate.ok ? 'PASS' : 'FAIL'}`);
    for (const check of gate.checks) {
      const value = Number.isInteger(check.value) ? check.value.toLocaleString() : check.value.toFixed(4);
      console.log(`   ${check.ok ? 'ok  ' : 'FAIL'} ${check.label.padEnd(48)} ${value.padStart(10)}  (${check.limit})`);
    }

    if (shouldFix) stats = catalogStatistics(db);
    const result = { stats, cleanup, gate };

    if (!flag('no-report') && !ciMode) {
      const reportsDir = path.resolve(__dirname, '../reports');
      fs.mkdirSync(reportsDir, { recursive: true });
      const reportPath = path.join(reportsDir, 'database_validation_report.md');
      fs.writeFileSync(reportPath, renderValidationReport({ dbPath, ...result }), 'utf8');
      console.log(`\nReport: ${reportPath}`);
    }
    if (flag('json')) console.log(JSON.stringify(result, null, 2));

    if (ciMode && !gate.ok) process.exitCode = 1;
  } finally {
    db.close();
  }
}

try {
  main();
} catch (err) {
  console.error(`\nValidation failed: ${err.message}`);
  process.exit(1);
}
