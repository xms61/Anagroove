import fs from 'fs';
import path from 'path';
import { blacklistIdentityKey, canonicalArtistKey, canonicalTrackKey } from '../shared/musicIdentity.js';
import { DATA_DIR } from './paths.js';
import { onShutdown } from './shutdown.js';

const STORE_FILE = path.join(DATA_DIR, 'store.json');
const TEMP_FILE = path.join(DATA_DIR, 'store.json.tmp');
const BACKUP_FILE = path.join(DATA_DIR, 'store.json.bak');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache synced to disk
let store = {
  users: {}
};

// Safe load with automatic backup fallback
function loadStore() {
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.users === 'object') {
        store = parsed;
        // Keep backup in sync on successful load
        try {
          fs.copyFileSync(STORE_FILE, BACKUP_FILE);
        } catch {
          // Non-fatal if backup copy fails
        }
        return;
      }
    } catch (err) {
      console.error('⚠️ Error reading store.json, attempting recovery from backup:', err.message);
    }
  }

  // Attempt backup recovery
  if (fs.existsSync(BACKUP_FILE)) {
    try {
      const backupRaw = fs.readFileSync(BACKUP_FILE, 'utf-8');
      const backupParsed = JSON.parse(backupRaw);
      if (backupParsed && typeof backupParsed.users === 'object') {
        store = backupParsed;
        console.log('✅ Successfully recovered database store from store.json.bak');
        saveStoreAtomicSync();
        return;
      }
    } catch (err) {
      console.error('⚠️ Backup store.json.bak was also corrupt:', err.message);
    }
  }

  // Initialize fresh store
  store = { users: {} };
  saveStoreAtomicSync();
}

/**
 * Atomically writes store data to disk via temp file + atomic swap
 */
function saveStoreAtomicSync() {
  try {
    const data = JSON.stringify(store, null, 2);
    fs.writeFileSync(TEMP_FILE, data, 'utf-8');

    // Create backup of existing file before replacing
    if (fs.existsSync(STORE_FILE)) {
      try {
        fs.copyFileSync(STORE_FILE, BACKUP_FILE);
      } catch {
        // Non-fatal
      }
    }

    // Atomic replace
    try {
      fs.renameSync(TEMP_FILE, STORE_FILE);
    } catch {
      // Fallback for Windows cross-volume or file lock issues
      fs.copyFileSync(TEMP_FILE, STORE_FILE);
      if (fs.existsSync(TEMP_FILE)) {
        fs.unlinkSync(TEMP_FILE);
      }
    }
  } catch (err) {
    console.error('❌ Error in atomic store write:', err.message);
  }
}

loadStore();

let saveTimeout = null;
function persistStore() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveStoreAtomicSync();
    saveTimeout = null;
  }, 150);
}

// Synchronously flush on exit to guarantee zero data loss
function flushSync() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  saveStoreAtomicSync();
}

onShutdown('user-store', flushSync);

export const db = {
  flushSync,

  /**
   * Read-only lookup. Never creates a user, so reads with random ids cannot grow the store.
   */
  findUser(userId) {
    if (!userId) return null;
    return store.users[String(userId).slice(0, 64)] || null;
  },

  /** Returns the user, creating it on first write. */
  getUser(userId) {
    if (!userId) return null;
    const sanitizedId = String(userId).slice(0, 64);
    if (!store.users[sanitizedId]) {
      store.users[sanitizedId] = {
        userId: sanitizedId,
        createdAt: Date.now(),
        lastActive: Date.now(),
        activeProgress: null,
        solvedHistory: [],
        blacklist: []
      };
      persistStore();
    } else {
      store.users[sanitizedId].lastActive = Date.now();
    }
    return store.users[sanitizedId];
  },

  saveProgress(userId, progressData) {
    const user = this.getUser(userId);
    if (!user) return null;
    user.activeProgress = {
      ...progressData,
      updatedAt: Date.now()
    };
    persistStore();
    return user.activeProgress;
  },

  getProgress(userId) {
    const user = this.findUser(userId);
    return user ? user.activeProgress : null;
  },

  recordSolvedPuzzle(userId, solvedItem) {
    const user = this.getUser(userId);
    if (!user) return [];
    if (!user.solvedHistory.some(s => s.puzzleId === solvedItem.puzzleId)) {
      user.solvedHistory.push({
        ...solvedItem,
        solvedAt: Date.now()
      });
      // Clear active progress if matching this puzzle
      if (user.activeProgress?.puzzleId === solvedItem.puzzleId) {
        user.activeProgress = null;
      }
      persistStore();
    }
    return user.solvedHistory;
  },

  getSolvedHistory(userId) {
    const user = this.findUser(userId);
    return user ? user.solvedHistory || [] : [];
  },

  getBlacklist(userId) {
    const user = this.findUser(userId);
    return user
      ? (user.blacklist || []).map(item => ({
        ...item,
        canonicalKey: item.canonicalKey || (item.type === 'artist'
          ? canonicalArtistKey(item.name)
          : canonicalTrackKey(item.name)),
      }))
      : [];
  },

  addBlacklistItem(userId, item) {
    const user = this.getUser(userId);
    if (!user) return [];
    const trimmedName = String(item.name).trim();
    const canonicalKey = item.type === 'artist'
      ? canonicalArtistKey(trimmedName)
      : canonicalTrackKey(trimmedName);
    const identityKey = blacklistIdentityKey({ ...item, canonicalKey });
    const hasSameItem = user.blacklist.some(b =>
      b.type === item.type && blacklistIdentityKey(b) === identityKey
    );
    if (!hasSameItem) {
      user.blacklist.push({
        id: item.id || `bl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        type: item.type, // 'artist' | 'song'
        canonicalKey,
        ...(item.provider ? { provider: item.provider } : {}),
        ...(item.type === 'artist' && item.providerArtistId ? { providerArtistId: item.providerArtistId } : {}),
        ...(item.type === 'song' && item.providerTrackId ? { providerTrackId: item.providerTrackId } : {}),
        dateAdded: Date.now()
      });
      persistStore();
    }
    return user.blacklist;
  },

  removeBlacklistItem(userId, itemId) {
    const user = this.findUser(userId);
    if (!user) return [];
    const before = user.blacklist.length;
    user.blacklist = user.blacklist.filter(b => b.id !== itemId);
    if (user.blacklist.length !== before) persistStore();
    return user.blacklist;
  }
};
