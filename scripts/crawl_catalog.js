#!/usr/bin/env node
import { sqliteCatalog } from '../server/db/sqliteCatalog.js';
import { musicHarvester } from '../server/crawler/harvester.js';
import { UsageError, intFlag, parseFlags, parseOrExit } from './lib/cli.js';

const USAGE = `
Crawls Apple charts and Deezer into the catalog. Every vector is off unless named.

  npm run crawl -- --status                  catalog counts only
  npm run crawl -- --all                     every vector with default limits
  npm run crawl -- --charts=100              Apple "most played" per storefront (10, 25, 50 or 100)
  npm run crawl -- --playlists=40            curated playlist searches (3 playlists each)
  npm run crawl -- --decades=105             decade x genre searches
  npm run crawl -- --artists=500             foundation artist discographies + related artists
  npm run crawl -- --lexicon=300             single-word title searches
  npm run crawl -- --playlists-only          playlists with the default limit, nothing else
  --target=N                                 stop once the catalog holds N tracks (default 500000)

Vectors can be combined; --all takes per-vector overrides. Flags must follow "--".`;

export const DEFAULT_VECTOR_LIMITS = Object.freeze({ charts: 100, playlists: 100, decades: 105, artists: 500, lexicon: 1500 });
const DEFAULT_TARGET = 500000;
const VECTORS = Object.keys(DEFAULT_VECTOR_LIMITS);

const OPTIONS = {
  all: { type: 'boolean' },
  status: { type: 'boolean' },
  'playlists-only': { type: 'boolean' },
  target: { type: 'string' },
  ...Object.fromEntries(VECTORS.map(vector => [vector, { type: 'string' }])),
};

/** `{ status: true }` or the per-vector limits (0 = off) and the track target. */
export function buildCrawlPlan(argv, env = {}) {
  const flags = parseFlags(OPTIONS, { argv, env });
  if (flags.status) return { status: true };

  const limits = {};
  for (const vector of VECTORS) {
    limits[vector] = intFlag(flags, vector) ?? (flags.all ? DEFAULT_VECTOR_LIMITS[vector] : 0);
  }
  if (flags['playlists-only']) {
    for (const vector of VECTORS) if (vector !== 'playlists') limits[vector] = 0;
    limits.playlists ||= DEFAULT_VECTOR_LIMITS.playlists;
  }
  if (!Object.values(limits).some(Boolean)) {
    throw new UsageError('Choose at least one vector, --all, or --status.');
  }
  return { status: false, targetTracks: intFlag(flags, 'target') ?? DEFAULT_TARGET, ...limits };
}

function printStats(stats) {
  console.log('\nCatalog status');
  console.log(`  Artists:                 ${stats.artists.toLocaleString()}`);
  console.log(`  Tracks:                  ${stats.tracks.toLocaleString()}`);
  console.log(`  Audio samples:           ${stats.audioSamples.toLocaleString()}`);
  console.log(`  ISRC registrant codes:   ${(stats.countryCodes || 0).toLocaleString()}`);
  console.log(`  Languages:               ${(stats.languages || 0).toLocaleString()}`);
  console.log(`  Provider links:          ${stats.providerLinks.toLocaleString()}`);
  console.log(`  Cross-referenced tracks: ${stats.crossReferencedTracks.toLocaleString()}\n`);
}

async function main(plan) {
  if (plan.status) {
    printStats(sqliteCatalog.getStats());
    return;
  }

  const { targetTracks } = plan;
  console.log(`Crawl plan: ${JSON.stringify(plan)}`);
  console.log(`Catalog now holds ${sqliteCatalog.countSummary().tracks.toLocaleString()} tracks`);
  const startTime = Date.now();

  process.on('SIGINT', () => {
    console.log('\nStopping the crawler...');
    musicHarvester.stop();
  });

  const harvestStats = await musicHarvester.runFullHarvest({
    targetTracks,
    chartsLimit: plan.charts,
    playlistsLimit: plan.playlists,
    decadesLimit: plan.decades,
    artistsLimit: plan.artists,
    lexiconLimit: plan.lexicon,
    onProgress: (prog) => {
      const { artists, tracks, rejections } = prog.currentStats;
      const pct = Math.min(100, (tracks / targetTracks) * 100).toFixed(1);
      const action = (prog.currentAction || '').slice(0, 32).padEnd(32);
      const rejected = Object.values(rejections || {}).reduce((sum, n) => sum + n, 0);
      process.stdout.write(
        `\r[${pct}%] ${action} | Artists: ${artists.toLocaleString()} | Tracks: ${tracks.toLocaleString()} | Rejected: ${rejected.toLocaleString()}`
      );
    },
  });

  console.log(`\n\nCrawl finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`  Apple chart tracks matched: ${harvestStats.chartTracksMatched}`);
  console.log(`  Playlists crawled:          ${harvestStats.playlistsCrawled}`);
  console.log(`  Decade queries crawled:     ${harvestStats.decadeQueriesCrawled}`);
  console.log(`  Artists crawled:            ${harvestStats.artistsCrawled} (skipped, out-of-scope language: ${harvestStats.artistsSkipped})`);
  console.log(`  Lexicon words crawled:      ${harvestStats.lexiconWordsCrawled}`);
  console.log(`  Inserted: ${harvestStats.totalInserted}, merged: ${harvestStats.totalMerged}`);
  console.log(`  Rejected by admission policy: ${JSON.stringify(sqliteCatalog.getRejectionStats())}`);
  printStats(sqliteCatalog.getStats());
}

if (import.meta.main) {
  const plan = parseOrExit(() => buildCrawlPlan(process.argv.slice(2), process.env), USAGE);
  main(plan)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Crawl failed:', err);
      process.exit(1);
    });
}
