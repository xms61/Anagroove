import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsageError, intFlag, listFlag, parseFlags } from '../lib/cli.ts';
import { buildEnrichPlan, DEFAULT_LIMITS } from '../enrich_catalog.ts';
import { buildCrawlPlan, DEFAULT_VECTOR_LIMITS } from '../crawl_catalog.ts';

const OFF = { albums: null, deezer: null, artists: null, itunes: null };

const ENRICH_CASES: [string, Record<string, number | null>][] = [
  ['--albums=5', { ...OFF, albums: 5 }],
  ['--albums 30000', { ...OFF, albums: 30000 }],
  ['--artists=80000 --deezer=10', { ...OFF, artists: 80000, deezer: 10 }],
  ['--all', { ...DEFAULT_LIMITS }],
  ['--all --artists=80000', { ...DEFAULT_LIMITS, artists: 80000 }],
];
for (const [args, expected] of ENRICH_CASES) {
  test(`enrich plan: ${args}`, () => {
    assert.deepEqual(buildEnrichPlan(args.split(' ')), expected);
  });
}

const USAGE_ERRORS: [name: string, argv: string[]][] = [
  ['no flags runs nothing instead of every step', []],
  ['a typo is an error, not "run everything"', ['--album=500']],
  ['a non-numeric limit', ['--albums=lots']],
  ['a negative limit', ['--albums=-5']],
  ['a limit without a value', ['--albums']],
  ['a positional argument', ['albums']],
  ['the removed --languages step (now catalog:recompute)', ['--languages']],
];
for (const [name, argv] of USAGE_ERRORS) {
  test(`enrich plan: ${name}`, () => {
    assert.throws(() => buildEnrichPlan(argv), UsageError);
  });
}

test('flags swallowed by npm (no "--") are reported with the fix', () => {
  assert.throws(
    () => buildEnrichPlan([], { npm_config_albums: '5' }),
    err => err instanceof UsageError && /--albums/.test(err.message) && /npm run <script> -- --flag/.test(err.message)
  );
  assert.throws(() => parseFlags({ 'no-backup': { type: 'boolean' } }, { argv: [], env: { npm_config_backup: '' } }), /--no-backup/);
});

test('crawl plan: only named vectors run, --all uses the defaults', () => {
  assert.deepEqual(buildCrawlPlan(['--artists=250']), {
    status: false, targetTracks: 500000, charts: 0, playlists: 0, decades: 0, cjk: 0, artists: 250, lexicon: 0,
  });
  assert.deepEqual(buildCrawlPlan(['--all', '--target=1000']), { status: false, targetTracks: 1000, ...DEFAULT_VECTOR_LIMITS });
  const playlistsOnly = buildCrawlPlan(['--playlists-only']);
  assert.ok(playlistsOnly.status === false);
  assert.equal(playlistsOnly.playlists, DEFAULT_VECTOR_LIMITS.playlists);
  assert.equal(playlistsOnly.artists, 0);
  assert.deepEqual(buildCrawlPlan(['--status']), { status: true });
});

test('crawl plan: no vector or an unknown flag is a usage error', () => {
  assert.throws(() => buildCrawlPlan([]), UsageError);
  assert.throws(() => buildCrawlPlan(['--target=1000']), UsageError);
  assert.throws(() => buildCrawlPlan(['--bigrams=5']), UsageError);
});

test('list flags reject values outside the allowed set', () => {
  assert.deepEqual(listFlag({ steps: 'text, policy' }, 'steps', ['text', 'policy', 'fields']), ['text', 'policy']);
  assert.throws(() => listFlag({ steps: 'text,polcy' }, 'steps', ['text', 'policy']), /polcy/);
  assert.equal(intFlag({}, 'limit'), undefined);
});
