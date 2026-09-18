import { CellValidity } from '../types/crossword';

export function getAnonymousUserId(): string {
  let id = localStorage.getItem('spotyspice_user_id');
  if (!id) {
    id = 'anon_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    localStorage.setItem('spotyspice_user_id', id);
  }
  return id;
}

export function getMultiplayerPlayerId(): string {
  let id = sessionStorage.getItem('spotyspice_mp_player_id');
  if (!id) {
    id = 'player_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    sessionStorage.setItem('spotyspice_mp_player_id', id);
  }
  return id;
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
