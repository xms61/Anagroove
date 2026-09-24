/**
 * User state store (progress, solved history, blacklist): SQLite at DATA_DIR/users.sqlite.
 * Opened lazily on first use; the old DATA_DIR/store.json is imported once on first open.
 */
import path from 'path';
import { DATA_DIR } from './paths.ts';
import { onShutdown } from './shutdown.ts';
import { lazySingleton } from './db/lazySingleton.ts';
import { UserStore } from './db/userStore.ts';

const { instance, peek } = lazySingleton(() => new UserStore(path.join(DATA_DIR, 'users.sqlite'), {
  legacyStorePath: path.join(DATA_DIR, 'store.json'),
}));

onShutdown('user-store', () => peek()?.flushSync());

export const db: UserStore = instance;
