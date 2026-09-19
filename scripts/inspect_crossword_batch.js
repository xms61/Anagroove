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

const promptsToRun = SUITES[targetSuite] || SUITES.edge_cases;

async function main() {
  console.log(`=== RUNNING SUITE [${targetSuite.toUpperCase()}] FOR LIVE LLM JUDGMENT ===\n`);

  for (const item of promptsToRun) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`PROMPT [${item.id}]: "${item.prompt}" (Archetype: ${targetSuite === 'dense' || targetSuite === 'small' ? targetSuite : 'standard'})`);
    console.log(`--------------------------------------------------------------------------------`);

    for (let gen = 1; gen <= numGens; gen++) {
      const res = await buildCrosswordFromCatalog({
        prompt: item.prompt,
        archetype: targetSuite === 'dense' || targetSuite === 'small' ? targetSuite : 'standard',
        targetWords: targetSuite === 'small' ? 6 : 10,
      });

      const p = res.puzzle;
      if (!p) {
        console.log(`  Gen ${gen}: FAILED (No layout generated)`);
        continue;
      }

      console.log(`  Gen ${gen} (${p.clues.length} words, ${p.rows}x${p.cols}):`);
      for (const c of p.clues) {
        const s = c.song || {};
        const pop = typeof s.popularity === 'number' ? (s.popularity > 100 ? Math.round(s.popularity / 10000) : s.popularity) : '?';
        const lang = s.language || '??';
        const yr = s.release_year || '????';
        const ans = c.answer || toCrosswordAnswer(c.title || '');
        console.log(`    - [${lang}] ${s.artist} - "${s.title}" (${yr}, Pop: ${pop}) -> Answer: "${ans}" (${ans.length} letters, ${c.clueType})`);
      }
    }
    console.log('');
  }
}

main().catch(console.error);
