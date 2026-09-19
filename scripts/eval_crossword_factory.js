#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCrosswordFromCatalog } from '../server/services/queryFactory.js';
import { sqliteCatalog } from '../server/db/sqliteCatalog.js';
import { judgePuzzle, judgeMultiGenerationSuite } from '../server/services/crosswordJudge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GENERATIONS_PER_CASE = 3;

const BENCHMARK_SUITES = {
  dense: [
    { id: 'D01', prompt: '90s rock' },
    { id: 'D02', prompt: '2000s pop' },
    { id: 'D03', prompt: 'classic disco' },
    { id: 'D04', prompt: '80s synthpop' },
    { id: 'D05', prompt: 'golden age hip hop' },
    { id: 'D06', prompt: 'dance anthems' },
    { id: 'D07', prompt: 'latin essentials' },
    { id: 'D08', prompt: 'indie rock gems' },
    { id: 'D09', prompt: 'motown hits' },
    { id: 'D10', prompt: 'r&b classics' },
  ],
  small: [
    { id: 'S01', prompt: 'pop bops' },
    { id: 'S02', prompt: 'quick hits' },
    { id: 'S03', prompt: 'punk rock' },
    { id: 'S04', prompt: 'short titles' },
    { id: 'S05', prompt: 'euro dance' },
    { id: 'S06', prompt: 'ska hits' },
    { id: 'S07', prompt: 'funk groove' },
    { id: 'S08', prompt: 'folk songs' },
    { id: 'S09', prompt: 'trap beats' },
    { id: 'S10', prompt: 'club mix' },
  ],
  themed: [
    { id: 'T01', prompt: '70s Classic Rock' },
    { id: 'T02', prompt: '90s Grunge' },
    { id: 'T03', prompt: 'French House' },
    { id: 'T04', prompt: '80s City Pop' },
    { id: 'T05', prompt: 'Motown Soul' },
    { id: 'T06', prompt: '2010s EDM' },
    { id: 'T07', prompt: '90s Hip Hop' },
    { id: 'T08', prompt: 'Bossa Nova' },
    { id: 'T09', prompt: 'Reggae Roots' },
    { id: 'T10', prompt: 'K-Pop 2010s' },
  ],
  custom: [
    { id: 'C01', prompt: 'songs by Queen' },
    { id: 'C02', prompt: 'songs by Daft Punk' },
    { id: 'C03', prompt: 'chill acoustic coffeehouse' },
    { id: 'C04', prompt: 'rap hits between 2018 and 2024' },
    { id: 'C05', prompt: 'rock before 1975' },
    { id: 'C06', prompt: 'songs by Taylor Swift' },
    { id: 'C07', prompt: 'obscure punk rock before 1990' },
    { id: 'C08', prompt: 'summer pop anthems 2020-2024' },
    { id: 'C09', prompt: 'songs by Michael Jackson' },
    { id: 'C10', prompt: 'electronic beats after 2015' },
  ],
  edge_cases: [
    { id: 'E01', prompt: 'anime openings', archetype: 'standard' },
    { id: 'E02', prompt: '80s Japanese City Pop', archetype: 'standard' },
    { id: 'E03', prompt: 'songs by Queen', archetype: 'standard' },
    { id: 'E04', prompt: 'rock before 1975', archetype: 'standard' },
    { id: 'E05', prompt: 'K-Pop 2010s', archetype: 'standard' },
    { id: 'E06', prompt: 'French House', archetype: 'standard' },
  ],
};

function renderAsciiGrid(puzzle) {
  if (!puzzle || !puzzle.grid) return 'No grid available';
  const lines = [];
  for (let r = 0; r < puzzle.rows; r++) {
    let rowStr = '';
    for (let c = 0; c < puzzle.cols; c++) {
      const cell = puzzle.grid[r][c];
      if (cell.isBlock) {
        rowStr += '░░ ';
      } else {
        rowStr += (cell.char || ' ') + '  ';
      }
    }
    lines.push(rowStr.trimEnd());
  }
  return lines.join('\n');
}

async function runEvaluationSuite() {
  console.log('================================================================================');
  console.log('   SPOTYSPICE MULTI-GENERATION BENCHMARK & LLM JUDGMENT SUITE');
  console.log(`   Scale: 46 Prompts x ${GENERATIONS_PER_CASE} Generations = ${46 * GENERATIONS_PER_CASE} Total Crossword Executions`);
  console.log('================================================================================\n');

  const catalogStats = sqliteCatalog.getStats();
  console.log(`SQLite Catalog: ${catalogStats.tracks.toLocaleString()} tracks, ${catalogStats.artists.toLocaleString()} artists, ${catalogStats.audioSamples.toLocaleString()} samples\n`);

  const results = {};
  const multiJudgments = {};
  let totalGenerationsExecuted = 0;
  let totalSuccessfulGenerations = 0;

  for (const [suiteName, cases] of Object.entries(BENCHMARK_SUITES)) {
    results[suiteName] = [];
    multiJudgments[suiteName] = [];
    console.log(`▶ Executing suite [${suiteName.toUpperCase()}] (${cases.length} prompts x ${GENERATIONS_PER_CASE} generations)...`);

    for (const testCase of cases) {
      const promptArchetype = testCase.archetype || (suiteName === 'edge_cases' ? 'standard' : suiteName);
      const generatedPuzzles = [];
      const singleResults = [];

      for (let gen = 0; gen < GENERATIONS_PER_CASE; gen++) {
        totalGenerationsExecuted++;
        const { puzzle, stats, parsed } = await buildCrosswordFromCatalog({
          prompt: testCase.prompt,
          archetype: promptArchetype,
          catalog: sqliteCatalog,
        });

        if (stats.success && puzzle) {
          totalSuccessfulGenerations++;
          generatedPuzzles.push(puzzle);
        }

        const judgment = judgePuzzle(puzzle, {
          prompt: testCase.prompt,
          archetype: promptArchetype,
          parsed,
          expectedLanguage: 'en',
        });

        singleResults.push({
          generation: gen + 1,
          stats,
          judgment,
          gridAscii: renderAsciiGrid(puzzle),
        });
      }

      // Aggregate multi-generation judgment
      const multi = judgeMultiGenerationSuite(testCase.prompt, generatedPuzzles, {
        archetype: promptArchetype,
        parsed: singleResults[0]?.stats ? singleResults[0].judgment : {},
      });

      multiJudgments[suiteName].push({
        id: testCase.id,
        prompt: testCase.prompt,
        multi,
      });

      results[suiteName].push({
        id: testCase.id,
        prompt: testCase.prompt,
        archetype: promptArchetype,
        generations: singleResults,
        multiJudgment: multi,
      });

      const mark = multi.passed ? '✓' : (multi.avgScore >= 70 ? '⚠' : '✗');
      const uniquePct = `${Math.round(multi.repetitiveness.uniqueTrackRatio * 100)}%`;
      const shortPct = `${Math.round(multi.lengthVariety.shortShare * 100)}%`;
      const jaccard = multi.repetitiveness.avgJaccard;
      console.log(`  ${mark} [${testCase.id}] "${testCase.prompt}" -> Score: ${multi.avgScore} | Unique: ${uniquePct} | Jaccard: ${jaccard} | Short: ${shortPct} [${multi.generationsCount}/${GENERATIONS_PER_CASE} gens]`);
      if (multi.allViolations.length > 0) {
        console.log(`     Violations: ${multi.allViolations.slice(0, 2).join('; ')}`);
      }
    }
    console.log('');
  }

  // Suite-level summaries
  const summary = {};
  for (const [suiteName, caseResults] of Object.entries(results)) {
    const totalCases = caseResults.length;
    const passedCases = caseResults.filter(c => c.multiJudgment.passed).length;
    const avgScore = Math.round(caseResults.reduce((sum, c) => sum + c.multiJudgment.avgScore, 0) / totalCases);
    const avgUniqueTracks = caseResults.reduce((sum, c) => sum + c.multiJudgment.repetitiveness.uniqueTrackRatio, 0) / totalCases;
    const avgJaccard = caseResults.reduce((sum, c) => sum + c.multiJudgment.repetitiveness.avgJaccard, 0) / totalCases;
    const avgShortRatio = caseResults.reduce((sum, c) => sum + c.multiJudgment.lengthVariety.shortShare, 0) / totalCases;
    const avgMediumRatio = caseResults.reduce((sum, c) => sum + c.multiJudgment.lengthVariety.mediumShare, 0) / totalCases;
    const avgLongRatio = caseResults.reduce((sum, c) => sum + c.multiJudgment.lengthVariety.longShare, 0) / totalCases;

    summary[suiteName] = {
      cases: totalCases,
      passed: passedCases,
      passRate: `${Math.round((passedCases / totalCases) * 100)}%`,
      avgScore,
      avgUniqueTracks: `${Math.round(avgUniqueTracks * 100)}%`,
      avgJaccard: avgJaccard.toFixed(2),
      lengthDistribution: {
        short: `${Math.round(avgShortRatio * 100)}%`,
        medium: `${Math.round(avgMediumRatio * 100)}%`,
        long: `${Math.round(avgLongRatio * 100)}%`,
      },
    };
  }

  console.log('================================================================================');
  console.log('                 CROSSWORD ENGINE MULTI-GENERATION SUMMARY');
  console.log('================================================================================');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nTotal Crossword Generations Run: ${totalGenerationsExecuted}`);
  console.log(`Total Successful Crosswords: ${totalSuccessfulGenerations} (${Math.round((totalSuccessfulGenerations / totalGenerationsExecuted) * 100)}%)\n`);

  // Build Markdown evaluation report
  const reportLines = [
    '# SpotySpice Multi-Generation Crossword Benchmark & Evaluation Report',
    '',
    `**Timestamp**: ${new Date().toISOString()}`,
    `**Generations Per Case**: ${GENERATIONS_PER_CASE}`,
    `**Total Crosswords Generated**: ${totalGenerationsExecuted}`,
    `**Catalog Scale**: ${catalogStats.tracks.toLocaleString()} tracks | ${catalogStats.artists.toLocaleString()} artists | ${catalogStats.audioSamples.toLocaleString()} samples`,
    '',
    '## 1. Executive Summary & Judgment Matrix',
    '',
    '| Suite | Prompts | Pass Rate | Avg Score | Track Uniqueness | Overlap (Jaccard) | Short Words (3-5) | Medium (6-8) | Long (9+) |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const [sName, s] of Object.entries(summary)) {
    reportLines.push(`| **${sName.toUpperCase()}** | ${s.cases} | ${s.passRate} | ${s.avgScore}/100 | ${s.avgUniqueTracks} | ${s.avgJaccard} | ${s.lengthDistribution.short} | ${s.lengthDistribution.medium} | ${s.lengthDistribution.long} |`);
  }

  reportLines.push(
    '',
    '## 2. Evaluation Criteria & Audit Checklist',
    '',
    '- **Language Enforcement**: 100% English purity for Western/general prompts; Korean allowed for K-Pop; Japanese allowed for Anime & City Pop.',
    '- **Anime vs Japanese Separation**: 100% of placed tracks in Anime crosswords are authentic openings/endings/OSTs; Japanese City Pop tracks reject modern anime hijack and Western homonyms.',
    '- **Word Length Variety**: Active rotation ensures 3-5 letter words represent 30-55% of all placed answers across layouts.',
    '- **Popularity Variety & Anti-Repetitiveness**: High uniqueness ratio (>0.70) and low Jaccard overlap (<0.20) across successive generations.',
    '- **Authenticity**: 0 covers, 0 karaoke, 0 instrumentals, 0 fake audio modifications.',
    '- **Thematic Fidelity**: Single-artist crosswords contain 100% target artist songs with 0 leaked artist-name clues; temporal crosswords respect year bounds.',
    '',
    '## 3. Detailed Benchmark Case Audit',
    ''
  );

  for (const [sName, caseResults] of Object.entries(results)) {
    reportLines.push(`### Suite: ${sName.toUpperCase()}`, '');
    for (const c of caseResults) {
      const m = c.multiJudgment;
      const statusIcon = m.passed ? 'PASSED' : (m.avgScore >= 70 ? 'WARNING' : 'FAILED');
      reportLines.push(`#### [${c.id}] "${c.prompt}" — ${statusIcon} (Score: ${m.avgScore}/100)`);
      reportLines.push(`- **Archetype**: \`${c.archetype}\``);
      reportLines.push(`- **Repetitiveness**: Unique Tracks: ${Math.round(m.repetitiveness.uniqueTrackRatio * 100)}% (${m.repetitiveness.distinctTracksCount}/${m.repetitiveness.totalPlacedTracks}) | Jaccard Overlap: ${m.repetitiveness.avgJaccard}`);
      reportLines.push(`- **Length Variety**: Short (3-5): ${Math.round(m.lengthVariety.shortShare * 100)}% | Medium (6-8): ${Math.round(m.lengthVariety.mediumShare * 100)}% | Long (9+): ${Math.round(m.lengthVariety.longShare * 100)}%`);
      reportLines.push(`- **Popularity**: Min: ${m.popularity.min}, Max: ${m.popularity.max}, Avg: ${m.popularity.avg}, StdDev: ${m.popularity.popStdDev} (High: ${m.popularity.tierDistribution.highTierPercent}%, Mid: ${m.popularity.tierDistribution.midTierPercent}%, Catalog: ${m.popularity.tierDistribution.catalogTierPercent}%)`);
      if (m.allViolations.length > 0) {
        reportLines.push(`- **Violations**:`);
        for (const v of m.allViolations) {
          reportLines.push(`  - ✗ ${v}`);
        }
      } else {
        reportLines.push(`- **Violations**: None (100% clean)`);
      }
      reportLines.push('');
      reportLines.push('```');
      reportLines.push(c.generations[0]?.gridAscii || 'No grid');
      reportLines.push('```');
      reportLines.push('');
    }
  }

  const projectReportsDir = path.resolve(__dirname, '../reports');
  if (!fs.existsSync(projectReportsDir)) {
    fs.mkdirSync(projectReportsDir, { recursive: true });
  }
  const reportPath = path.join(projectReportsDir, 'crossword_evaluation_report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');

  // Also write to conversation scratch directory
  const scratchDir = 'C:/Users/xms/.gemini/antigravity-acp/brain/33c51d32-aab4-4638-9b3c-0036238b0928/scratch';
  try {
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(path.join(scratchDir, 'crossword_evaluation_report.md'), reportLines.join('\n'), 'utf8');
  } catch {
    // Optional scratch file write error ignored
  }
  console.log(`\nDetailed LLM Judge Report written to:\n${reportPath}\n`);

  return { summary, results };
}

runEvaluationSuite().catch(err => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
