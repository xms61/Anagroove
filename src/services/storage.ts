/**
 * Guarded browser storage. Storage can be blocked (privacy mode, disabled cookies) or hold
 * corrupt JSON; every access falls back instead of throwing, so the app keeps working with
 * in-memory state.
 */
export const STORAGE_KEYS = {
  settings: 'spotyspice_settings',
  activeGenre: 'spotyspice_active_genre',
  activeConfig: 'spotyspice_active_config',
  activeLivePuzzle: 'spotyspice_active_live_puzzle',
  recentSongs: 'spotyspice_recent_songs',
  playerName: 'spotyspice_player_name',
  localBlacklist: 'spotyspice_local_blacklist',
} as const;

function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readString(key: string, fallback = ''): string {
  try {
    return local()?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string): void {
  try {
    local()?.setItem(key, value);
  } catch {
    // Quota exceeded or storage blocked: keep going with in-memory state
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    // Unserializable value: nothing to store
  }
}
