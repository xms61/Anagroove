import type { CellData, Clue, Puzzle, Song } from '../../shared/types';

const song = (title: string): Song => ({
  id: `test:${title}`,
  title,
  artist: 'Test Artist',
  album: 'Test Album',
  albumArt: '',
  audioUrl: '',
});

/**
 * 3x3 puzzle:
 *   C A T     1-Across CAT
 *   O # #     1-Down   COW
 *   W # #
 */
export function makePuzzle(id = 'puzzle-1'): Puzzle {
  const layout = ['CAT', 'O##', 'W##'];
  const grid: CellData[][] = layout.map((line, row) =>
    [...line].map((char, col) => ({
      row,
      col,
      char: char === '#' ? null : char,
      isBlock: char === '#',
      number: row === 0 && col === 0 ? 1 : null,
    }))
  );
  const clues: Clue[] = [
    { id: '1A', number: 1, direction: 'across', row: 0, col: 0, length: 3, answer: 'CAT', clueType: 'title', clueText: 'Feline', song: song('Cat') },
    { id: '1D', number: 1, direction: 'down', row: 0, col: 0, length: 3, answer: 'COW', clueType: 'title', clueText: 'Bovine', song: song('Cow') },
  ];
  return { id, title: 'Test Puzzle', difficulty: 'easy', rows: 3, cols: 3, grid, clues };
}
