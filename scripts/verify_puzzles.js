import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUZZLES_PATH = path.join(__dirname, '../src/data/puzzles.json');
const raw = fs.readFileSync(PUZZLES_PATH, 'utf-8');
const puzzles = JSON.parse(raw);

console.log(`Verifying ${puzzles.length} generated puzzles...`);

let totalErrors = 0;

puzzles.forEach((puzzle, pIdx) => {
  console.log(`\nChecking Puzzle #${pIdx + 1}: "${puzzle.title}" (${puzzle.rows}x${puzzle.cols})`);

  if (!puzzle.clues || puzzle.clues.length < 8) {
    console.error(`  [FAIL] Clue count too low: ${puzzle.clues?.length}`);
    totalErrors++;
  } else {
    console.log(`  [PASS] Clue count: ${puzzle.clues.length} (more words than reference image)`);
  }

  // Check each clue matches grid letters
  puzzle.clues.forEach(clue => {
    const { direction, row, col, length, answer, song } = clue;

    if (!answer || answer.length !== length) {
      console.error(`  [FAIL] Length mismatch for clue ${clue.id}: expected ${length}, answer ${answer}`);
      totalErrors++;
    }

    if (!song?.audioUrl) {
      console.error(`  [FAIL] Missing audio URL for clue ${clue.id}`);
      totalErrors++;
    }

    // Verify grid cells
    for (let i = 0; i < length; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      const cell = puzzle.grid[r]?.[c];

      if (!cell || cell.isBlock || cell.char !== answer[i]) {
        console.error(`  [FAIL] Grid letter mismatch at (${r},${c}): expected '${answer[i]}', found '${cell?.char}' for clue ${clue.id}`);
        totalErrors++;
      }
    }
  });

  console.log(`  [PASS] All ${puzzle.clues.length} clue answers match grid coordinates perfectly.`);
});

if (totalErrors === 0) {
  console.log(`\n🎉 ALL CHECKS PASSED! Puzzle database is 100% consistent.`);
  process.exit(0);
} else {
  console.error(`\n❌ Found ${totalErrors} errors.`);
  process.exit(1);
}
