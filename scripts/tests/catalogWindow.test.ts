import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, weightedOrder } from '../../server/selection/random.ts';
import { catalogCandidates } from '../../server/selection/candidates.ts';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.ts';
import type { QueryPlan } from '../../server/services/queryBuilder.ts';

test('the seeded RNG is reproducible and seed-dependent', () => {
  const a = createRng('seed-1');
  const b = createRng('seed-1');
  for (let i = 0; i < 3; i++) assert.equal(a(), b());
  assert.notEqual(createRng('seed-2')(), createRng('seed-1')());
});

test('weightedOrder puts a 9x heavier item first about 90% of the time', () => {
  const rng = createRng('weights');
  let heavyFirst = 0;
  for (let i = 0; i < 400; i++) {
    if (weightedOrder([{ id: 'light', w: 1 }, { id: 'heavy', w: 9 }], item => item.w, rng)[0].id === 'heavy') heavyFirst++;
  }
  assert.ok(heavyFirst > 320 && heavyFirst < 400, `${heavyFirst}/400`);
});

/** 30 tracks by 10 artists over 1980-1999, each with a Deezer and an iTunes sample. */
function thirtyTrackCatalog() {
  const catalog = new SqliteCatalog(':memory:');
  for (let i = 0; i < 30; i++) {
    catalog.upsertTrack({
      title: `Sample Song ${i}`, artist: `Sample Artist ${i % 10}`, durationMs: 200000, provider: 'deezer', providerTrackId: String(500 + i),
      deezerRank: 100000 + i * 20000, releaseYear: 1980 + (i % 20), sampleUrl: `https://cdn.test/${i}.mp3`,
    });
    catalog.insertSample(i + 1, { provider: 'itunes', providerTrackId: `it${i}`, sampleUrl: `https://it.test/${i}.m4a` });
  }
  return catalog;
}

test('the window wraps around and returns one row per track, preferring the Deezer sample', () => {
  const catalog = thirtyTrackCatalog();
  const rows = catalog.sampleCatalogTracks({ languages: ['en'], poolSize: 50, start: 0.5 });
  assert.equal(rows.length, 30);
  assert.equal(new Set(rows.map(r => r.id)).size, 30);
  assert.ok(rows.every(r => r.sample_url.startsWith('https://cdn.test/')));
  catalog.close();
});

test('the same start returns the same window', () => {
  const catalog = thirtyTrackCatalog();
  const ids = () => catalog.sampleCatalogTracks({ languages: ['en'], poolSize: 10, start: 0.25 }).map(r => r.id);
  assert.deepEqual(ids(), ids());
  catalog.close();
});

test('year, artist and text filters narrow the window in SQL', () => {
  const catalog = thirtyTrackCatalog();
  const eighties = catalog.sampleCatalogTracks({ yearRange: { start: 1980, end: 1989 }, poolSize: 50 });
  assert.equal(eighties.length, 20);
  assert.ok(eighties.every(r => r.release_year >= 1980 && r.release_year <= 1989));
  assert.equal(catalog.sampleCatalogTracks({ artist: 'Sample Artist 3', poolSize: 50 }).length, 3);
  assert.ok(catalog.sampleCatalogTracks({ ftsQuery: '"Song 1"', poolSize: 50 }).length >= 1);
  catalog.close();
});

test('the catalog window honours an explicit language filter', () => {
  const catalog = new SqliteCatalog(':memory:');
  catalog.upsertTrack({ title: 'Levitating', artist: 'Dua Lipa', durationMs: 203000, provider: 'deezer', providerTrackId: '901', deezerRank: 800000 });
  catalog.upsertTrack({ title: 'アイドル', artist: 'YOASOBI', durationMs: 213000, provider: 'deezer', providerTrackId: '902', deezerRank: 800000, isrc: 'JPU902300400' });
  const rows = catalogCandidates({ catalog, queryPlan: { genre: 'all', popularity: 'pure', languages: ['ja'] } as QueryPlan, prompt: '', rng: createRng('lang') });
  assert.deepEqual(rows.map(r => r.language), ['ja']);
  catalog.close();
});
