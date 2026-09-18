export type Direction = 'across' | 'down';

export interface Song {
  id: string;
  provider?: string;
  providerTrackId?: string;
  providerArtistId?: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  audioUrl: string;
  spotifyUrl?: string;
  providerUrl?: string;
  selection?: {
    source: string;
    rank: number;
    artistFans: number;
  };
}

export interface Clue {
  id: string; // e.g. "3A", "5D"
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  answer: string;
  clueType: string;
  clueText: string;
  song: Song;
}

export interface CellData {
  row: number;
  col: number;
  char: string | null;
  isBlock: boolean;
  number: number | null;
}

export interface Puzzle {
  id: string;
  title: string;
  difficulty: string;
  rows: number;
  cols: number;
  grid: CellData[][];
  clues: Clue[];
}

export interface ThemeCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  puzzles: Puzzle[];
}

export interface ThemesCatalog {
  themes: ThemeCategory[];
}

export type CellValidity = 'untested' | 'correct' | 'wrong';

export interface HintAction {
  type: 'letter' | 'word' | 'puzzle';
}
