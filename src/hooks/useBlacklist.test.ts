import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type BlacklistItem } from '../services/apiClient';
import { STORAGE_KEYS } from '../services/storage';
import { useBlacklist } from './useBlacklist';

vi.mock('../services/apiClient', () => ({
  apiClient: { getBlacklist: vi.fn(), addBlacklist: vi.fn(), removeBlacklist: vi.fn() },
}));

const api = vi.mocked(apiClient);
const item = (name: string, extra: Partial<BlacklistItem> = {}): BlacklistItem => ({
  id: `id-${name}`, name, type: 'artist', dateAdded: 1, ...extra,
});
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.localBlacklist) || 'null');

describe('useBlacklist', () => {
  beforeEach(() => {
    localStorage.clear();
    api.getBlacklist.mockReset();
    api.addBlacklist.mockReset();
    api.removeBlacklist.mockReset();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('starts from the local copy and replaces it with the server list', async () => {
    localStorage.setItem(STORAGE_KEYS.localBlacklist, JSON.stringify([item('Drake')]));
    api.getBlacklist.mockResolvedValue([item('Drake'), item('Queen')]);
    const { result } = renderHook(() => useBlacklist());
    expect(result.current.blacklist.map(b => b.name)).toEqual(['Drake']);
    await waitFor(() => expect(result.current.blacklist).toHaveLength(2));
    expect(stored().map((b: BlacklistItem) => b.name)).toEqual(['Drake', 'Queen']);
  });

  it('uploads local-only items before adopting the server list', async () => {
    localStorage.setItem(STORAGE_KEYS.localBlacklist, JSON.stringify([
      item('Offline Song', { type: 'song', provider: 'deezer', providerTrackId: '9' }),
    ]));
    api.getBlacklist
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([item('Offline Song', { type: 'song', provider: 'deezer', providerTrackId: '9' })]);
    api.addBlacklist.mockResolvedValue({ blacklist: [] });
    const { result } = renderHook(() => useBlacklist());
    await waitFor(() => expect(api.getBlacklist).toHaveBeenCalledTimes(2));
    expect(api.addBlacklist).toHaveBeenCalledWith({ name: 'Offline Song', type: 'song', provider: 'deezer', providerTrackId: '9' });
    await waitFor(() => expect(result.current.blacklist).toHaveLength(1));
  });

  it('ignores corrupt local storage', () => {
    localStorage.setItem(STORAGE_KEYS.localBlacklist, '{not json');
    api.getBlacklist.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBlacklist());
    expect(result.current.blacklist).toEqual([]);
  });

  it('adds a trimmed artist with provider ids and persists the result', async () => {
    api.getBlacklist.mockReturnValue(new Promise(() => {}));
    api.addBlacklist.mockResolvedValue({ blacklist: [item('Adele')] });
    const { result } = renderHook(() => useBlacklist());
    await act(() => result.current.addArtist({ artist: '  Adele ', provider: 'deezer', providerArtistId: '75798' }));
    expect(api.addBlacklist).toHaveBeenCalledWith({ name: 'Adele', type: 'artist', provider: 'deezer', providerArtistId: '75798' });
    expect(result.current.blacklist.map(b => b.name)).toEqual(['Adele']);
    expect(stored()).toHaveLength(1);
  });

  it('skips blank names and keeps the list when the server refuses', async () => {
    api.getBlacklist.mockReturnValue(new Promise(() => {}));
    api.addBlacklist.mockResolvedValue({ error: 'You can hide up to 500 artists and songs. Remove some to hide more.' });
    const { result } = renderHook(() => useBlacklist());
    await act(() => result.current.addSong('   '));
    expect(api.addBlacklist).not.toHaveBeenCalled();
    await act(() => result.current.addSong('Hello'));
    expect(window.alert).toHaveBeenCalledWith('You can hide up to 500 artists and songs. Remove some to hide more.');
    expect(result.current.blacklist).toEqual([]);
  });

  it('removes an item through the server', async () => {
    localStorage.setItem(STORAGE_KEYS.localBlacklist, JSON.stringify([item('Drake')]));
    api.getBlacklist.mockReturnValue(new Promise(() => {}));
    api.removeBlacklist.mockResolvedValue([]);
    const { result } = renderHook(() => useBlacklist());
    await act(() => result.current.removeItem('id-Drake'));
    expect(api.removeBlacklist).toHaveBeenCalledWith('id-Drake');
    expect(result.current.blacklist).toEqual([]);
    expect(stored()).toEqual([]);
  });
});
