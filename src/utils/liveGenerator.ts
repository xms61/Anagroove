import { Puzzle, Clue, CellData } from '../types/crossword';
import { shuffleArray } from '../../shared/shuffle';

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  audioUrl: string;
  spotifyUrl: string;
  answer: string;
  clueType: string;
  clueText: string;
}

interface PlacedWord {
  item: SongItem;
  row: number;
  col: number;
  direction: 'across' | 'down';
  length: number;
  answer: string;
}

export class LiveCrosswordGenerator {
  private size: number;
  private grid: (string | null)[][];
  private placedWords: PlacedWord[];

  constructor(size = 22) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(null));
    this.placedWords = [];
  }

  private canPlaceWord(word: string, row: number, col: number, direction: 'across' | 'down'): boolean {
    const len = word.length;
    if (direction === 'across') {
      if (col + len > this.size) return false;
      if (col > 0 && this.grid[row][col - 1] !== null) return false;
      if (col + len < this.size && this.grid[row][col + len] !== null) return false;

      let intersections = 0;
      for (let i = 0; i < len; i++) {
        const c = col + i;
        const current = this.grid[row][c];
        if (current !== null) {
          if (current !== word[i]) return false;
          intersections++;
        } else {
          if (row > 0 && this.grid[row - 1][c] !== null) return false;
          if (row < this.size - 1 && this.grid[row + 1][c] !== null) return false;
        }
      }
      return intersections > 0 || this.placedWords.length === 0;
    } else {
      if (row + len > this.size) return false;
      if (row > 0 && this.grid[row - 1][col] !== null) return false;
      if (row + len < this.size && this.grid[row + len][col] !== null) return false;

      let intersections = 0;
      for (let i = 0; i < len; i++) {
        const r = row + i;
        const current = this.grid[r][col];
        if (current !== null) {
          if (current !== word[i]) return false;
          intersections++;
        } else {
          if (col > 0 && this.grid[r][col - 1] !== null) return false;
          if (col < this.size - 1 && this.grid[r][col + 1] !== null) return false;
        }
      }
      return intersections > 0 || this.placedWords.length === 0;
    }
  }

  private placeWord(item: SongItem, row: number, col: number, direction: 'across' | 'down') {
    const word = item.answer.toUpperCase();
    for (let i = 0; i < word.length; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      this.grid[r][c] = word[i];
    }
    this.placedWords.push({
      item,
      row,
      col,
      direction,
      length: word.length,
      answer: word,
    });
  }

  public generate(candidatePool: SongItem[], targetWords = 10): boolean {
    if (candidatePool.length < 5) return false;

    const pool = shuffleArray(candidatePool);
    pool.sort((a, b) => b.answer.length - a.answer.length);

    const first = pool[0];
    const firstDir = Math.random() > 0.5 ? 'across' : 'down';
    const firstWord = first.answer.toUpperCase();
    const startRow = Math.floor((this.size - (firstDir === 'down' ? firstWord.length : 1)) / 2);
    const startCol = Math.floor((this.size - (firstDir === 'across' ? firstWord.length : 1)) / 2);

    this.placeWord(first, startRow, startCol, firstDir);

    const remaining = pool.slice(1);

    for (let attempts = 0; attempts < 250 && this.placedWords.length < targetWords; attempts++) {
      for (const item of remaining) {
        if (this.placedWords.some(p => p.item.id === item.id)) continue;
        const word = item.answer.toUpperCase();

        let placed = false;
        for (const placedWord of this.placedWords) {
          const targetDir = placedWord.direction === 'across' ? 'down' : 'across';

          for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            for (let j = 0; j < placedWord.answer.length; j++) {
              if (placedWord.answer[j] === letter) {
                const r = placedWord.direction === 'across' ? placedWord.row - i : placedWord.row + j;
                const c = placedWord.direction === 'across' ? placedWord.col + j : placedWord.col - i;

                if (r >= 0 && c >= 0 && this.canPlaceWord(word, r, c, targetDir)) {
                  this.placeWord(item, r, c, targetDir);
                  placed = true;
                  break;
                }
              }
            }
            if (placed) break;
          }
          if (placed) break;
        }

        if (this.placedWords.length >= targetWords) break;
      }
    }

    return this.placedWords.length >= Math.min(6, candidatePool.length);
  }

  public exportPuzzle(puzzleId: string, title: string, difficulty = 'Dynamic'): Puzzle {
    let minR = this.size, maxR = 0, minC = this.size, maxC = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] !== null) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;

    const adjusted = this.placedWords.map(p => ({
      ...p,
      row: p.row - minR,
      col: p.col - minC,
    }));

    let currentNumber = 1;
    const cellNumbers: (number | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const clues: Clue[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const startsAcross = adjusted.find(p => p.row === r && p.col === c && p.direction === 'across');
        const startsDown = adjusted.find(p => p.row === r && p.col === c && p.direction === 'down');

        if (startsAcross || startsDown) {
          const num = currentNumber++;
          cellNumbers[r][c] = num;

          if (startsAcross) {
            clues.push({
              id: `${num}A`,
              number: num,
              direction: 'across',
              row: r,
              col: c,
              length: startsAcross.length,
              answer: startsAcross.answer,
              clueType: startsAcross.item.clueType,
              clueText: startsAcross.item.clueText,
              song: {
                id: startsAcross.item.id,
                title: startsAcross.item.title,
                artist: startsAcross.item.artist,
                album: startsAcross.item.album,
                albumArt: startsAcross.item.albumArt,
                audioUrl: startsAcross.item.audioUrl,
                spotifyUrl: startsAcross.item.spotifyUrl,
              },
            });
          }

          if (startsDown) {
            clues.push({
              id: `${num}D`,
              number: num,
              direction: 'down',
              row: r,
              col: c,
              length: startsDown.length,
              answer: startsDown.answer,
              clueType: startsDown.item.clueType,
              clueText: startsDown.item.clueText,
              song: {
                id: startsDown.item.id,
                title: startsDown.item.title,
                artist: startsDown.item.artist,
                album: startsDown.item.album,
                albumArt: startsDown.item.albumArt,
                audioUrl: startsDown.item.audioUrl,
                spotifyUrl: startsDown.item.spotifyUrl,
              },
            });
          }
        }
      }
    }

    const gridData: CellData[][] = Array.from({ length: rows }, (_, r) => {
      return Array.from({ length: cols }, (_, c) => {
        const char = this.grid[r + minR][c + minC];
        return {
          row: r,
          col: c,
          char: char,
          isBlock: char === null,
          number: cellNumbers[r][c],
        };
      });
    });

    return {
      id: puzzleId,
      title,
      difficulty,
      rows,
      cols,
      grid: gridData,
      clues,
    };
  }
}

/**
 * Convenience helper to generate a crossword on-the-fly in milliseconds.
 */
export function generateLiveCrossword(
  songs: SongItem[],
  title = '⚡ Live Crossword',
  targetWords = 10
): Puzzle | null {
  for (let trial = 0; trial < 25; trial++) {
    const gen = new LiveCrosswordGenerator(22);
    if (gen.generate(songs, targetWords)) {
      return gen.exportPuzzle(`live-${Date.now()}`, title);
    }
  }
  return null;
}
