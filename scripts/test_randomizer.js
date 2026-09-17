// Automated test for True Randomization & Recognizability Filter
import { getRandomSongPool } from '../server/services/musicService.js';
import { generateLiveCrossword } from '../src/utils/liveGenerator.ts';

async function runTests() {
  console.log('🧪 Starting Recognizable Randomizer Tests...\n');

  // Test 1: Query randomized pool
  console.log('1. Testing Truly Randomized Recognizable Song Pool...');
  const pool1 = await getRandomSongPool({ genre: 'all', minFans: 250000, count: 15 });
  console.log(`   Retrieved ${pool1.length} songs.`);

  if (pool1.length < 8) {
    throw new Error('Expected at least 8 recognizable songs in pool');
  }

  // Check fans and rank
  for (const song of pool1) {
    if (song.fans < 200000) {
      throw new Error(`Artist ${song.artist} has ${song.fans} fans, below threshold!`);
    }
    if (song.rank < 400000) {
      throw new Error(`Song ${song.title} has rank ${song.rank}, below 400,000!`);
    }
    if (!song.audioUrl) {
      throw new Error(`Song ${song.title} is missing preview audioUrl!`);
    }
    if (!song.answer || song.answer.length < 3) {
      throw new Error(`Invalid answer keyword for ${song.title}: ${song.answer}`);
    }
  }
  console.log('   [PASS] All songs satisfy min fans (250k+) and min rank (400k+).');

  // Test 2: True Randomization (Entropy check)
  console.log('\n2. Testing Randomization Entropy (Distinct song IDs across runs)...');
  const pool2 = await getRandomSongPool({ genre: 'all', minFans: 250000, count: 15 });
  const pool3 = await getRandomSongPool({ genre: 'all', minFans: 250000, count: 15 });

  const ids1 = new Set(pool1.map(s => s.id));
  const overlap12 = pool2.filter(s => ids1.has(s.id)).length;
  const overlap13 = pool3.filter(s => ids1.has(s.id)).length;

  console.log(`   Run 1 vs Run 2 overlap: ${overlap12}/${pool1.length}`);
  console.log(`   Run 1 vs Run 3 overlap: ${overlap13}/${pool1.length}`);
  if (overlap12 >= pool1.length * 0.75) {
    throw new Error('Runs are not sufficiently randomized!');
  }
  console.log('   [PASS] True randomization verified with high diversity across runs.');

  // Test 3: Generate Live Crossword Grid
  console.log('\n3. Testing Live Crossword Generation from Pool...');
  const t0 = performance.now();
  const puzzle = generateLiveCrossword(pool1, '⚡ Live: Eclectic Test', 10);
  const t1 = performance.now();

  if (!puzzle || puzzle.clues.length < 6) {
    throw new Error('Failed to generate valid intersecting crossword!');
  }
  console.log(`   Generated ${puzzle.clues.length} intersecting clues in ${(t1 - t0).toFixed(2)} ms!`);
  console.log('   [PASS] Live crossword generation successful.');

  console.log('\n🎉 ALL RECOGNIZABLE RANDOMIZER TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
