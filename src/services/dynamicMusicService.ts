import { Puzzle } from '../types/crossword';
import { getAnonymousUserId } from './apiClient';

function getRecentlyPlayedIds(): string[] {
  try {
    const raw = sessionStorage.getItem('spotyspice_recent_songs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordRecentlyPlayed(ids: string[]) {
  try {
    const recent = new Set([...getRecentlyPlayedIds(), ...ids]);
    sessionStorage.setItem('spotyspice_recent_songs', JSON.stringify([...recent].slice(-150)));
  } catch {
    // Session storage is optional; live generation remains server-authoritative.
  }
}

export const dynamicMusicService = {
  /**
   * Requests a fully constructed, Deezer-backed puzzle. There is intentionally
   * no client source selection or static-catalog fallback.
   */
  async generateLivePuzzle(
    genre = 'all',
    targetWords = 10,
    minFans = 250000,
  ): Promise<{ puzzle: Puzzle; livePuzzleToken: string }> {
    const response = await fetch('/api/puzzles/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getAnonymousUserId(),
      },
      body: JSON.stringify({
        genre,
        targetWords,
        minFans,
        recentIds: getRecentlyPlayedIds().slice(-50),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.puzzle || typeof data.livePuzzleToken !== 'string') {
      throw new Error(data.error || 'Unable to generate a live Deezer puzzle.');
    }

    recordRecentlyPlayed(
      data.puzzle.clues
        .map((clue: Puzzle['clues'][number]) => clue.song.providerTrackId || clue.song.id)
        .filter(Boolean),
    );
    return { puzzle: data.puzzle as Puzzle, livePuzzleToken: data.livePuzzleToken };
  },
};
