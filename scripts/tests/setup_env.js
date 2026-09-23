/**
 * Preloaded via `node --import` (npm test passes it to `node --test`, which
 * forwards it to every test-file process) so server modules resolve their data
 * paths (users.sqlite, catalog.sqlite, anime_catalog.sqlite) to a throwaway
 * temp directory instead of the real server/data/.
 *
 * Each process gets its own directory: test files run in parallel child
 * processes that inherit the parent's env, so a directory created by another
 * process (tracked via SPOTYSPICE_TEST_DATA_OWNER) is never reused.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const owner = process.env.SPOTYSPICE_TEST_DATA_OWNER;
const inherited = owner && owner !== String(process.pid);

if (!process.env.SPOTYSPICE_DATA_DIR || inherited) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotyspice-test-'));
  process.env.SPOTYSPICE_DATA_DIR = dataDir;
  process.env.SPOTYSPICE_TEST_DATA_OWNER = String(process.pid);

  process.on('exit', () => {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // SQLite handles may still be open on Windows; the OS temp cleaner will get it
    }
  });
}
