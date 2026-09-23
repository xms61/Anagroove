/**
 * Per-user state in SQLite (users.sqlite): active progress, solved history and blacklist.
 * Replaces the old JSON store (store.json), which is imported once on first open and then
 * no longer read. Every write is its own transaction, so there is nothing to flush on exit.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { blacklistIdentityKey, canonicalArtistKey, canonicalTrackKey } from '../../shared/musicIdentity.js';
import { logger } from '../logger.js';

const USER_ID_MAX = 64;

const MIGRATIONS = [
  (db) => db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL
    );
    CREATE TABLE progress (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      puzzle_id TEXT,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE solved_history (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      puzzle_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      solved_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, puzzle_id)
    );
    CREATE TABLE blacklist (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('artist', 'song')),
      name TEXT NOT NULL,
      identity_key TEXT NOT NULL,
      provider TEXT,
      provider_artist_id TEXT,
      provider_track_id TEXT,
      date_added INTEGER NOT NULL,
      PRIMARY KEY (user_id, id),
      UNIQUE (user_id, type, identity_key)
    );
    CREATE INDEX idx_history_user ON solved_history(user_id, solved_at);
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `),
];

const sanitizeUserId = (userId) => (userId ? String(userId).slice(0, USER_ID_MAX) : null);

function canonicalBlacklistKey(type, name) {
  return type === 'artist' ? canonicalArtistKey(name) : canonicalTrackKey(name);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export class UserStore {
  /**
   * @param {string} dbPath SQLite file (or ':memory:')
   * @param {{ legacyStorePath?: string|null }} [options] JSON store to import on first open
   */
  constructor(dbPath, { legacyStorePath = null } = {}) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this._migrate();
    this._prepare();
    if (legacyStorePath) this.importLegacyStore(legacyStorePath);
  }

  _migrate() {
    const version = Number(this.db.prepare('PRAGMA user_version').get().user_version) || 0;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        MIGRATIONS[v](this.db);
        this.db.exec(`PRAGMA user_version = ${v + 1};`);
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
    }
  }

  _prepare() {
    const db = this.db;
    this.stmt = {
      findUser: db.prepare('SELECT id, created_at, last_active FROM users WHERE id = ?'),
      upsertUser: db.prepare(`
        INSERT INTO users (id, created_at, last_active) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET last_active = excluded.last_active
      `),
      getProgress: db.prepare('SELECT data_json FROM progress WHERE user_id = ?'),
      setProgress: db.prepare(`
        INSERT INTO progress (user_id, puzzle_id, data_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET puzzle_id = excluded.puzzle_id, data_json = excluded.data_json, updated_at = excluded.updated_at
      `),
      clearProgressFor: db.prepare('DELETE FROM progress WHERE user_id = ? AND puzzle_id = ?'),
      getHistory: db.prepare('SELECT data_json FROM solved_history WHERE user_id = ? ORDER BY solved_at, rowid'),
      addHistory: db.prepare('INSERT OR IGNORE INTO solved_history (user_id, puzzle_id, data_json, solved_at) VALUES (?, ?, ?, ?)'),
      getBlacklist: db.prepare('SELECT * FROM blacklist WHERE user_id = ? ORDER BY date_added, rowid'),
      addBlacklist: db.prepare(`
        INSERT OR IGNORE INTO blacklist (user_id, id, type, name, identity_key, provider, provider_artist_id, provider_track_id, date_added)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      removeBlacklist: db.prepare('DELETE FROM blacklist WHERE user_id = ? AND id = ?'),
      getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    };
  }

  _transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /** Read-only lookup. Never creates a user, so reads with random ids cannot grow the store. */
  findUser(userId) {
    const id = sanitizeUserId(userId);
    if (!id) return null;
    const row = this.stmt.findUser.get(id);
    return row ? { userId: row.id, createdAt: row.created_at, lastActive: row.last_active } : null;
  }

  /** Creates the user on first write and refreshes lastActive. */
  _touchUser(id, now = Date.now()) {
    this.stmt.upsertUser.run(id, now, now);
  }

  saveProgress(userId, progressData) {
    const id = sanitizeUserId(userId);
    if (!id) return null;
    const progress = { ...progressData, updatedAt: Date.now() };
    this._transaction(() => {
      this._touchUser(id);
      this.stmt.setProgress.run(id, progress.puzzleId ?? null, JSON.stringify(progress), progress.updatedAt);
    });
    return progress;
  }

  getProgress(userId) {
    const id = sanitizeUserId(userId);
    const row = id ? this.stmt.getProgress.get(id) : null;
    return row ? parseJson(row.data_json, null) : null;
  }

  recordSolvedPuzzle(userId, solvedItem) {
    const id = sanitizeUserId(userId);
    if (!id) return [];
    this._transaction(() => {
      this._touchUser(id);
      const solvedAt = Date.now();
      const inserted = this.stmt.addHistory.run(id, String(solvedItem.puzzleId), JSON.stringify({ ...solvedItem, solvedAt }), solvedAt).changes;
      // Solving a puzzle clears the saved progress for it
      if (inserted) this.stmt.clearProgressFor.run(id, String(solvedItem.puzzleId));
    });
    return this.getSolvedHistory(id);
  }

  getSolvedHistory(userId) {
    const id = sanitizeUserId(userId);
    if (!id) return [];
    return this.stmt.getHistory.all(id).map(row => parseJson(row.data_json, null)).filter(Boolean);
  }

  getBlacklist(userId) {
    const id = sanitizeUserId(userId);
    if (!id) return [];
    return this.stmt.getBlacklist.all(id).map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      // Recomputed from the name so keys stay current when normalization rules change
      canonicalKey: canonicalBlacklistKey(row.type, row.name),
      ...(row.provider ? { provider: row.provider } : {}),
      ...(row.provider_artist_id ? { providerArtistId: row.provider_artist_id } : {}),
      ...(row.provider_track_id ? { providerTrackId: row.provider_track_id } : {}),
      dateAdded: row.date_added,
    }));
  }

  _insertBlacklistItem(id, item, dateAdded = Date.now()) {
    const name = String(item.name).trim();
    const canonicalKey = canonicalBlacklistKey(item.type, name);
    const providerArtistId = item.type === 'artist' && item.providerArtistId ? String(item.providerArtistId) : null;
    const providerTrackId = item.type === 'song' && item.providerTrackId ? String(item.providerTrackId) : null;
    const identityKey = blacklistIdentityKey({ ...item, name, canonicalKey, providerArtistId, providerTrackId });
    return this.stmt.addBlacklist.run(
      id,
      String(item.id || `bl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).slice(0, 100),
      item.type,
      name,
      identityKey,
      item.provider || null,
      providerArtistId,
      providerTrackId,
      dateAdded
    ).changes;
  }

  addBlacklistItem(userId, item) {
    const id = sanitizeUserId(userId);
    if (!id) return [];
    this._transaction(() => {
      this._touchUser(id);
      this._insertBlacklistItem(id, item);
    });
    return this.getBlacklist(id);
  }

  removeBlacklistItem(userId, itemId) {
    const id = sanitizeUserId(userId);
    if (!id) return [];
    this.stmt.removeBlacklist.run(id, String(itemId));
    return this.getBlacklist(id);
  }

  /** Nothing is buffered; kept so shutdown hooks and tests can force a WAL checkpoint. */
  flushSync() {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  }

  close() {
    this.db.close();
  }

  /**
   * One-time import of the old JSON store (falls back to its .bak copy). Recorded in `meta`,
   * so later starts skip it; the JSON file is left untouched.
   * @returns {{ imported: boolean, users: number, history: number, blacklist: number, progress: number }}
   */
  importLegacyStore(storePath) {
    const summary = { imported: false, users: 0, history: 0, blacklist: 0, progress: 0 };
    if (this.stmt.getMeta.get('legacy_store_imported')) return summary;

    let legacy = null;
    for (const candidate of [storePath, `${storePath}.bak`]) {
      if (!fs.existsSync(candidate)) continue;
      const parsed = parseJson(fs.readFileSync(candidate, 'utf-8'), null);
      if (parsed && typeof parsed.users === 'object') {
        legacy = parsed;
        break;
      }
      logger.warn('user_store', `Skipping unreadable legacy store ${candidate}`);
    }

    this._transaction(() => {
      for (const raw of Object.values(legacy?.users || {})) {
        const id = sanitizeUserId(raw?.userId);
        if (!id) continue;
        const createdAt = Number(raw.createdAt) || Date.now();
        this.stmt.upsertUser.run(id, createdAt, Number(raw.lastActive) || createdAt);
        summary.users++;

        if (raw.activeProgress && typeof raw.activeProgress === 'object') {
          const updatedAt = Number(raw.activeProgress.updatedAt) || createdAt;
          this.stmt.setProgress.run(id, raw.activeProgress.puzzleId ?? null, JSON.stringify(raw.activeProgress), updatedAt);
          summary.progress++;
        }
        for (const solved of Array.isArray(raw.solvedHistory) ? raw.solvedHistory : []) {
          if (!solved?.puzzleId) continue;
          const solvedAt = Number(solved.solvedAt) || createdAt;
          summary.history += this.stmt.addHistory.run(id, String(solved.puzzleId), JSON.stringify(solved), solvedAt).changes;
        }
        for (const item of Array.isArray(raw.blacklist) ? raw.blacklist : []) {
          if (!item?.name || !['artist', 'song'].includes(item.type)) continue;
          summary.blacklist += this._insertBlacklistItem(id, item, Number(item.dateAdded) || createdAt);
        }
      }
      this.stmt.setMeta.run('legacy_store_imported', JSON.stringify({ at: new Date().toISOString(), from: legacy ? storePath : null, ...summary }));
    });

    summary.imported = Boolean(legacy);
    if (legacy) {
      logger.info('user_store', `Imported ${summary.users} users, ${summary.history} solved puzzles, ${summary.blacklist} blacklist items from ${storePath}`);
    }
    return summary;
  }
}
