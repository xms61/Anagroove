/**
 * `npm run db:gate:fixture`: builds the fixture catalog in a temp dir and runs the validation
 * gate CLI (`validate_and_sanitize_db.ts --ci`) against it. Exits with the gate's status.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildFixtureCatalog } from './fixtureCatalog.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anagroove-gate-'));
const dbPath = path.join(dir, 'catalog.sqlite');
let gate;
try {
  buildFixtureCatalog(dbPath);
  gate = spawnSync(process.execPath, ['scripts/validate_and_sanitize_db.ts', `--db=${dbPath}`, '--ci', '--no-report'], { stdio: 'inherit' });
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the SQLite files briefly; the OS temp cleaner will get them
  }
}
process.exit(gate?.status ?? 1);
