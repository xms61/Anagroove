/** Puzzle types shared by the server (which builds puzzles) and the client (which renders them). */
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
  animeTitle?: string;
  themeSlug?: string;
  themeType?: string;
  isAnimeOped?: boolean;
  imageUrl?: string;
  language?: string;
  release_year?: number | null;
  popularity?: number;
  selection?: {
    source: string;
    rank: number;
    artistFans: number;
  };
}

export interface Clue {
  /** Number and direction, e.g. "3A" or "5D". */
  id: string;
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  answer: string;
  crossings?: number;
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

export type CellValidity = 'untested' | 'correct' | 'wrong';

export interface HintAction {
  type: 'letter' | 'word' | 'puzzle';
}
