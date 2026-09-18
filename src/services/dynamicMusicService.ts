import { Puzzle } from '../types/crossword';
import { getAnonymousUserId } from './apiClient';

function canonicalArtistKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getRecentlyPlayedIds(): string[] {
  try {
    const raw = localStorage.getItem('spotyspice_recent_songs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordRecentlyPlayed(ids: string[], artists: string[] = []) {
  try {
    const artistKeys = artists.map(a => `artist:${canonicalArtistKey(a)}`).filter(k => k.length > 7);
    const recent = new Set([...getRecentlyPlayedIds(), ...ids, ...artistKeys]);
    localStorage.setItem('spotyspice_recent_songs', JSON.stringify([...recent].slice(-500)));
  } catch {
    // Local storage is optional; live generation remains server-authoritative.
  }
}

export interface LivePuzzleOptions {
  genre?: string;
  targetWords?: number;
  minFans?: number;
  prompt?: string;
  artist?: string;
  album?: string;
  decade?: string;
  popularity?: 'pure' | 'obscure' | 'indie' | 'balanced' | 'mainstream';
  seed?: string | number;
}

export const dynamicMusicService = {
  /**
   * Requests a fully constructed, live-backed crossword puzzle with optional steering.
   */
  async generateLivePuzzle(
    genreOrOptions: string | LivePuzzleOptions = 'all',
    targetWords = 10,
    minFans = 250000,
  ): Promise<{ puzzle: Puzzle; livePuzzleToken: string }> {
    const opts: LivePuzzleOptions = typeof genreOrOptions === 'object' && genreOrOptions !== null
      ? genreOrOptions
      : { genre: genreOrOptions, targetWords, minFans };

    const payload = {
      genre: opts.genre || 'all',
      targetWords: opts.targetWords || 10,
      minFans: opts.minFans !== undefined ? opts.minFans : 250000,
      prompt: opts.prompt || undefined,
      artist: opts.artist || undefined,
      album: opts.album || undefined,
      decade: opts.decade || undefined,
      popularity: opts.popularity || undefined,
      seed: opts.seed || undefined,
      recentIds: getRecentlyPlayedIds().slice(-300),
    };

    const response = await fetch('/api/puzzles/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getAnonymousUserId(),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.puzzle || typeof data.livePuzzleToken !== 'string') {
      throw new Error(data.error || 'Unable to generate a live puzzle.');
    }

    recordRecentlyPlayed(
      data.puzzle.clues
        .map((clue: Puzzle['clues'][number]) => clue.song.providerTrackId || clue.song.id)
        .filter(Boolean),
      data.puzzle.clues
        .map((clue: Puzzle['clues'][number]) => clue.song.artist)
        .filter(Boolean),
    );
    return { puzzle: data.puzzle as Puzzle, livePuzzleToken: data.livePuzzleToken };
  },
};
