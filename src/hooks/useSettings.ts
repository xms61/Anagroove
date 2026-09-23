import { useCallback, useState } from 'react';
import { readJson, STORAGE_KEYS, writeJson } from '../services/storage';

export interface Settings {
  /** Celebrate solved words with a cell animation. */
  enableWordAnimations: boolean;
  /** Preview volume, 0-1. */
  defaultVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enableWordAnimations: true,
  defaultVolume: 0.15,
};

/** Stored settings merged over the defaults; unknown or mistyped fields are ignored. */
export function readSettings(): Settings {
  const stored = readJson<Partial<Settings>>(STORAGE_KEYS.settings, {});
  return {
    enableWordAnimations: typeof stored.enableWordAnimations === 'boolean' ? stored.enableWordAnimations : DEFAULT_SETTINGS.enableWordAnimations,
    defaultVolume: typeof stored.defaultVolume === 'number' && stored.defaultVolume >= 0 && stored.defaultVolume <= 1
      ? stored.defaultVolume
      : DEFAULT_SETTINGS.defaultVolume,
  };
}

/** Single source of truth for user settings, persisted to localStorage (guarded). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      writeJson(STORAGE_KEYS.settings, next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
