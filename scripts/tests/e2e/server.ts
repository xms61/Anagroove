/**
 * Server for the Playwright smoke test: production mode (serves dist/), a fresh temp data dir
 * holding the generated fixture catalog, and SPOTYSPICE_OFFLINE=1 so nothing hits the network.
 * Run `npm run build` first. Started by playwright.config.ts (webServer).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ is missing: run `npm run build` before the smoke test.');
  process.exit(1);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anagroove-e2e-'));
Object.assign(process.env, {
  SPOTYSPICE_DATA_DIR: dataDir,
  SPOTYSPICE_OFFLINE: '1',
  NODE_ENV: 'production',
});

// Server modules resolve their data paths on import, so they load after the env is set
const { buildFixtureCatalog } = await import('../fixtures/fixtureCatalog.ts');
const { tracks } = buildFixtureCatalog(path.join(dataDir, 'catalog.sqlite'));
const { server } = await import('../../../server/server.ts');

const port = Number(process.env.E2E_PORT) || 3101;
server.listen(port, '127.0.0.1', () => {
  console.log(`E2E server on http://127.0.0.1:${port} (${tracks} fixture tracks, offline)`);
});

const stop = () => {
  server.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // SQLite may still hold the files on Windows; the OS temp cleaner will get them
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
