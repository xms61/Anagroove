import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache synced to disk
let store = {
  users: {}
};

if (fs.existsSync(STORE_FILE)) {
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error loading store.json, initializing fresh store:', err);
  }
}

let saveTimeout = null;
function persistStore() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8', (err) => {
      if (err) console.error('Error persisting store.json:', err);
    });
  }, 200);
}

export const db = {
  getUser(userId) {
    if (!userId) return null;
    if (!store.users[userId]) {
      store.users[userId] = {
        userId,
        createdAt: Date.now(),
        lastActive: Date.now(),
        activeProgress: null,
        solvedHistory: [],
        blacklist: []
      };
      persistStore();
    } else {
      store.users[userId].lastActive = Date.now();
    }
    return store.users[userId];
  },

  saveProgress(userId, progressData) {
    const user = this.getUser(userId);
    user.activeProgress = {
      ...progressData,
      updatedAt: Date.now()
    };
    persistStore();
    return user.activeProgress;
  },

  getProgress(userId) {
    const user = this.getUser(userId);
    return user.activeProgress;
  },

  recordSolvedPuzzle(userId, solvedItem) {
    const user = this.getUser(userId);
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
    const user = this.getUser(userId);
    return user.solvedHistory || [];
  },

  getBlacklist(userId) {
    const user = this.getUser(userId);
    return user.blacklist || [];
  },

  addBlacklistItem(userId, item) {
    const user = this.getUser(userId);
    if (!user.blacklist.some(b => b.name.toLowerCase() === item.name.toLowerCase() && b.type === item.type)) {
      user.blacklist.push({
        id: item.id || `bl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.name.trim(),
        type: item.type, // 'artist' | 'song'
        dateAdded: Date.now()
      });
      persistStore();
    }
    return user.blacklist;
  },

  removeBlacklistItem(userId, itemId) {
    const user = this.getUser(userId);
    user.blacklist = user.blacklist.filter(b => b.id !== itemId && b.name.toLowerCase() !== itemId.toLowerCase());
    persistStore();
    return user.blacklist;
  }
};
