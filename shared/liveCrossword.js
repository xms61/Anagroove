import { shuffleArray } from './shuffle.js';

function canPlaceWord(grid, placedWords, word, row, col, direction) {
  const size = grid.length;
  const horizontal = direction === 'across';
  if ((horizontal && col + word.length > size) || (!horizontal && row + word.length > size)) return false;
  if (horizontal && ((col > 0 && grid[row][col - 1] !== null) || (col + word.length < size && grid[row][col + word.length] !== null))) return false;
  if (!horizontal && ((row > 0 && grid[row - 1][col] !== null) || (row + word.length < size && grid[row + word.length][col] !== null))) return false;

  let intersections = 0;
  for (let index = 0; index < word.length; index++) {
    const targetRow = horizontal ? row : row + index;
    const targetCol = horizontal ? col + index : col;
    const current = grid[targetRow][targetCol];
    if (current !== null) {
      if (current !== word[index]) return false;
      intersections++;
    } else if (
      (horizontal && ((targetRow > 0 && grid[targetRow - 1][targetCol] !== null) || (targetRow < size - 1 && grid[targetRow + 1][targetCol] !== null))) ||
      (!horizontal && ((targetCol > 0 && grid[targetRow][targetCol - 1] !== null) || (targetCol < size - 1 && grid[targetRow][targetCol + 1] !== null)))
    ) {
      return false;
    }
  }
  return intersections > 0 || placedWords.length === 0;
}

function placeWord(grid, placedWords, item, row, col, direction) {
  const answer = item.answer.toUpperCase();
  for (let index = 0; index < answer.length; index++) {
    grid[direction === 'across' ? row : row + index][direction === 'across' ? col + index : col] = answer[index];
  }
  placedWords.push({ item, row, col, direction, length: answer.length, answer });
}

function createPuzzle(grid, placedWords, puzzleId, title, difficulty) {
  let minRow = grid.length;
  let maxRow = 0;
  let minCol = grid.length;
  let maxCol = 0;
  grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (value !== null) {
      minRow = Math.min(minRow, rowIndex);
      maxRow = Math.max(maxRow, rowIndex);
      minCol = Math.min(minCol, colIndex);
      maxCol = Math.max(maxCol, colIndex);
    }
  }));

  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  const adjusted = placedWords.map(word => ({ ...word, row: word.row - minRow, col: word.col - minCol }));
  const cellNumbers = Array.from({ length: rows }, () => Array(cols).fill(null));
  const clues = [];
  let number = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const across = adjusted.find(word => word.row === row && word.col === col && word.direction === 'across');
      const down = adjusted.find(word => word.row === row && word.col === col && word.direction === 'down');
      if (!across && !down) continue;
      cellNumbers[row][col] = number++;

      for (const word of [across, down]) {
        if (!word) continue;
        const { item } = word;
        clues.push({
          id: `${cellNumbers[row][col]}${word.direction === 'across' ? 'A' : 'D'}`,
          number: cellNumbers[row][col],
          direction: word.direction,
          row,
          col,
          length: word.length,
          answer: word.answer,
          clueType: item.clueType,
          clueText: item.clueText,
          song: {
            id: item.id,
            provider: item.provider,
            providerTrackId: item.providerTrackId,
            providerArtistId: item.providerArtistId,
            title: item.title,
            artist: item.artist,
            album: item.album,
            albumArt: item.albumArt,
            audioUrl: item.audioUrl,
            providerUrl: item.providerUrl,
            selection: item.selection,
          },
        });
      }
    }
  }

  return {
    id: puzzleId,
    title,
    difficulty,
    rows,
    cols,
    grid: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
      const char = grid[row + minRow][col + minCol];
      return { row, col, char, isBlock: char === null, number: cellNumbers[row][col] };
    })),
    clues,
  };
}

/**
 * Builds one immutable puzzle from already-filtered provider tracks.
 */
export function generateLiveCrossword(songs, title = '⚡ Live Crossword', targetWords = 10) {
  const eligible = (songs || []).filter(song => /^[A-Z0-9]{3,20}$/.test(song.answer || ''));
  if (eligible.length < 6) return null;

  for (let trial = 0; trial < 25; trial++) {
    const size = 22;
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const placedWords = [];
    const pool = shuffleArray(eligible).sort((a, b) => b.answer.length - a.answer.length);
    const first = pool[0];
    const direction = Math.random() > 0.5 ? 'across' : 'down';
    placeWord(
      grid,
      placedWords,
      first,
      Math.floor((size - (direction === 'down' ? first.answer.length : 1)) / 2),
      Math.floor((size - (direction === 'across' ? first.answer.length : 1)) / 2),
      direction,
    );

    for (let attempts = 0; attempts < 250 && placedWords.length < targetWords; attempts++) {
      for (const item of pool.slice(1)) {
        if (placedWords.some(word => word.item.id === item.id)) continue;
        let placed = false;
        for (const existing of placedWords) {
          const targetDirection = existing.direction === 'across' ? 'down' : 'across';
          for (let itemIndex = 0; itemIndex < item.answer.length && !placed; itemIndex++) {
            for (let existingIndex = 0; existingIndex < existing.answer.length; existingIndex++) {
              if (item.answer[itemIndex] !== existing.answer[existingIndex]) continue;
              const row = existing.direction === 'across' ? existing.row - itemIndex : existing.row + existingIndex;
              const col = existing.direction === 'across' ? existing.col + existingIndex : existing.col - itemIndex;
              if (row >= 0 && col >= 0 && canPlaceWord(grid, placedWords, item.answer, row, col, targetDirection)) {
                placeWord(grid, placedWords, item, row, col, targetDirection);
                placed = true;
                break;
              }
            }
          }
          if (placed) break;
        }
        if (placedWords.length >= targetWords) break;
      }
    }

    if (placedWords.length >= Math.min(6, targetWords, eligible.length)) {
      return createPuzzle(grid, placedWords, `live-${Date.now()}`, title, 'Dynamic');
    }
  }
  return null;
}
