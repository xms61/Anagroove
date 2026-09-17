import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shuffleArray } from '../shared/shuffle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTER_PATH = path.join(__dirname, '../data/master_song_pool.json');
const OUTPUT_CATALOG_PATH = path.join(__dirname, '../src/data/themes_catalog.json');

fs.mkdirSync(path.dirname(OUTPUT_CATALOG_PATH), { recursive: true });

const masterPool = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));

// All songs flattened into a giant pool for the Mixed category
const allSongs = Object.values(masterPool).flat();

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
    this.placedWords.push({
      item,
      row,
      col,
      direction,
      length: word.length,
      answer: word
    });
  }

  generate(candidatePool, targetWords = 10) {
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

        if (this.placedWords.length >= targetWords) break;
      }
    }

    return this.placedWords.length >= Math.min(6, candidatePool.length);
  }

  exportPuzzle(puzzleId, title, difficulty = "Medium") {
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
      col: p.col - minC
    }));

    let currentNumber = 1;
    const cellNumbers = Array.from({ length: rows }, () => Array(cols).fill(null));
    const clues = [];

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

    const gridData = Array.from({ length: rows }, (_, r) => {
      return Array.from({ length: cols }, (_, c) => {
        const char = this.grid[r + minR][c + minC];
        return {
          row: r,
          col: c,
          char: char,
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

const THEME_CONFIGS = [
  { id: 'mixed', name: 'Mixed & Eclectic', icon: '🎲', description: 'Cross-genre blend of all musical styles!', pool: allSongs },
  { id: 'kpop', name: 'K-Pop Universe', icon: '🌸', description: 'BTS, BLACKPINK, NewJeans, TWICE & more', pool: masterPool.kpop },
  { id: 'anime', name: 'Anime & J-Rock', icon: '⚔️', description: 'Demon Slayer, Attack on Titan, Naruto & more', pool: masterPool.anime },
  { id: 'gaming', name: 'Video Game OSTs', icon: '🎮', description: 'Super Mario, Zelda, Minecraft, Undertale & more', pool: masterPool.gaming },
  { id: 'pop', name: 'Global Pop Hits', icon: '✨', description: 'Taylor Swift, Olivia Rodrigo, The Weeknd & more', pool: masterPool.pop },
  { id: 'rock', name: 'Rock & Retro Legends', icon: '🎸', description: 'Queen, Nirvana, AC/DC, Guns N\' Roses & more', pool: masterPool.rock },
  { id: 'hiphop', name: 'Hip-Hop & Rap Giants', icon: '🎤', description: 'Eminem, Kendrick Lamar, Drake, 50 Cent & more', pool: masterPool.hiphop },
  { id: 'edm', name: 'EDM & Dance Anthems', icon: '🎧', description: 'Avicii, Daft Punk, David Guetta, Calvin Harris & more', pool: masterPool.edm },
  { id: 'cinematic', name: 'Cinematic Movie OSTs', icon: '🎬', description: 'Hans Zimmer, Star Wars, Pirates, Gladiator & more', pool: masterPool.cinematic },
  { id: 'latin', name: 'Latin & Reggaeton', icon: '🔥', description: 'Bad Bunny, Daddy Yankee, Shakira, Luis Fonsi & more', pool: masterPool.latin },
  { id: 'poppunk', name: '2000s Pop-Punk & Emo', icon: '🖤', description: 'Green Day, Blink-182, Paramore, My Chemical Romance', pool: masterPool.poppunk }
];

console.log('Generating 20 unique crosswords for each of the 11 themes (220 total)...');

const catalog = {
  themes: []
};

for (const theme of THEME_CONFIGS) {
  console.log(`\nGenerating Theme: ${theme.name} (${theme.icon})...`);
  const puzzles = [];

  for (let i = 1; i <= 20; i++) {
    let success = false;
    let attempts = 0;
    while (!success && attempts < 40) {
      attempts++;
      const gen = new CrosswordGenerator(22);
      // For mixed, target 11-13 words; for genres, target 7-10 words
      const target = theme.id === 'mixed' ? 11 : Math.min(8, theme.pool.length);
      if (gen.generate(theme.pool, target)) {
        const puzzle = gen.exportPuzzle(
          `${theme.id}-puzzle-${i}`,
          `${theme.name} #${i}`,
          i > 15 ? 'Expert' : i > 8 ? 'Medium' : 'Casual'
        );
        puzzles.push(puzzle);
        success = true;
      }
    }
  }

  console.log(`  -> Generated ${puzzles.length} crosswords for ${theme.name}`);
  catalog.themes.push({
    id: theme.id,
    name: theme.name,
    icon: theme.icon,
    description: theme.description,
    puzzles
  });
}

fs.writeFileSync(OUTPUT_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
console.log(`\n🎉 Successfully generated all 220 crosswords into ${OUTPUT_CATALOG_PATH}`);
