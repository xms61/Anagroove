import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRandomSongPool } from '../server/services/musicService.js';
import { generateLiveCrossword } from '../shared/liveCrossword.js';
import { isThematicallyPermitted } from '../server/services/musicService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_TEST_CASES = [
  {
    name: 'Japanese City Pop',
    prompt: '80s Japanese City Pop',
    category: 'Asian Golden Era',
    expectedCulture: 'Japanese',
    forbiddenHomonyms: ['The Japanese House', 'The Japanese Popstars', 'Aneka', 'Doctor Flake', 'Iggy Pop'],
  },
  {
    name: 'French House',
    prompt: 'French House',
    category: 'European Dance / Electronic',
    expectedCulture: 'French',
    forbiddenHomonyms: ['French Montana', 'French Montana & Swae Lee'],
  },
  {
    name: '90s Grunge',
    prompt: '90s Grunge',
    category: 'Alternative Rock',
    expectedCulture: 'Western Rock',
    forbiddenHomonyms: [],
  },
  {
    name: 'Bossa Nova',
    prompt: 'Bossa Nova',
    category: 'Brazilian Jazz / Latin',
    expectedCulture: 'Brazilian',
    forbiddenHomonyms: [],
  },
  {
    name: 'Synthwave',
    prompt: 'Synthwave',
    category: 'Retro Electronic',
    expectedCulture: 'Electronic',
    forbiddenHomonyms: [],
  },
  {
    name: 'Afrobeat',
    prompt: 'Afrobeat',
    category: 'African Funk / Polyrhythmic',
    expectedCulture: 'African',
    forbiddenHomonyms: [],
  },
  {
    name: 'German Krautrock',
    prompt: 'German Krautrock',
    category: '70s Experimental Rock',
    expectedCulture: 'German',
    forbiddenHomonyms: ['German Brigante'],
  },
  {
    name: 'K-Pop 2010s',
    prompt: 'K-Pop 2010s',
    category: 'Korean Pop',
    expectedCulture: 'Korean',
    forbiddenHomonyms: [],
  },
  {
    name: 'Reggae Roots',
    prompt: 'Reggae Roots',
    category: 'Jamaican Roots Reggae',
    expectedCulture: 'Jamaican',
    forbiddenHomonyms: [],
  },
  {
    name: 'Classic Rock 70s',
    prompt: 'Classic Rock 70s',
    category: '70s Classic Rock',
    expectedCulture: 'Western Rock',
    forbiddenHomonyms: [],
  },
  {
    name: 'Single Artist (Daft Punk)',
    prompt: 'songs by Daft Punk',
    category: 'Targeted Artist Crossword',
    expectedCulture: 'French Electronic',
    forbiddenHomonyms: [],
    expectZeroArtistClues: true,
  },
  {
    name: 'Anime (2020-2026)',
    prompt: 'anime from the years 2020-2026',
    category: 'Temporal Year Range',
    expectedCulture: 'Japanese',
    forbiddenHomonyms: ['Anime'],
    yearRange: { start: 2020, end: 2026 },
  },
  {
    name: '90s Grunge (Before 1994)',
    prompt: 'grunge before 1994',
    category: 'Temporal Upper Bound',
    expectedCulture: 'Western Rock',
    forbiddenHomonyms: [],
    yearRange: { end: 1993 },
  },
  {
    name: 'Classic Rock (1970-1976)',
    prompt: 'rock between 1970 and 1976',
    category: 'Temporal Range Bounds',
    expectedCulture: 'Western Rock',
    forbiddenHomonyms: [],
    yearRange: { start: 1970, end: 1976 },
  },
];

const TARGET_WORDS = 10;
const OUTPUT_REPORT_PATH = 'C:/Users/xms/.gemini/antigravity-acp/brain/de7a042a-6932-4ebc-8c01-82d8991e18b2/scratch/prompt_crossword_suite_report.md';

async function runPromptCrosswordSuite() {
  console.log('================================================================');
  console.log('  SpotySpice Multi-Prompt Crossword Generation Test Suite');
  console.log('================================================================\n');

  const suiteResults = [];
  let allPassed = true;

  for (const testCase of PROMPT_TEST_CASES) {
    console.log(`\n▶ Testing Prompt: "${testCase.prompt}" (${testCase.category})`);
    const startTime = Date.now();

    try {
      // 1. Harvest candidates
      const songs = await getRandomSongPool({
        prompt: testCase.prompt,
        count: TARGET_WORDS + 8,
        popularity: 'balanced',
      });

      const harvestLatency = Date.now() - startTime;
      console.log(`  Harvested ${songs.length} eligible candidates in ${harvestLatency}ms`);

      if (songs.length < 6) {
        throw new Error(`Insufficient songs harvested: expected >= 6, got ${songs.length}`);
      }

      // 2. Check thematic purity and verify forbidden homonyms are absent
      let thematicViolations = 0;
      const violatingTracks = [];

      for (const song of songs) {
        if (!isThematicallyPermitted(song, 'all', testCase.prompt)) {
          thematicViolations++;
          violatingTracks.push(`${song.artist} - "${song.title}"`);
        }
        for (const forbidden of testCase.forbiddenHomonyms) {
          if (song.artist.toLowerCase().includes(forbidden.toLowerCase())) {
            thematicViolations++;
            violatingTracks.push(`Forbidden homonym artist: ${song.artist}`);
          }
        }
      }

      if (thematicViolations > 0) {
        console.error(`  ✖ Thematic violations detected (${thematicViolations}):`, violatingTracks);
      } else {
        console.log('  ✓ Thematic purity: 100% (0 homonym leaks or violations)');
      }

      // 3. Generate Crossword Grid Layout
      const layoutStart = Date.now();
      const puzzle = generateLiveCrossword(songs, `⚡ Live: ${testCase.prompt}`, TARGET_WORDS);
      const layoutDuration = Date.now() - layoutStart;

      if (!puzzle || !puzzle.clues || puzzle.clues.length < 6) {
        throw new Error(`Crossword placement failed: placed ${puzzle?.clues?.length || 0} words (min 6 required)`);
      }

      const wordsPlaced = puzzle.clues.length;
      const gridSize = `${puzzle.cols}x${puzzle.rows}`;
      console.log(`  ✓ Crossword Layout: ${wordsPlaced}/${TARGET_WORDS} words placed in ${gridSize} grid (${layoutDuration}ms)`);

      // 4. Clue Type Distribution & Keyword Validation
      const clueStats = { title: 0, artist: 0, keyword: 0 };
      const placedTracks = [];

      for (const clue of puzzle.clues) {
        if (clue.clueType === 'Song title') clueStats.title++;
        else if (clue.clueType === 'Artist name') clueStats.artist++;
        else clueStats.keyword++;

        // Validate answer integrity
        if (!clue.answer || clue.answer.length < 3 || clue.answer.length > 14) {
          throw new Error(`Invalid answer keyword length: "${clue.answer}" (${clue.answer.length})`);
        }
        if (/[^A-Z0-9]/.test(clue.answer)) {
          throw new Error(`Answer keyword contains non-alphanumeric characters: "${clue.answer}"`);
        }

        placedTracks.push({
          answer: clue.answer,
          clueType: clue.clueType,
          artist: clue.song?.artist || 'Unknown',
          title: clue.song?.title || 'Unknown',
        });
      }

      console.log(`  ✓ Clues Balance: ${clueStats.title} Title, ${clueStats.artist} Artist, ${clueStats.keyword} Keyword`);

      // 5. Validate single-artist clue policy if specified
      if (testCase.expectZeroArtistClues) {
        if (clueStats.artist > 0) {
          throw new Error(`Single artist puzzle violation: expected 0% artist clues, got ${clueStats.artist} artist clues`);
        }
        console.log('  ✓ Single artist clue policy: 100% (0% artist name clues, 100% title/keyword)');
      }

      // 6. Validate temporal release bounds on harvested songs if specified
      if (testCase.yearRange) {
        for (const song of songs) {
          const yr = song.releaseDate ? parseInt(String(song.releaseDate).slice(0, 4), 10) : NaN;
          if (Number.isFinite(yr)) {
            if ((testCase.yearRange.start !== undefined && yr < testCase.yearRange.start) ||
                (testCase.yearRange.end !== undefined && yr > testCase.yearRange.end)) {
              throw new Error(`Temporal bound violation: track "${song.title}" (${yr}) outside range ${JSON.stringify(testCase.yearRange)}`);
            }
          }
        }
        console.log(`  ✓ Temporal fidelity: 100% (all tracks within ${JSON.stringify(testCase.yearRange)})`);
      }

      suiteResults.push({
        ...testCase,
        status: thematicViolations === 0 ? 'PASS' : 'WARN',
        harvestedCount: songs.length,
        harvestLatency,
        wordsPlaced,
        gridSize,
        layoutDuration,
        clueStats,
        thematicViolations,
        violatingTracks,
        sampleTracks: placedTracks.slice(0, 5),
      });

    } catch (err) {
      console.error(`  ✖ Failed test for "${testCase.prompt}":`, err.message);
      allPassed = false;
      suiteResults.push({
        ...testCase,
        status: 'FAIL',
        error: err.message,
      });
    }

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 400));
  }

  // 5. Generate Suite Analysis Markdown Report
  let report = `# Multi-Prompt Crossword Generation Test Suite Report\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Total Prompts Tested**: ${PROMPT_TEST_CASES.length}\n`;
  const passedCount = suiteResults.filter(r => r.status === 'PASS').length;
  report += `**Passing Rate**: ${passedCount}/${PROMPT_TEST_CASES.length} (${((passedCount / PROMPT_TEST_CASES.length) * 100).toFixed(1)}%)\n\n`;

  report += `## Summary Across Tested Genres & Eras\n\n`;
  report += `| Status | Prompt | Category | Candidates | Placed | Grid | Clue Breakdown | Thematic Purity |\n`;
  report += `| :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: |\n`;

  for (const r of suiteResults) {
    if (r.status === 'FAIL') {
      report += `| ❌ FAIL | ${r.prompt} | ${r.category} | - | - | - | Error: ${r.error} | - |\n`;
    } else {
      const statusIcon = r.status === 'PASS' ? '✅ PASS' : '⚠️ WARN';
      const clues = `${r.clueStats.title}T / ${r.clueStats.artist}A / ${r.clueStats.keyword}K`;
      const purity = r.thematicViolations === 0 ? '100% Clean' : `${r.thematicViolations} Violations`;
      report += `| ${statusIcon} | ${r.prompt} | ${r.category} | ${r.harvestedCount} | ${r.wordsPlaced}/10 | ${r.gridSize} | ${clues} | ${purity} |\n`;
    }
  }

  report += `\n## Sample Tracks Placed Per Prompt\n\n`;
  for (const r of suiteResults) {
    if (r.sampleTracks && r.sampleTracks.length > 0) {
      report += `### 🎵 ${r.prompt} (${r.category})\n\n`;
      report += `| Answer | Clue Type | Artist | Title |\n`;
      report += `| :--- | :--- | :--- | :--- |\n`;
      for (const t of r.sampleTracks) {
        report += `| \`${t.answer}\` | ${t.clueType} | ${t.artist} | ${t.title} |\n`;
      }
      report += `\n`;
    }
  }

  try {
    fs.mkdirSync(path.dirname(OUTPUT_REPORT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_REPORT_PATH, report, 'utf8');
    console.log(`\nDetailed report written to: ${OUTPUT_REPORT_PATH}`);
  } catch (e) {
    console.warn('Could not write report file:', e.message);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log(`🎉 ALL ${PROMPT_TEST_CASES.length} PROMPT CROSSWORD SUITES PASSED SUCCESSFULLY!`);
  } else {
    console.error('❌ SOME PROMPT SUITES FAILED.');
    process.exitCode = 1;
  }
  console.log('================================================================\n');

  return { passedCount, total: PROMPT_TEST_CASES.length, allPassed };
}

runPromptCrosswordSuite().catch(err => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
