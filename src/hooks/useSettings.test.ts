import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../services/storage';
import { DEFAULT_THEME } from '../themes';
import { readSettings, useSettings } from './useSettings';

const store = (value: unknown) => localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(value));

describe('settings theme', () => {
  beforeEach(() => localStorage.clear());

  it('reads a stored theme', () => {
    store({ theme: 'berlin' });
    expect(readSettings().theme).toBe('berlin');
  });

  it('falls back to the default theme for unknown or corrupt values', () => {
    store({ theme: 'latin' });
    expect(readSettings().theme).toBe(DEFAULT_THEME);
    localStorage.setItem(STORAGE_KEYS.settings, '{not json');
    expect(readSettings().theme).toBe(DEFAULT_THEME);
  });

  it('persists a theme change next to the other settings', () => {
    store({ defaultVolume: 0.4 });
    const { result } = renderHook(() => useSettings());
    act(() => result.current.updateSettings({ theme: 'vinyl' }));
    expect(result.current.settings.theme).toBe('vinyl');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}')).toMatchObject({ theme: 'vinyl', defaultVolume: 0.4 });
  });
});
