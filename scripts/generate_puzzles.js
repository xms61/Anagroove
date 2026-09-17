import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shuffleArray } from '../shared/shuffle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUSIC_POOL_PATH = path.join(__dirname, '../data/music_pool.json');
const OUTPUT_PUZZLES_PATH = path.join(__dirname, '../src/data/puzzles.json');

// Ensure destination directory exists
fs.mkdirSync(path.dirname(OUTPUT_PUZZLES_PATH), { recursive: true });

const musicPool = JSON.parse(fs.readFileSync(MUSIC_POOL_PATH, 'utf-8'));

/**
 * Crossword generator algorithm
 * - Places words onto an N x M grid
 * - Validates crossword rules: intersections must match letter, no illegal adjacent run-ons
 * - Denser crossword: aims for 10 to 16+ intersecting words
 */
class CrosswordGenerator {
  constructor(size = 15) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(null));
    this.placedWords = [];
  }

  // Clone grid state for backtracking/trial
  cloneGrid() {
    return this.grid.map(row => [...row]);
  }

  canPlaceWord(word, row, col, direction) {
    const len = word.length;
    if (direction === 'across') {
      if (col + len > this.size) return false;
      // Cell immediately before and after must be empty
      if (col > 0 && this.grid[row][col - 1] !== null) return false;
      if (col + len < this.size && this.grid[row][col + len] !== null) return false;

      let intersections = 0;
      for (let i = 0; i < len; i++) {
        const c = col + i;
        const current = this.grid[row][c];
        if (current !== null) {
          if (current !== word[i]) return false; // conflict!
          intersections++;
        } else {
          // If placing in an empty cell, orthogonal neighbors (above/below) must be empty
          // unless they are part of an intersecting word
          if (row > 0 && this.grid[row - 1][c] !== null) return false;
          if (row < this.size - 1 && this.grid[row + 1][c] !== null) return false;
        }
      }
      return intersections > 0 || this.placedWords.length === 0;
    } else {
      // Down direction
      if (row + len > this.size) return false;
      // Cell immediately before and after must be empty
      if (row > 0 && this.grid[row - 1][col] !== null) return false;
      if (row + len < this.size && this.grid[row + len][col] !== null) return false;

      let intersections = 0;
      for (let i = 0; i < len; i++) {
        const r = row + i;
        const current = this.grid[r][col];
        if (current !== null) {
          if (current !== word[i]) return false; // conflict!
          intersections++;
        } else {
          // Orthogonal neighbors (left/right) must be empty
          if (col > 0 && this.grid[r][col - 1] !== null) return false;
          if (col < this.size - 1 && this.grid[r][col + 1] !== null) return false;
        }
      }
      return intersections > 0 || this.placedWords.length === 0;
    }
  }

  placeWord(item, row, col, direction) {
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
      answer: word
    });
  }

  generate(candidatePool, targetWordCount = 12) {
    // Shuffle pool with bias toward longer words first for rich interconnectivity
    const pool = shuffleArray(candidatePool);
    pool.sort((a, b) => b.answer.length - a.answer.length);

    // Place the first anchor word near the middle
    const first = pool[0];
    const firstDir = Math.random() > 0.5 ? 'across' : 'down';
    const firstWord = first.answer.toUpperCase();
    const startRow = Math.floor((this.size - (firstDir === 'down' ? firstWord.length : 1)) / 2);
    const startCol = Math.floor((this.size - (firstDir === 'across' ? firstWord.length : 1)) / 2);

    this.placeWord(first, startRow, startCol, firstDir);

    const remaining = pool.slice(1);

    // Try placing subsequent words
    for (let attempts = 0; attempts < 300 && this.placedWords.length < targetWordCount; attempts++) {
      for (const item of remaining) {
        if (this.placedWords.some(p => p.item.id === item.id)) continue;
        const word = item.answer.toUpperCase();

        // Find intersecting possibilities with already placed words
        let placed = false;
        for (const placedWord of this.placedWords) {
          const targetDir = placedWord.direction === 'across' ? 'down' : 'across';

          for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            for (let j = 0; j < placedWord.answer.length; j++) {
              if (placedWord.answer[j] === letter) {
                // Potential intersection!
                const r = placedWord.direction === 'across'
                  ? placedWord.row - i
                  : placedWord.row + j;
                const c = placedWord.direction === 'across'
                  ? placedWord.col + j
                  : placedWord.col - i;

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

        if (this.placedWords.length >= targetWordCount) break;
      }
    }

    return this.placedWords.length >= 8;
  }

  // Trim grid to bounding box of placed words with 1-cell border
  getBoundingBox() {
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
    return { minR, maxR, minC, maxC };
  }

  exportPuzzle(puzzleId, title, difficulty = "Medium") {
    const { minR, maxR, minC, maxC } = this.getBoundingBox();
    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;

    // Shift coordinates to trimmed box
    const adjustedPlaced = this.placedWords.map(p => ({
      ...p,
      row: p.row - minR,
      col: p.col - minC
    }));

    // Standard crossword numbering: scan row by row, col by col
    let currentNumber = 1;
    const cellNumbers = Array.from({ length: rows }, () => Array(cols).fill(null));
    const clues = [];

    // Sort starts by row, then col
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const startsAcross = adjustedPlaced.find(p => p.row === r && p.col === c && p.direction === 'across');
        const startsDown = adjustedPlaced.find(p => p.row === r && p.col === c && p.direction === 'down');

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
              }
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
              }
            });
          }
        }
      }
    }

    // Build final grid matrix
    const gridData = Array.from({ length: rows }, (_, r) => {
      return Array.from({ length: cols }, (_, c) => {
        const char = this.grid[r + minR][c + minC];
        return {
          row: r,
          col: c,
          char: char, // will be used to validate, empty if null
          isBlock: char === null,
          number: cellNumbers[r][c]
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
      clues
    };
  }
}

// Generate multiple puzzles with dense word sets (10-14+ words each)
const puzzles = [];
const configs = [
  { id: 'puzzle-1', title: 'Global Hits & Pop Icons', targetWords: 12 },
  { id: 'puzzle-2', title: 'Chart Toppers & Rewinds', targetWords: 11 },
  { id: 'puzzle-3', title: 'Acoustic & Electric Grooves', targetWords: 13 }
];

console.log('Generating randomized crosswords from music pool...');

for (const cfg of configs) {
  let success = false;
  let attempts = 0;
  while (!success && attempts < 50) {
    attempts++;
    const gen = new CrosswordGenerator(22);
    if (gen.generate(musicPool, cfg.targetWords)) {
      const puzzle = gen.exportPuzzle(cfg.id, cfg.title);
      puzzles.push(puzzle);
      console.log(`Generated ${cfg.title} (${puzzle.clues.length} clues, ${puzzle.rows}x${puzzle.cols} grid) in attempt ${attempts}`);
      success = true;
    }
  }
}

fs.writeFileSync(OUTPUT_PUZZLES_PATH, JSON.stringify(puzzles, null, 2), 'utf-8');
console.log(`Successfully generated ${puzzles.length} crosswords into ${OUTPUT_PUZZLES_PATH}`);
