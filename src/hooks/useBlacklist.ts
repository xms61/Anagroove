import { useState, useEffect, useCallback } from 'react';
import { apiClient, BlacklistItem } from '../services/apiClient';

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
      if (serverList && serverList.length > 0) {
        setBlacklist(serverList);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverList));
      }
    });
  }, []);

  const addArtist = useCallback(async (artistName: string) => {
    const trimmed = artistName.trim();
    if (!trimmed) return;

    const updated = await apiClient.addBlacklist(trimmed, 'artist');
    if (updated.length > 0) {
      setBlacklist(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } else {
      setBlacklist(prev => {
        if (prev.some(b => b.name.toLowerCase() === trimmed.toLowerCase() && b.type === 'artist')) return prev;
        const next = [...prev, { id: `bl-${Date.now()}`, name: trimmed, type: 'artist' as const, dateAdded: Date.now() }];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, []);

  const addSong = useCallback(async (songTitle: string) => {
    const trimmed = songTitle.trim();
    if (!trimmed) return;

    const updated = await apiClient.addBlacklist(trimmed, 'song');
    if (updated.length > 0) {
      setBlacklist(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } else {
      setBlacklist(prev => {
        if (prev.some(b => b.name.toLowerCase() === trimmed.toLowerCase() && b.type === 'song')) return prev;
        const next = [...prev, { id: `bl-${Date.now()}`, name: trimmed, type: 'song' as const, dateAdded: Date.now() }];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, []);

  const removeItem = useCallback(async (idOrName: string) => {
    const updated = await apiClient.removeBlacklist(idOrName);
    if (updated) {
      setBlacklist(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } else {
      setBlacklist(prev => {
        const next = prev.filter(b => b.id !== idOrName && b.name.toLowerCase() !== idOrName.toLowerCase());
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, []);

  const isBlacklisted = useCallback((songTitle: string, artistName: string) => {
    const lowerT = songTitle.toLowerCase();
    const lowerA = artistName.toLowerCase();
    return blacklist.some(b => {
      const blName = b.name.toLowerCase();
      if (b.type === 'artist') return lowerA.includes(blName);
      if (b.type === 'song') return lowerT.includes(blName);
      return lowerT.includes(blName) || lowerA.includes(blName);
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
