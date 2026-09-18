#!/usr/bin/env node
import { sqliteCatalog } from '../server/db/sqliteCatalog.js';
import { musicHarvester } from '../server/crawler/harvester.js';

const args = process.argv.slice(2);
const isStatusOnly = args.includes('--status');
const artistsArg = args.find(a => a.startsWith('--artists='));
const lexiconArg = args.find(a => a.startsWith('--lexicon='));

const artistsLimit = artistsArg ? parseInt(artistsArg.split('=')[1], 10) : 25;
const lexiconLimit = lexiconArg ? parseInt(lexiconArg.split('=')[1], 10) : 35;

function printStats(stats) {
  console.log('\n======================================================');
  console.log('   SPOTYSPICE SQLITE MUSIC CATALOG STATUS');
  console.log('======================================================');
  console.log(`  🎵 Total Unique Artists:       ${stats.artists.toLocaleString()}`);
  console.log(`  💿 Total Canonical Tracks:     ${stats.tracks.toLocaleString()}`);
  console.log(`  🔊 Verified Audio Samples:     ${stats.audioSamples.toLocaleString()}`);
  console.log(`  🔗 Provider Identifiers:       ${stats.providerLinks.toLocaleString()}`);
  console.log(`  ✨ Cross-Referenced Tracks:    ${stats.crossReferencedTracks.toLocaleString()}`);
  console.log('======================================================\n');
}

async function main() {
  if (isStatusOnly) {
    printStats(sqliteCatalog.getStats());
    process.exit(0);
  }

  console.log('🚀 Starting SpotySpice Massive Catalog Crawler...');
  console.log(`🎯 Targets: ${artistsLimit} Artist Discographies | ${lexiconLimit} Lexicon Sweeps`);
  console.log('🛡️  Rate Limiting: Active token bucket (Deezer 5/s, iTunes 15/min)');
  console.log('🚫 Filter: Excludes covers, karaoke, tributes, and non-official uploads\n');

  const startTime = Date.now();

  process.on('SIGINT', () => {
    console.log('\nGracefully stopping crawler...');
    musicHarvester.stop();
  });

  const harvestStats = await musicHarvester.runFullHarvest({
    artistsLimit,
    lexiconLimit,
    onProgress: (prog) => {
      const { artists, tracks, audioSamples, crossReferencedTracks } = prog.currentStats;
      process.stdout.write(
        `\r[CRAWLING] ${prog.currentAction.padEnd(35)} | Artists: ${artists} | Tracks: ${tracks} | Samples: ${audioSamples} | X-Ref: ${crossReferencedTracks}`
      );
    }
  });

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n🎉 Crawl completed in ${elapsedSec}s!`);
  console.log(`   Artists crawled: ${harvestStats.artistsCrawled}`);
  console.log(`   Lexicon seeds crawled: ${harvestStats.lexiconWordsCrawled}`);
  console.log(`   Newly inserted tracks: ${harvestStats.totalInserted}`);
  console.log(`   Cross-referenced / merged: ${harvestStats.totalMerged}`);

  printStats(sqliteCatalog.getStats());
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal crawler error:', err);
  process.exit(1);
});
