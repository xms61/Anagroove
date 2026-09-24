import { useState, useEffect, useCallback } from 'react';
import { apiClient, BlacklistItem } from '../services/apiClient';
import { Song } from '../../shared/types';
import { blacklistIdentityKey } from '../../shared/musicIdentity';
import { readJson, STORAGE_KEYS, writeJson } from '../services/storage';

const LOCAL_STORAGE_KEY = STORAGE_KEYS.localBlacklist;

export function useBlacklist() {
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>(() => {
    const stored = readJson<BlacklistItem[]>(LOCAL_STORAGE_KEY, []);
    return Array.isArray(stored) ? stored : [];
  });

  // Sync from server on mount
  useEffect(() => {
    apiClient.getBlacklist().then(serverList => {
      if (serverList) {
        const serverKeys = new Set(serverList.map(blacklistIdentityKey));
        const localOnly = blacklist.filter(item => !serverKeys.has(blacklistIdentityKey(item)));
        if (localOnly.length > 0) {
          Promise.all(localOnly.map(item => apiClient.addBlacklist({
            name: item.name,
            type: item.type,
            ...(item.provider ? { provider: item.provider } : {}),
            ...(item.providerArtistId ? { providerArtistId: item.providerArtistId } : {}),
            ...(item.providerTrackId ? { providerTrackId: item.providerTrackId } : {}),
          }))).then(() => apiClient.getBlacklist()).then(migrated => {
            if (migrated) {
              setBlacklist(migrated);
              writeJson(LOCAL_STORAGE_KEY, (migrated));
            }
          });
          return;
        }
        setBlacklist(serverList);
        writeJson(LOCAL_STORAGE_KEY, (serverList));
      }
    });
  }, []);

  const addArtist = useCallback(async (artist: Pick<Song, 'artist' | 'provider' | 'providerArtistId'> | string) => {
    const artistName = typeof artist === 'string' ? artist : artist.artist;
    const trimmed = artistName.trim();
    if (!trimmed) return;

    const target = {
      name: trimmed,
      type: 'artist' as const,
      ...(typeof artist !== 'string' && artist.provider ? { provider: artist.provider } : {}),
      ...(typeof artist !== 'string' && artist.providerArtistId ? { providerArtistId: artist.providerArtistId } : {}),
    };
    const saved = await apiClient.addBlacklist(target);
    if ('error' in saved) {
      alert(saved.error);
      return;
    }
    setBlacklist(saved.blacklist);
    writeJson(LOCAL_STORAGE_KEY, saved.blacklist);
  }, []);

  const addSong = useCallback(async (song: Pick<Song, 'title' | 'provider' | 'providerTrackId'> | string) => {
    const songTitle = typeof song === 'string' ? song : song.title;
    const trimmed = songTitle.trim();
    if (!trimmed) return;

    const target = {
      name: trimmed,
      type: 'song' as const,
      ...(typeof song !== 'string' && song.provider ? { provider: song.provider } : {}),
      ...(typeof song !== 'string' && song.providerTrackId ? { providerTrackId: song.providerTrackId } : {}),
    };
    const saved = await apiClient.addBlacklist(target);
    if ('error' in saved) {
      alert(saved.error);
      return;
    }
    setBlacklist(saved.blacklist);
    writeJson(LOCAL_STORAGE_KEY, saved.blacklist);
  }, []);

  const removeItem = useCallback(async (idOrName: string) => {
    const updated = await apiClient.removeBlacklist(idOrName);
    if (!updated) {
      alert('Could not remove this blacklist item. Live puzzles were not changed.');
      return;
    }
    setBlacklist(updated);
    writeJson(LOCAL_STORAGE_KEY, (updated));
  }, []);

  return {
    blacklist,
    addArtist,
    addSong,
    removeItem,
  };
}
