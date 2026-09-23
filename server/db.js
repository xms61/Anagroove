/**
 * User state store (progress, solved history, blacklist): SQLite at DATA_DIR/users.sqlite.
 * Opened lazily on first use; the old DATA_DIR/store.json is imported once on first open.
 */
import path from 'path';
import { DATA_DIR } from './paths.js';
import { onShutdown } from './shutdown.js';
import { lazySingleton } from './db/lazySingleton.js';
import { UserStore } from './db/userStore.js';

const { instance, peek } = lazySingleton(() => new UserStore(path.join(DATA_DIR, 'users.sqlite'), {
  legacyStorePath: path.join(DATA_DIR, 'store.json'),
}));

onShutdown('user-store', () => peek()?.flushSync());

/** @type {UserStore} */
export const db = instance;
