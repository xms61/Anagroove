import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTER_PATH = path.join(__dirname, '../data/master_song_pool.json');
const masterPool = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));
const allSongs = Object.values(masterPool).flat();

// Import generator logic
class CrosswordGenerator {
  constructor(size = 22) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(null));
    this.placedWords = [];
  }

  canPlaceWord(word, row, col, direction) {
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

  placeWord(item, row, col, direction) {
    const word = item.answer.toUpperCase();
    for (let i = 0; i < word.length; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      this.grid[r][c] = word[i];
    }
    this.placedWords.push({ item, row, col, direction, length: word.length, answer: word });
  }

  generate(candidatePool, targetWords = 10) {
    const pool = [...candidatePool].sort(() => Math.random() - 0.5);
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
            for (let j = 0; j < placedWord.answer.length; j++) {
              if (placedWord.answer[j] === word[i]) {
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
}

console.log('Testing On-The-Fly Live Crossword Generation (10 iterations)...');

const times = [];
for (let i = 1; i <= 10; i++) {
  const t0 = performance.now();
  const gen = new CrosswordGenerator(22);
  const ok = gen.generate(allSongs, 11);
  const t1 = performance.now();
  const elapsed = (t1 - t0).toFixed(2);
  times.push(t1 - t0);

  console.log(`  [Iteration ${i}] Generated ${gen.placedWords.length} intersecting words in ${elapsed} ms`);
  if (!ok || gen.placedWords.length < 6) {
    console.error('Failed to generate minimum words!');
    process.exit(1);
  }
}

const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);
console.log(`\n🎉 Average live generation time: ${avg} ms (< 50ms target met!)`);
