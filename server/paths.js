import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runtime data directory for the user store and SQLite catalogs.
 * Override with SPOTYSPICE_DATA_DIR (the test runner points it at a temp dir
 * so tests never touch the real store.json or catalog.sqlite).
 */
export const DATA_DIR = process.env.SPOTYSPICE_DATA_DIR
  ? path.resolve(process.env.SPOTYSPICE_DATA_DIR)
  : path.resolve(__dirname, 'data');
