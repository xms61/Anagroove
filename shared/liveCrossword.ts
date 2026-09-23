import { shuffleArray } from './shuffle.ts';
import type { CellData, Clue, Direction, Puzzle, Song } from './types.ts';

/** A catalog or provider song with its chosen answer and clue. */
export interface LiveSong extends Song {
  answer: string;
  clueType: string;
  clueText: string;
  releaseYear?: number | null;
}

export type Archetype = 'dense' | 'small' | 'standard';

export interface LiveCrosswordOptions {
  archetype?: Archetype;
  targetWords?: number;
  maxSmallBounds?: number;
  minAnswerLength?: number;
  maxAnswerLength?: number;
  trials?: number;
  trialsCount?: number;
}

type Grid = (string | null)[][];

interface PlacedWord {
  item: LiveSong;
  row: number;
  col: number;
  direction: Direction;
  length: number;
  answer: string;
  currentCrossings: number;
}

interface Placement {
  row: number;
  col: number;
  direction: Direction;
  intersections: number;
  crossedWords: PlacedWord[];
  score: number;
}

interface PlacementOptions {
  archetype?: Archetype;
  maxSmallBounds?: number;
}

function evaluatePlacement(grid: Grid, placedWords: PlacedWord[], word: string, row: number, col: number, direction: Direction, options: PlacementOptions = {}): Placement | null {
  const size = grid.length;
  const horizontal = direction === 'across';
  if (row < 0 || col < 0) return null;
  if ((horizontal && col + word.length > size) || (!horizontal && row + word.length > size)) return null;
  if (horizontal && ((col > 0 && grid[row][col - 1] !== null) || (col + word.length < size && grid[row][col + word.length] !== null))) return null;
  if (!horizontal && ((row > 0 && grid[row - 1][col] !== null) || (row + word.length < size && grid[row + word.length][col] !== null))) return null;

  let intersections = 0;
  const crossedWords: PlacedWord[] = [];

  for (let index = 0; index < word.length; index++) {
    const targetRow = horizontal ? row : row + index;
    const targetCol = horizontal ? col + index : col;
    const current = grid[targetRow][targetCol];
    if (current !== null) {
      if (current !== word[index]) return null;
      intersections++;
      const matchingWord = placedWords.find(pw => {
        if (pw.direction === direction) return false;
        if (pw.direction === 'across') {
          return pw.row === targetRow && targetCol >= pw.col && targetCol < pw.col + pw.length;
        } else {
          return pw.col === targetCol && targetRow >= pw.row && targetRow < pw.row + pw.length;
        }
      });
      if (matchingWord) {
        crossedWords.push(matchingWord);
      }
    } else if (
      (horizontal && ((targetRow > 0 && grid[targetRow - 1][targetCol] !== null) || (targetRow < size - 1 && grid[targetRow + 1][targetCol] !== null))) ||
      (!horizontal && ((targetCol > 0 && grid[targetRow][targetCol - 1] !== null) || (targetCol < size - 1 && grid[targetRow][targetCol + 1] !== null)))
    ) {
      return null;
    }
  }

  if (placedWords.length > 0 && intersections === 0) return null;

  // Crossword words cross 1-3 times each other (prevent solitary single-spines and over-saturation)
  if (intersections > 3) return null;

  // Ensure placing this word does not push any crossed word beyond 3 crossings
  for (const cw of crossedWords) {
    if (cw.currentCrossings >= 3) {
      return null;
    }
  }

  // Calculate bounding box if this word is placed
  let minRow = row;
  let maxRow = horizontal ? row : row + word.length - 1;
  let minCol = col;
  let maxCol = horizontal ? col + word.length - 1 : col;

  for (const pw of placedWords) {
    minRow = Math.min(minRow, pw.row);
    maxRow = Math.max(maxRow, pw.direction === 'down' ? pw.row + pw.length - 1 : pw.row);
    minCol = Math.min(minCol, pw.col);
    maxCol = Math.max(maxCol, pw.direction === 'across' ? pw.col + pw.length - 1 : pw.col);
  }

  const boundingArea = (maxRow - minRow + 1) * (maxCol - minCol + 1);
  const aspectPenalty = Math.abs((maxRow - minRow + 1) - (maxCol - minCol + 1)) * 3;

  if (options.archetype === 'small') {
    const maxSmall = options.maxSmallBounds || 9;
    if ((maxRow - minRow + 1) > maxSmall || (maxCol - minCol + 1) > maxSmall) {
      return null;
    }
  }

  // Placement scoring:
  // - High reward for 2 and 3 intersections (generates authentic lattice interlocking)
  // - Balance bonus: reward crossing words that currently have only 1 crossing to elevate them to 2
  let balanceBonus = 0;
  for (const cw of crossedWords) {
    if (cw.currentCrossings === 1) balanceBonus += 60;
    if (cw.currentCrossings === 2) balanceBonus += 40;
  }

  if (options.archetype === 'dense') {
    let denseScore = (intersections * 180) + (intersections === 2 ? 220 : 0) + (intersections === 3 ? 350 : 0);
    denseScore += balanceBonus - (boundingArea * 4) - (aspectPenalty * 1.5);
    return { row, col, direction, intersections, crossedWords, score: denseScore };
  }

  const score = (intersections * 100) + (intersections === 2 ? 140 : 0) + (intersections === 3 ? 200 : 0) + balanceBonus - boundingArea - aspectPenalty;

  return { row, col, direction, intersections, crossedWords, score };
}

function placeWord(grid: Grid, placedWords: PlacedWord[], item: LiveSong, row: number, col: number, direction: Direction, crossedWords: PlacedWord[] = []): void {
  const answer = item.answer.toUpperCase();
  for (let index = 0; index < answer.length; index++) {
    grid[direction === 'across' ? row : row + index][direction === 'across' ? col + index : col] = answer[index];
  }
  const newWord: PlacedWord = {
    item,
    row,
    col,
    direction,
    length: answer.length,
    answer,
    currentCrossings: crossedWords.length,
  };
  for (const cw of crossedWords) {
    cw.currentCrossings = (cw.currentCrossings || 0) + 1;
  }
  placedWords.push(newWord);
}

function createPuzzle(grid: Grid, placedWords: PlacedWord[], puzzleId: string, title: string, difficulty: string): Puzzle {
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
  const cellNumbers: (number | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  const clues: Clue[] = [];
  let number = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const across = adjusted.find(word => word.row === row && word.col === col && word.direction === 'across');
      const down = adjusted.find(word => word.row === row && word.col === col && word.direction === 'down');
      if (!across && !down) continue;
      const cellNumber = number++;
      cellNumbers[row][col] = cellNumber;

      for (const word of [across, down]) {
        if (!word) continue;
        const { item } = word;
        clues.push({
          id: `${cellNumber}${word.direction === 'across' ? 'A' : 'D'}`,
          number: cellNumber,
          direction: word.direction,
          row,
          col,
          length: word.length,
          answer: word.answer,
          crossings: word.currentCrossings,
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
            language: item.language,
            release_year: item.release_year || item.releaseYear,
            popularity: item.popularity !== undefined ? item.popularity : (item.selection?.rank || 50),
            animeTitle: item.animeTitle,
            themeSlug: item.themeSlug,
            themeType: item.themeType,
            isAnimeOped: item.isAnimeOped,
            imageUrl: item.imageUrl || item.albumArt,
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
    grid: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col): CellData => {
      const char = grid[row + minRow][col + minCol];
      return { row, col, char, isBlock: char === null, number: cellNumbers[row][col] };
    })),
    clues,
  };
}

/**
 * Builds one immutable puzzle from already-filtered provider tracks.
 * Actively optimizes word crossings (1 to 3 crossings each) and lattice variety
 * to produce engaging, organic, tightly woven crossword grids.
 */
export function generateLiveCrossword(
  songs: LiveSong[],
  title = '⚡ Live Crossword',
  targetWordsOrOptions: number | LiveCrosswordOptions = 10,
  moreOptions: LiveCrosswordOptions = {},
): Puzzle | null {
  // Called as (songs, title, options) or (songs, title, targetWords, options)
  const options = typeof targetWordsOrOptions === 'object' ? targetWordsOrOptions : moreOptions;
  let targetWords = typeof targetWordsOrOptions === 'object' ? (targetWordsOrOptions.targetWords || 10) : targetWordsOrOptions;
  const archetype = options.archetype || 'standard';
  const maxSmallBounds = options.maxSmallBounds || 9;
  const placementOpts = { archetype, maxSmallBounds };

  let eligible = (songs || []).filter(song => /^[A-Z0-9]{2,20}$/.test(song.answer || ''));
  if (archetype === 'small') {
    const maxLen = options.maxAnswerLength || 7;
    const minLen = options.minAnswerLength || 3;
    const shortEligible = eligible.filter(s => s.answer.length >= minLen && s.answer.length <= maxLen);
    if (shortEligible.length >= 5) {
      eligible = shortEligible;
    }
    targetWords = Math.min(targetWords, 7);
  }

  const requiredMin = archetype === 'small' ? 5 : 6;
  if (eligible.length < requiredMin) return null;

  let bestPuzzle: Puzzle | null = null;
  let bestTrialScore = -Infinity;
  const defaultTrials = archetype === 'dense' ? 300 : (archetype === 'small' ? 150 : 150);
  const trialsCount = options.trialsCount || options.trials || defaultTrials;

  for (let trial = 0; trial < trialsCount; trial++) {
    const size = archetype === 'small' ? 16 : 24;
    const grid: Grid = Array.from({ length: size }, () => Array(size).fill(null));
    const placedWords: PlacedWord[] = [];

    // Varied starter word seed across trials: mix top longest and randomized selection
    const pool = shuffleArray([...eligible]);
    if (trial % 2 === 0) {
      pool.sort((a, b) => b.answer.length - a.answer.length);
    }
    const firstIdx = Math.floor(Math.random() * Math.min(3, pool.length));
    const first = pool[firstIdx];
    const direction: Direction = Math.random() > 0.5 ? 'across' : 'down';
    placeWord(
      grid,
      placedWords,
      first,
      Math.floor((size - (direction === 'down' ? first.answer.length : 1)) / 2),
      Math.floor((size - (direction === 'across' ? first.answer.length : 1)) / 2),
      direction,
      []
    );

    const remaining = pool.filter(p => p.id !== first.id);

    for (let attempts = 0; attempts < 350 && placedWords.length < targetWords; attempts++) {
      const candidateList = shuffleArray(remaining.filter(item => !placedWords.some(pw => pw.item.id === item.id)));

      for (const item of candidateList) {
        const validPlacements: Placement[] = [];
        for (const existing of placedWords) {
          // If existing word already has 3 crossings, do not overload it
          if (existing.currentCrossings >= 3) continue;

          const targetDirection: Direction = existing.direction === 'across' ? 'down' : 'across';
          for (let itemIndex = 0; itemIndex < item.answer.length; itemIndex++) {
            for (let existingIndex = 0; existingIndex < existing.answer.length; existingIndex++) {
              if (item.answer[itemIndex] !== existing.answer[existingIndex]) continue;
              const row = existing.direction === 'across' ? existing.row - itemIndex : existing.row + existingIndex;
              const col = existing.direction === 'across' ? existing.col + existingIndex : existing.col - itemIndex;
              const evaluation = evaluatePlacement(grid, placedWords, item.answer, row, col, targetDirection, placementOpts);
              if (evaluation) {
                validPlacements.push(evaluation);
              }
            }
          }
        }

        if (validPlacements.length > 0) {
          // Sort placements: highest score (optimal crossings, balanced compact grid) first
          validPlacements.sort((a, b) => b.score - a.score);
          // Introduce slight temperature for placement diversity
          const pickIdx = (validPlacements.length > 1 && Math.random() < 0.2) ? 1 : 0;
          const chosen = validPlacements[pickIdx];
          placeWord(grid, placedWords, item, chosen.row, chosen.col, chosen.direction, chosen.crossedWords);
        }

        if (placedWords.length >= targetWords) break;
      }
    }

    const minWords = archetype === 'small' ? Math.min(5, targetWords, eligible.length) : Math.min(6, targetWords, eligible.length);
    if (placedWords.length >= minWords) {
      const crossingCounts = placedWords.map(w => w.currentCrossings);
      const count1 = crossingCounts.filter(c => c === 1).length;
      const count2 = crossingCounts.filter(c => c === 2).length;
      const count3 = crossingCounts.filter(c => c === 3).length;
      const countOver3 = crossingCounts.filter(c => c > 3).length;

      let minR = size, maxR = 0, minC = size, maxC = 0;
      for (const pw of placedWords) {
        minR = Math.min(minR, pw.row);
        maxR = Math.max(maxR, pw.direction === 'down' ? pw.row + pw.length - 1 : pw.row);
        minC = Math.min(minC, pw.col);
        maxC = Math.max(maxC, pw.direction === 'across' ? pw.col + pw.length - 1 : pw.col);
      }
      const currentRows = maxR - minR + 1;
      const currentCols = maxC - minC + 1;

      // Crossing variety distribution score:
      // Reward healthy, randomized mix of 1, 2, and 3 crossings
      let varietyScore = 0;
      if (count3 >= 1) varietyScore += 350; // words crossing 3 times
      if (count2 >= 2) varietyScore += 350; // words crossing 2 times
      if (count1 >= 1) varietyScore += 150; // words crossing 1 time
      if (count1 > 0 && count2 > 0 && count3 > 0) varietyScore += 500; // diverse lattice
      if (countOver3 > 0) varietyScore -= 2000; // strict penalty for > 3 crossings

      // Penalize comb layouts where over half of words cross only once
      const oneRatio = count1 / placedWords.length;
      if (oneRatio > 0.5) {
        varietyScore -= (oneRatio - 0.5) * 800;
      }

      let trialScore = (placedWords.length * 1200) + varietyScore - (currentRows * currentCols * 3) - Math.abs(currentRows - currentCols) * 25;

      if (archetype === 'dense') {
        const totalLetters = placedWords.reduce((sum, w) => sum + w.length, 0);
        const density = totalLetters / (currentRows * currentCols);
        let densityBonus = 0;
        if (density >= 0.35) densityBonus += 1200;
        else if (density >= 0.28) densityBonus += 600;
        trialScore = (placedWords.length * 1500) + (varietyScore * 1.5) + densityBonus - (currentRows * currentCols * 5) - Math.abs(currentRows - currentCols) * 35;
      } else if (archetype === 'small') {
        if (currentRows <= maxSmallBounds && currentCols <= maxSmallBounds) {
          trialScore += 2500 - (currentRows * currentCols * 10);
        } else {
          trialScore -= 5000;
        }
      }

      if (trialScore > bestTrialScore) {
        bestTrialScore = trialScore;
        bestPuzzle = createPuzzle(grid, placedWords, `live-${Date.now()}`, title, 'Dynamic');
      }
    }
  }

  return bestPuzzle;
}

