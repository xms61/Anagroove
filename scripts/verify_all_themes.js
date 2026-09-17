import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../src/data/themes_catalog.json');
const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
const catalog = JSON.parse(raw);

console.log(`Verifying Themes Catalog with ${catalog.themes.length} categories...`);

let totalPuzzles = 0;
let totalErrors = 0;

for (const theme of catalog.themes) {
  console.log(`\nChecking Theme: ${theme.name} (${theme.icon}) - ${theme.puzzles.length} puzzles`);

  if (theme.puzzles.length !== 20) {
    console.error(`  [FAIL] Expected 20 puzzles for ${theme.name}, found ${theme.puzzles.length}`);
    totalErrors++;
  }

  for (const puzzle of theme.puzzles) {
    totalPuzzles++;

    if (!puzzle.clues || puzzle.clues.length < 5) {
      console.error(`  [FAIL] Clue count too low in ${puzzle.id}: ${puzzle.clues?.length}`);
      totalErrors++;
    }

    for (const clue of puzzle.clues) {
      const { direction, row, col, length, answer, song } = clue;

      if (!answer || answer.length !== length) {
        console.error(`  [FAIL] Length mismatch for clue ${clue.id} in ${puzzle.id}`);
        totalErrors++;
      }

      if (!song?.title || !song?.artist) {
        console.error(`  [FAIL] Missing song metadata for clue ${clue.id}`);
        totalErrors++;
      }

      for (let i = 0; i < length; i++) {
        const r = direction === 'across' ? row : row + i;
        const c = direction === 'across' ? col + i : col;
        const cell = puzzle.grid[r]?.[c];

        if (!cell || cell.isBlock || cell.char !== answer[i]) {
          console.error(`  [FAIL] Grid mismatch at (${r},${c}) for ${clue.id} in ${puzzle.id}`);
          totalErrors++;
        }
      }
    }
  }

  console.log(`  [PASS] All 20 puzzles in ${theme.name} passed consistency check.`);
}

console.log(`\n========================================`);
console.log(`Verified ${totalPuzzles} puzzles across ${catalog.themes.length} categories.`);
if (totalErrors === 0) {
  console.log(`🎉 100% OF ALL 220 PUZZLES ARE VALID & READY TO PLAY!`);
  process.exit(0);
} else {
  console.error(`❌ Found ${totalErrors} errors.`);
  process.exit(1);
}
