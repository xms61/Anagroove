import type { Puzzle } from '../src/types/crossword';

export interface LiveSong {
  id: string;
  provider?: string;
  providerTrackId?: string;
  providerArtistId?: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  audioUrl: string;
  providerUrl?: string;
  selection?: {
    source: string;
    rank: number;
    artistFans: number;
  };
  answer: string;
  clueType: string;
  clueText: string;
}

export declare function generateLiveCrossword(
  songs: LiveSong[],
  title?: string,
  targetWords?: number
): Puzzle | null;
