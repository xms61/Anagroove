import { buildCrosswordFromCatalog } from '../server/services/queryFactory.js';
import { toCrosswordAnswer } from '../shared/musicIdentity.js';

const args = process.argv.slice(2);
const suiteArg = args.find(a => a.startsWith('--suite='));
const targetSuite = suiteArg ? suiteArg.split('=')[1] : 'edge_cases';
const genArg = args.find(a => a.startsWith('--gens='));
const numGens = genArg ? parseInt(genArg.split('=')[1], 10) : 3;

const SUITES = {
  edge_cases: [
    { id: 'E01', prompt: 'anime openings' },
    { id: 'E02', prompt: '80s Japanese City Pop' },
    { id: 'E03', prompt: 'songs by Queen' },
    { id: 'E04', prompt: 'rock before 1975' },
    { id: 'E05', prompt: 'K-Pop 2010s' },
    { id: 'E06', prompt: 'French House' },
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
};

const suitesToRun = targetSuite === 'all'
  ? Object.entries(SUITES)
  : [[targetSuite, SUITES[targetSuite] || SUITES.edge_cases]];

async function main() {
  console.log(`================================================================================`);
  console.log(`=== STARTING VERY BIG CROSSWORD GENERATION BATCH (${numGens} GENS PER PROMPT) ===`);
  console.log(`================================================================================\n`);

  let totalCrosswordsGenerated = 0;
  let totalSuccessfulPuzzles = 0;
  let totalWordsPlaced = 0;
  let grandTotalShort = 0;
  let grandTotalMedium = 0;
  let grandTotalLong = 0;
  const allFlags = [];

  for (const [suiteKey, promptList] of suitesToRun) {
    console.log(`\n################################################################################`);
    console.log(`### SUITE: ${suiteKey.toUpperCase()} (${promptList.length} prompts x ${numGens} gens = ${promptList.length * numGens} puzzles)`);
    console.log(`################################################################################\n`);

    const archetype = (suiteKey === 'dense' || suiteKey === 'small') ? suiteKey : 'standard';
    const targetWords = suiteKey === 'small' ? 6 : 10;

    for (const item of promptList) {
      console.log(`--------------------------------------------------------------------------------`);
      console.log(`[${item.id}] "${item.prompt}" (Archetype: ${archetype}, Target words: ${targetWords})`);
      console.log(`--------------------------------------------------------------------------------`);

      const promptTracks = [];
      const promptAnswers = [];
      let successfulPuzzles = 0;
      let shortCount = 0;
      let medCount = 0;
      let longCount = 0;

      for (let gen = 1; gen <= numGens; gen++) {
        totalCrosswordsGenerated++;
        const res = await buildCrosswordFromCatalog({
          prompt: item.prompt,
          archetype,
          targetWords,
        });

        const p = res.puzzle;
        if (!p) {
          console.log(`  Gen ${gen}: FAILED (No layout generated)`);
          allFlags.push({ id: item.id, prompt: item.prompt, issue: `Gen ${gen} failed to generate layout` });
          continue;
        }

        successfulPuzzles++;
        totalSuccessfulPuzzles++;
        totalWordsPlaced += p.clues.length;

        console.log(`  Gen ${gen} (${p.clues.length}/${targetWords} words, ${p.rows}x${p.cols}):`);
        for (const c of p.clues) {
          const s = c.song || {};
          const pop = typeof s.popularity === 'number' ? (s.popularity > 100 ? Math.round(s.popularity / 10000) : s.popularity) : 0;
          const lang = s.language || '??';
          const yr = s.release_year || '????';
          const ans = c.answer || toCrosswordAnswer(c.title || '');
          const ansLen = ans.length;

          if (ansLen <= 5) { shortCount++; grandTotalShort++; }
          else if (ansLen <= 8) { medCount++; grandTotalMedium++; }
          else { longCount++; grandTotalLong++; }

          promptTracks.push(`${s.artist} - ${s.title}`);
          promptAnswers.push(ans);

          // Criteria checks
          const isSingleArtist = /songs by /i.test(item.prompt);
          if (isSingleArtist && c.clueType === 'Artist name') {
            allFlags.push({ id: item.id, prompt: item.prompt, issue: `Single artist prompt leaked artist clue: "${ans}"` });
          }

          console.log(`    - [${lang}] ${s.artist} - "${s.title}" (${yr}, Pop: ${pop}) -> Ans: "${ans}" (${ansLen} letters, ${c.clueType})`);
        }
      }

      // Compute prompt-level variety & length distribution
      const uniqueTracks = new Set(promptTracks);
      const uniquenessRatio = promptTracks.length > 0 ? (uniqueTracks.size / promptTracks.length) : 1;
      const totalWords = promptAnswers.length;
      const pctShort = totalWords > 0 ? Math.round((shortCount / totalWords) * 100) : 0;
      const pctMed = totalWords > 0 ? Math.round((medCount / totalWords) * 100) : 0;
      const pctLong = totalWords > 0 ? Math.round((longCount / totalWords) * 100) : 0;

      console.log(`  📊 Prompt Summary: Success: ${successfulPuzzles}/${numGens} | Uniqueness: ${(uniquenessRatio * 100).toFixed(1)}% (${uniqueTracks.size}/${promptTracks.length} tracks) | Lengths: Short ${pctShort}%, Med ${pctMed}%, Long ${pctLong}%\n`);
    }
  }

  const grandTotalWords = grandTotalShort + grandTotalMedium + grandTotalLong;
  console.log(`================================================================================`);
  console.log(`=== BATCH GENERATION COMPLETE ===`);
  console.log(`Total Puzzles Attempted: ${totalCrosswordsGenerated}`);
  console.log(`Successful Puzzles: ${totalSuccessfulPuzzles} (${((totalSuccessfulPuzzles / totalCrosswordsGenerated) * 100).toFixed(1)}%)`);
  console.log(`Total Words Placed: ${totalWordsPlaced}`);
  console.log(`Grand Length Distribution: Short (3-5): ${Math.round((grandTotalShort / grandTotalWords) * 100)}%, Med (6-8): ${Math.round((grandTotalMedium / grandTotalWords) * 100)}%, Long (9-14): ${Math.round((grandTotalLong / grandTotalWords) * 100)}%`);
  console.log(`Anomalies / Flags Detected: ${allFlags.length}`);
  if (allFlags.length > 0) {
    console.log(`Flags:`, JSON.stringify(allFlags, null, 2));
  }
  console.log(`================================================================================\n`);
}

main().catch(console.error);
