import { CellValidity } from '../../shared/types';

/**
 * The anonymous user id doubles as a bearer secret for progress/blacklist data,
 * so it is generated from the CSPRNG (getRandomValues also works on plain-http LAN hosts).
 */
function randomId(prefix: string): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const idCache = new Map<string, string>();

function readOrCreateId(getStorage: () => Storage, key: string, prefix: string): string {
  const cached = idCache.get(key);
  if (cached) return cached;
  let id = '';
  try {
    const storage = getStorage();
    id = storage.getItem(key) || '';
    if (!id) {
      id = randomId(prefix);
      storage.setItem(key, id);
    }
  } catch {
    // Storage blocked (privacy mode): keep one id for this page load
    id = id || randomId(prefix);
  }
  idCache.set(key, id);
  return id;
}

export function getAnonymousUserId(): string {
  return readOrCreateId(() => localStorage, 'spotyspice_user_id', 'anon_');
}

export function getMultiplayerPlayerId(): string {
  return readOrCreateId(() => sessionStorage, 'spotyspice_mp_player_id', 'player_');
}

const headers = () => ({
  'Content-Type': 'application/json',
  'X-User-Id': getAnonymousUserId(),
});

export interface SavedProgress {
  puzzleId: string;
  themeId: string;
  userLetters: string[][];
  validity: CellValidity[][];
  updatedAt: number;
}

export interface SolvedRecord {
  puzzleId: string;
  title: string;
  cluesCount: number;
  timeSeconds: number;
  solvedAt: number;
}

export interface BlacklistItem {
  id: string;
  name: string;
  type: 'artist' | 'song';
  canonicalKey?: string;
  provider?: string;
  providerArtistId?: string;
  providerTrackId?: string;
  dateAdded: number;
}

export type BlacklistTarget = Omit<BlacklistItem, 'id' | 'dateAdded' | 'canonicalKey'>;

export const apiClient = {
  async getProgress(): Promise<SavedProgress | null> {
    try {
      const res = await fetch('/api/progress', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        return data.progress || null;
      }
    } catch (err) {
      console.warn('Could not fetch server progress:', err);
    }
    return null;
  },

  async saveProgress(
    puzzleId: string,
    themeId: string,
    userLetters: string[][],
    validity: CellValidity[][]
  ): Promise<boolean> {
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ puzzleId, themeId, userLetters, validity }),
      });
      return res.ok;
    } catch (err) {
      console.warn('Could not save progress to server:', err);
      return false;
    }
  },

  async recordSolved(
    puzzleId: string,
    title: string,
    cluesCount: number,
    timeSeconds = 0
  ): Promise<SolvedRecord[]> {
    try {
      const res = await fetch('/api/history/solved', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ puzzleId, title, cluesCount, timeSeconds }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.history || [];
      }
    } catch (err) {
      console.warn('Could not record solved puzzle to server:', err);
    }
    return [];
  },

  async getSolvedHistory(): Promise<SolvedRecord[]> {
    try {
      const res = await fetch('/api/history', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        return data.history || [];
      }
    } catch (err) {
      console.warn('Could not fetch solved history:', err);
    }
    return [];
  },

  async getBlacklist(): Promise<BlacklistItem[] | null> {
    try {
      const res = await fetch('/api/blacklist', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        return data.blacklist || [];
      }
    } catch (err) {
      console.warn('Could not fetch blacklist from server:', err);
    }
    return null;
  },

  async addBlacklist(target: BlacklistTarget): Promise<BlacklistItem[] | null> {
    try {
      const res = await fetch('/api/blacklist', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(target),
      });
      if (res.ok) {
        const data = await res.json();
        return data.blacklist || [];
      }
    } catch (err) {
      console.warn('Could not add to blacklist on server:', err);
    }
    return null;
  },

  async removeBlacklist(id: string): Promise<BlacklistItem[] | null> {
    try {
      const res = await fetch(`/api/blacklist/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        return data.blacklist || [];
      }
    } catch (err) {
      console.warn('Could not remove blacklist item on server:', err);
    }
    return null;
  },
};
