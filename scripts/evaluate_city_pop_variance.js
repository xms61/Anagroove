import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRandomSongPool } from '../server/services/musicService.js';
import { generateLiveCrossword } from '../shared/liveCrossword.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRATCH_DIR = 'C:\\Users\\xms\\.gemini\\antigravity-acp\\brain\\de7a042a-6932-4ebc-8c01-82d8991e18b2\\scratch';
if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

const OUTPUT_FILE = path.join(SCRATCH_DIR, 'city_pop_50_crosswords_report.md');
const PROMPT = 'Japanese City Pop';
const TARGET_WORDS = 10;
const RUNS = 50;

async function runEvaluation() {
  console.log(`Starting 50 crossword simulations for prompt: "${PROMPT}"...`);

  const allSongs = [];
  const songFrequency = new Map(); // key -> { title, artist, count, clueTypes: Set }
  const artistFrequency = new Map();
  const sessionRecentIds = [];
  let successfulCrosswords = 0;
  let failedCrosswords = 0;
  const crosswordSizes = [];

  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`\rGenerating crossword ${i}/${RUNS}...`);
    try {
      const songs = await getRandomSongPool({
        prompt: PROMPT,
        count: TARGET_WORDS + 8,
        popularity: 'balanced',
        recentIds: sessionRecentIds,
      });

      if (!songs || songs.length < 6) {
        failedCrosswords++;
        continue;
      }

      const puzzle = generateLiveCrossword(songs, `⚡ Live: ${PROMPT}`, TARGET_WORDS);
      if (!puzzle || !puzzle.clues || puzzle.clues.length === 0) {
        failedCrosswords++;
        continue;
      }

      successfulCrosswords++;
      crosswordSizes.push(puzzle.clues.length);

      for (const clue of puzzle.clues) {
        const trackId = clue.song?.providerTrackId || clue.song?.id;
        if (trackId) {
          sessionRecentIds.push(String(trackId));
        }

        const title = clue.song?.title || clue.title || clue.answer;
        const artist = clue.song?.artist || clue.artist || 'Unknown';

        const key = `${artist} - ${title}`;
        allSongs.push({
          run: i,
          title,
          artist,
          answer: clue.answer,
          clueType: clue.clueType || 'Unknown',
        });

        if (!songFrequency.has(key)) {
          songFrequency.set(key, {
            title,
            artist,
            count: 0,
            answers: new Set(),
            clueTypes: new Set(),
          });
        }
        const record = songFrequency.get(key);
        record.count++;
        record.answers.add(clue.answer);
        if (clue.clueType) record.clueTypes.add(clue.clueType);

        artistFrequency.set(artist, (artistFrequency.get(artist) || 0) + 1);
      }
    } catch (err) {
      console.error(`\nError on run ${i}:`, err.message);
      failedCrosswords++;
    }

    // Small backoff to respect external API rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n\nCompleted 50 runs! Analyzing variance...\n');

  const totalSlotsFilled = allSongs.length;
  const uniqueSongsCount = songFrequency.size;
  const totalDuplicates = totalSlotsFilled - uniqueSongsCount;
  const uniqueArtistsCount = artistFrequency.size;

  // Sort songs by frequency descending
  const sortedSongs = Array.from(songFrequency.entries()).sort((a, b) => b[1].count - a[1].count);
  const sortedArtists = Array.from(artistFrequency.entries()).sort((a, b) => b[1] - a[1]);
  const maxRepetitions = sortedSongs.length > 0 ? sortedSongs[0][1].count : 0;

  const duplicateSongs = sortedSongs.filter(([, data]) => data.count > 1);

  // Markdown Report Generation
  let report = `# 50 Crossword Simulation Report: "${PROMPT}"\n\n`;
  report += `Generated at: ${new Date().toISOString()}\n\n`;
  report += `## Summary Metrics\n\n`;
  report += `- **Total Simulation Runs**: ${RUNS}\n`;
  report += `- **Successful Crossword Generations**: ${successfulCrosswords}/${RUNS} (${Math.round((successfulCrosswords / RUNS) * 100)}%)\n`;
  report += `- **Total Song Clues Placed**: ${totalSlotsFilled}\n`;
  report += `- **Unique Songs Discovered**: ${uniqueSongsCount}\n`;
  report += `- **Unique Artists Represented**: ${uniqueArtistsCount}\n`;
  report += `- **Total Duplicate Song Inclusions**: ${totalDuplicates}\n`;
  report += `- **Catalog Variance / Uniqueness Ratio**: ${((uniqueSongsCount / totalSlotsFilled) * 100).toFixed(1)}%\n`;
  report += `- **Maximum Repetitions for Any Single Song**: **${maxRepetitions}** (Target: <= 3)\n\n`;

  report += `## Most Frequent Songs (Duplicates across 50 Puzzles)\n\n`;
  report += `| Count | Artist | Song Title | Answer Keyword(s) | Clue Type(s) |\n`;
  report += `| :---: | :--- | :--- | :--- | :--- |\n`;
  for (const [, data] of duplicateSongs) {
    const answers = Array.from(data.answers).join(', ');
    const clueTypes = Array.from(data.clueTypes).join(', ');
    report += `| **${data.count}** | ${data.artist} | ${data.title} | \`${answers}\` | ${clueTypes} |\n`;
  }

  report += `\n## Top Represented Artists\n\n`;
  report += `| Appearances | Artist Name |\n`;
  report += `| :---: | :--- |\n`;
  for (const [artist, count] of sortedArtists.slice(0, 20)) {
    report += `| ${count} | ${artist} |\n`;
  }

  report += `\n## Complete List of All ${uniqueSongsCount} Unique Songs\n\n`;
  report += `| # | Count | Artist | Song Title |\n`;
  report += `| :---: | :---: | :--- | :--- |\n`;
  sortedSongs.forEach(([, data], idx) => {
    report += `| ${idx + 1} | ${data.count} | ${data.artist} | ${data.title} |\n`;
  });

  fs.writeFileSync(OUTPUT_FILE, report, 'utf8');
  console.log(`Detailed report written to: ${OUTPUT_FILE}`);

  return {
    totalRuns: RUNS,
    successfulCrosswords,
    failedCrosswords,
    totalSlotsFilled,
    uniqueSongsCount,
    uniqueArtistsCount,
    totalDuplicates,
    uniquenessRatio: ((uniqueSongsCount / totalSlotsFilled) * 100).toFixed(1),
    topSongs: sortedSongs.slice(0, 10).map(([, d]) => ({ artist: d.artist, title: d.title, count: d.count })),
    outputFile: OUTPUT_FILE,
  };
}

runEvaluation()
  .then(res => {
    console.log('\n--- Simulation Summary ---');
    console.log(`Success Rate: ${res.successfulCrosswords}/${res.totalRuns}`);
    console.log(`Total Clues: ${res.totalSlotsFilled}`);
    console.log(`Unique Songs: ${res.uniqueSongsCount} (${res.uniquenessRatio}% unique)`);
    console.log(`Unique Artists: ${res.uniqueArtistsCount}`);
    console.log(`Duplicate Inclusions: ${res.totalDuplicates}`);
    console.log('\nTop 10 Most Repeated Songs:');
    res.topSongs.forEach((s, idx) => console.log(` ${idx + 1}. [${s.count}x] ${s.artist} - ${s.title}`));
  })
  .catch(err => {
    console.error('Fatal simulation error:', err);
    process.exit(1);
  });
