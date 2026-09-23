#!/usr/bin/env node
/**
 * Fills catalog metadata from provider APIs (resumable; rerun to continue).
 *
 *   npm run catalog:enrich                       # all steps with default limits
 *   npm run catalog:enrich -- --albums=5000      # only release dates by album, 5,000 albums
 *   npm run catalog:enrich -- --deezer=5000      # only Deezer track lookups, 5,000 tracks
 *   npm run catalog:enrich -- --artists=1000 --languages
 *   npm run catalog:enrich -- --itunes=200       # iTunes allows ~15 req/min: keep this small
 *
 * Steps: --albums[=N] (release dates, one request per album), --deezer[=N] (ISRC, release date, rank),
 *        --artists[=N] (fans, genres),
 *        --itunes[=N] (strict cross-reference), --languages (local recompute).
 */
import '../server/config.js';
import { sqliteCatalog } from '../server/db/sqliteCatalog.js';
import { catalogEnricher } from '../server/crawler/enricher.js';

const DEFAULT_LIMITS = { albums: 2000, deezer: 2000, artists: 500, itunes: 100 };
const args = process.argv.slice(2);

function stepLimit(name) {
  const arg = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!arg) return null;
  const value = parseInt(arg.split('=')[1], 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMITS[name];
}

const explicit = ['albums', 'deezer', 'artists', 'itunes', 'languages'].some(step => args.some(a => a.startsWith(`--${step}`)));
const plan = {
  albums: explicit ? stepLimit('albums') : DEFAULT_LIMITS.albums,
  deezer: explicit ? stepLimit('deezer') : DEFAULT_LIMITS.deezer,
  artists: explicit ? stepLimit('artists') : DEFAULT_LIMITS.artists,
  itunes: explicit ? stepLimit('itunes') : DEFAULT_LIMITS.itunes,
  languages: explicit ? args.includes('--languages') : true,
};

const progress = (p) => process.stdout.write(`\r  [${p.step}] ${p.checked}/${p.total} checked ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !['step', 'checked', 'total'].includes(k))))}   `);

process.on('SIGINT', () => {
  console.log('\nStopping after the current request...');
  catalogEnricher.stop();
});

async function main() {
  const started = Date.now();
  console.log(`Catalog enrichment plan: ${JSON.stringify(plan)}`);

  if (plan.albums) {
    console.log(`\n• Deezer album release dates (up to ${plan.albums} albums)`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.enrichAlbums({ limit: plan.albums, onProgress: progress }))}`);
  }
  if (plan.deezer) {
    console.log(`\n• Deezer track lookups (up to ${plan.deezer})`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.enrichDeezerTracks({ limit: plan.deezer, onProgress: progress }))}`);
  }
  if (plan.artists) {
    console.log(`\n• Artist fans & genres (up to ${plan.artists})`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.enrichArtists({ limit: plan.artists, onProgress: progress }))}`);
  }
  if (plan.itunes) {
    console.log(`\n• iTunes cross-reference (up to ${plan.itunes})`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.crossReferenceItunes({ limit: plan.itunes, onProgress: progress }))}`);
  }
  if (plan.languages) {
    console.log('\n• Recomputing artist & track languages');
    console.log(`  ${JSON.stringify(catalogEnricher.recomputeLanguages())}`);
  }

  sqliteCatalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
