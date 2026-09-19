#!/usr/bin/env node
import { sqliteCatalog } from '../server/db/sqliteCatalog.js';
import { musicHarvester } from '../server/crawler/harvester.js';

const args = process.argv.slice(2);
const isStatusOnly = args.includes('--status');
const isPlaylistsOnly = args.includes('--playlists-only');
const targetArg = args.find(a => a.startsWith('--target='));
const playlistsArg = args.find(a => a.startsWith('--playlists='));
const decadesArg = args.find(a => a.startsWith('--decades='));
const artistsArg = args.find(a => a.startsWith('--artists='));
const lexiconArg = args.find(a => a.startsWith('--lexicon='));

const targetTracks = targetArg ? parseInt(targetArg.split('=')[1], 10) : 500000;
const playlistsLimit = playlistsArg ? parseInt(playlistsArg.split('=')[1], 10) : (isPlaylistsOnly ? 100 : 100);
const decadesLimit = decadesArg ? parseInt(decadesArg.split('=')[1], 10) : (isPlaylistsOnly ? 0 : 105);
const artistsLimit = artistsArg ? parseInt(artistsArg.split('=')[1], 10) : (isPlaylistsOnly ? 0 : 500);
const lexiconLimit = lexiconArg ? parseInt(lexiconArg.split('=')[1], 10) : (isPlaylistsOnly ? 0 : 1500);

function printStats(stats) {
  console.log('\n======================================================');
  console.log('   SPOTYSPICE SQLITE MUSIC CATALOG STATUS');
  console.log('======================================================');
  console.log(`  🎵 Total Unique Artists:       ${stats.artists.toLocaleString()}`);
  console.log(`  💿 Total Canonical Tracks:     ${stats.tracks.toLocaleString()}`);
  console.log(`  🔊 Verified Audio Samples:     ${stats.audioSamples.toLocaleString()}`);
  console.log(`  🌐 Country Codes (ISRC):       ${(stats.countryCodes || 0).toLocaleString()}`);
  console.log(`  🗣️  Detected Languages:        ${(stats.languages || 0).toLocaleString()}`);
  console.log(`  🔗 Provider Identifiers:       ${stats.providerLinks.toLocaleString()}`);
  console.log(`  ✨ Cross-Referenced Tracks:    ${stats.crossReferencedTracks.toLocaleString()}`);
  console.log('======================================================\n');
}

async function main() {
  if (isStatusOnly) {
    printStats(sqliteCatalog.getStats());
    process.exit(0);
  }

  const initialStats = sqliteCatalog.getStats();
  console.log('🚀 Starting SpotySpice Massive Catalog Crawler...');
  console.log(`🎯 Target Goal: ${targetTracks.toLocaleString()} Tracks (Current: ${initialStats.tracks.toLocaleString()})`);
  console.log(`📡 Config: Playlists: ${playlistsLimit} | Artists: ${artistsLimit} | Lexicon: ${lexiconLimit}`);
  console.log('🛡️  Rate Limiting: Active token bucket (Deezer 5/s, iTunes 15/min)');
  console.log('🚫 Filter: Excludes covers, karaoke, tributes, and non-official uploads\n');

  const startTime = Date.now();

  process.on('SIGINT', () => {
    console.log('\nGracefully stopping crawler...');
    musicHarvester.stop();
  });

  const harvestStats = await musicHarvester.runFullHarvest({
    targetTracks,
    playlistsLimit,
    decadesLimit,
    artistsLimit,
    lexiconLimit,
    onProgress: (prog) => {
      const { artists, tracks, audioSamples } = prog.currentStats;
      const pct = Math.min(100, (tracks / targetTracks) * 100).toFixed(1);
      const action = (prog.currentAction || '').slice(0, 32).padEnd(32);
      process.stdout.write(
        `\r[${pct}%] ${action} | Artists: ${artists.toLocaleString()} | Tracks: ${tracks.toLocaleString()} | Samples: ${audioSamples.toLocaleString()}`
      );
    }
  });

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n🎉 Crawl batch completed in ${elapsedSec}s!`);
  console.log(`   Playlists crawled: ${harvestStats.playlistsCrawled}`);
  console.log(`   Decade queries crawled: ${harvestStats.decadeQueriesCrawled}`);
  console.log(`   Artists crawled: ${harvestStats.artistsCrawled}`);
  console.log(`   Lexicon seeds crawled: ${harvestStats.lexiconWordsCrawled}`);
  if (harvestStats.yearGenreQueriesCrawled) {
    console.log(`   Year/genre queries crawled: ${harvestStats.yearGenreQueriesCrawled}`);
  }
  if (harvestStats.bigramsCrawled) {
    console.log(`   Bigrams crawled: ${harvestStats.bigramsCrawled}`);
  }
  console.log(`   Newly inserted tracks: ${harvestStats.totalInserted}`);
  console.log(`   Cross-referenced / merged: ${harvestStats.totalMerged}`);

  printStats(sqliteCatalog.getStats());
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal crawler error:', err);
  process.exit(1);
});
