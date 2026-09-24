import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { DATA_DIR } from '../../server/paths.ts';
import { buildFixtureCatalog } from './fixtures/fixtureCatalog.ts';
import { averageOverlap, measureTarget } from '../../server/selection/coverage.ts';
import { sqliteCatalog } from '../../server/db/sqliteCatalog.ts';

before(() => {
  process.env.SPOTYSPICE_OFFLINE = '1';
  // The catalog singleton opens this file (the test process has its own temp data dir)
  buildFixtureCatalog(path.join(DATA_DIR, 'catalog.sqlite'));
});

test('averageOverlap is 0 for disjoint puzzles and 1 for identical ones', () => {
  assert.equal(averageOverlap([['a', 'b'], ['c', 'd']]), 0);
  assert.equal(averageOverlap([['a', 'b'], ['a', 'b'], ['a', 'b']]), 1);
  assert.equal(averageOverlap([['a', 'b'], ['b', 'c']]), 1 / 3);
});

test('the Mixed theme on the fixture catalog fills varied 12-song puzzles offline', async () => {
  const result = await measureTarget({ catalog: sqliteCatalog, label: 'theme: all', genre: 'all' });
  assert.equal(result.kind, 'theme');
  assert.ok(result.tracks > 0 && result.artists > 0);
  assert.deepEqual(Object.keys(result.languages), ['en'], 'Mixed is English only');
  assert.equal(result.puzzleSongs, 12);
  assert.ok(result.overlap < 0.5, `overlap ${result.overlap}`);
  assert.equal(result.ok, false, 'the 92-track fixture is below the 150-track theme target');
});

test('an artist prompt is measured against the artist target', async () => {
  const result = await measureTarget({ catalog: sqliteCatalog, label: 'nobody', prompt: 'songs by Nobody Real' });
  assert.equal(result.kind, 'artist');
  assert.equal(result.tracks, 0);
  assert.equal(result.ok, false);
});
