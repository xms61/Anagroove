/**
 * Preloaded via `node --import` before the test runner so every server module
 * resolves its data paths (store.json, catalog.sqlite, anime_catalog.sqlite)
 * to a throwaway temp directory instead of the real server/data/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.SPOTYSPICE_DATA_DIR) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotyspice-test-'));
  process.env.SPOTYSPICE_DATA_DIR = dataDir;

  process.on('exit', () => {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // SQLite handles may still be open on Windows; the OS temp cleaner will get it
    }
  });
}
