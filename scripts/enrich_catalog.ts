#!/usr/bin/env node
import type { ParseArgsOptionsConfig } from 'node:util';
import '../server/config.ts';
import { sqliteCatalog } from '../server/db/sqliteCatalog.ts';
import { catalogEnricher, type EnrichProgress } from '../server/crawler/enricher.ts';
import { UsageError, intFlag, parseFlags, parseOrExit } from './lib/cli.ts';

const USAGE = `
Fills catalog metadata from provider APIs. Resumable: rerun to continue.

  npm run catalog:enrich -- --albums=5000             release dates by album (one request per album)
  npm run catalog:enrich -- --deezer=5000             Deezer track lookups: ISRC, release date, rank; Spotify-only tracks get their Deezer link by ISRC
  npm run catalog:enrich -- --artists=1000            artist fans and genres
  npm run catalog:enrich -- --itunes=200              strict iTunes cross-reference (~15 req/min: keep it small)
  npm run catalog:enrich -- --all                     every step with default limits
  npm run catalog:enrich -- --all --artists=80000     every step, one limit overridden

Steps can be combined. Flags must follow "--". Afterwards run \`npm run catalog:recompute\`.`;

export const DEFAULT_LIMITS = Object.freeze({ albums: 2000, deezer: 2000, artists: 500, itunes: 100 });
type Step = keyof typeof DEFAULT_LIMITS;
const LIMIT_STEPS = Object.keys(DEFAULT_LIMITS) as Step[];

/** A limit per step; null skips the step. */
export type EnrichPlan = Record<Step, number | null>;

const OPTIONS: ParseArgsOptionsConfig = {
  all: { type: 'boolean' },
  ...Object.fromEntries(LIMIT_STEPS.map(step => [step, { type: 'string' }])),
};

/** Steps and limits to run. A step is skipped when its value is null/false. */
export function buildEnrichPlan(argv: string[], env: NodeJS.ProcessEnv = {}): EnrichPlan {
  const flags = parseFlags(OPTIONS, { argv, env });
  const plan = {} as EnrichPlan;
  for (const step of LIMIT_STEPS) {
    plan[step] = intFlag(flags, step) ?? (flags.all ? DEFAULT_LIMITS[step] : null);
  }
  if (!Object.values(plan).some(Boolean)) {
    throw new UsageError('Choose at least one step, or --all.');
  }
  return plan;
}

const progress = (p: EnrichProgress) => {
  const counts = Object.entries(p).filter(([key]) => !['step', 'checked', 'total'].includes(key));
  process.stdout.write(`\r  [${p.step}] ${p.checked}/${p.total} checked ${JSON.stringify(Object.fromEntries(counts))}   `);
};

async function main(plan: EnrichPlan) {
  const started = Date.now();
  console.log(`Catalog enrichment plan: ${JSON.stringify(plan)}`);

  process.on('SIGINT', () => {
    console.log('\nStopping after the current request...');
    catalogEnricher.stop();
  });

  if (plan.albums) {
    console.log(`\n- Deezer album release dates (up to ${plan.albums} albums)`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.enrichAlbums({ limit: plan.albums, onProgress: progress }))}`);
  }
  if (plan.deezer) {
    console.log(`\n- Deezer track lookups (up to ${plan.deezer})`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.enrichDeezerTracks({ limit: plan.deezer, onProgress: progress }))}`);
  }
  if (plan.artists) {
    console.log(`\n- Artist fans and genres (up to ${plan.artists})`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.enrichArtists({ limit: plan.artists, onProgress: progress }))}`);
  }
  if (plan.itunes) {
    console.log(`\n- iTunes cross-reference (up to ${plan.itunes})`);
    console.log(`\n  ${JSON.stringify(await catalogEnricher.crossReferenceItunes({ limit: plan.itunes, onProgress: progress }))}`);
  }

  sqliteCatalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (import.meta.main) {
  const plan = parseOrExit(() => buildEnrichPlan(process.argv.slice(2), process.env), USAGE);
  main(plan).catch(err => {
    console.error('Enrichment failed:', err);
    process.exit(1);
  });
}
