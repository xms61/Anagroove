import { useState, useEffect, useCallback } from 'react';
import { apiClient, BlacklistItem } from '../services/apiClient';
import { Song } from '../types/crossword';
import { blacklistIdentityKey, canonicalMusicKey } from '../../shared/musicIdentity';

const LOCAL_STORAGE_KEY = 'spotyspice_local_blacklist';

export function useBlacklist() {
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
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
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(migrated));
            }
          });
          return;
        }
        setBlacklist(serverList);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverList));
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
    const updated = await apiClient.addBlacklist(target);
    if (!updated) {
      alert('Could not save your blacklist change. Live puzzles were not changed.');
      return;
    }
    setBlacklist(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
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
    const updated = await apiClient.addBlacklist(target);
    if (!updated) {
      alert('Could not save your blacklist change. Live puzzles were not changed.');
      return;
    }
    setBlacklist(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const removeItem = useCallback(async (idOrName: string) => {
    const updated = await apiClient.removeBlacklist(idOrName);
    if (!updated) {
      alert('Could not remove this blacklist item. Live puzzles were not changed.');
      return;
    }
    setBlacklist(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const isBlacklisted = useCallback((songTitle: string, artistName: string) => {
    const titleKey = canonicalMusicKey(songTitle);
    const artistKey = canonicalMusicKey(artistName);
    return blacklist.some(b => {
      const blacklistKey = b.canonicalKey || canonicalMusicKey(b.name);
      return b.type === 'artist'
        ? artistKey === blacklistKey || artistKey.includes(blacklistKey)
        : titleKey === blacklistKey || titleKey.includes(blacklistKey);
    });
  }, [blacklist]);

  return {
    blacklist,
    addArtist,
    addSong,
    removeItem,
    isBlacklisted,
  };
}
