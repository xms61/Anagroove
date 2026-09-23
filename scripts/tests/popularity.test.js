import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { DEEZER_PLACEHOLDER_RANK, normalizeDeezerRank, provisionalPopularity, PROVISIONAL_POPULARITY } from '../../server/db/trackNormalization.js';
import {
  findCoverActs,
  findTracksBelowFloor,
  isAbovePopularityFloor,
  MIN_DEEZER_RANK,
  recomputeCatalogPopularity,
} from '../../server/db/catalogPopularity.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.ts';
import { POPULARITY_SAMPLING, popularityWeight } from '../../server/selection/candidates.js';

test('the Deezer placeholder rank and invalid ranks are unknown', () => {
  assert.equal(normalizeDeezerRank(DEEZER_PLACEHOLDER_RANK), null);
  for (const bad of [0, -5, NaN, null, undefined, 'abc']) assert.equal(normalizeDeezerRank(bad), null);
  assert.equal(normalizeDeezerRank(562000), 562000);
  assert.equal(normalizeDeezerRank('99999.6'), null, 'rounds to the placeholder');
});

test('a new row scores its Spotify popularity, else the middle for a Deezer rank, else 0', () => {
  assert.equal(provisionalPopularity({ spotifyPopularity: 82, deezerRank: 10 }), 82);
  assert.equal(provisionalPopularity({ spotifyPopularity: 150 }), 100);
  assert.equal(provisionalPopularity({ deezerRank: 700000 }), PROVISIONAL_POPULARITY);
  assert.equal(provisionalPopularity({ deezerRank: DEEZER_PLACEHOLDER_RANK }), 0);
  assert.equal(provisionalPopularity({}), 0);
});

/** English tracks with the given Deezer ranks (null = unranked), one artist each. */
function catalogWithRanks(ranks, { spotify = {}, fans = 0, enriched = true } = {}) {
  const catalog = new SqliteCatalog(':memory:');
  const ids = ranks.map((rank, i) => catalog.upsertTrack({
    title: `Song Number ${i}`,
    artist: `Artist ${i}`,
    durationMs: 200000,
    provider: 'deezer',
    providerTrackId: String(1000 + i),
    deezerRank: rank,
    spotifyPopularity: spotify[i] ?? null,
  }).trackId);
  catalog.db.prepare(`UPDATE artists SET fans_count = ?, enriched_at = ${enriched ? "datetime('now')" : 'NULL'}`).run(fans);
  const score = (i) => catalog.db.prepare('SELECT popularity FROM tracks WHERE id = ?').get(ids[i]).popularity;
  return { catalog, score };
}

test('the score is the percentile within the language, and a Spotify popularity can only raise it', () => {
  const { catalog, score } = catalogWithRanks([200000, 400000, 600000, 800000, 1000000, null], { spotify: { 0: 90 } });
  recomputeCatalogPopularity(catalog.db);
  assert.deepEqual([1, 2, 3, 4].map(score), [25, 50, 75, 100]);
  assert.equal(score(0), 90, 'percentile 0, Spotify 90');
  assert.equal(score(5), 0, 'no rank and no Spotify');
  assert.equal(recomputeCatalogPopularity(catalog.db), 0, 'a second run changes nothing');
  catalog.close();
});

test('each language is ranked on its own', () => {
  const catalog = new SqliteCatalog(':memory:');
  const put = (title, artist, rank, isrc) => catalog.upsertTrack({ title, artist, durationMs: 200000, provider: 'deezer', providerTrackId: title, deezerRank: rank, isrc }).trackId;
  const en = [put('Low English', 'A', 900000), put('High English', 'B', 990000)];
  const ko = [put('봄날', 'C', 200000, 'KRA402300001'), put('사랑', 'D', 250000, 'KRA402300002')];
  recomputeCatalogPopularity(catalog.db);
  const score = (id) => catalog.db.prepare('SELECT popularity FROM tracks WHERE id = ?').get(id).popularity;
  assert.deepEqual([...en, ...ko].map(score), [0, 100, 0, 100], 'a low Korean rank is still the top of Korean');
  catalog.close();
});

// [language, Deezer rank, Spotify popularity, expected]
const FLOOR_CASES = [
  ['en', MIN_DEEZER_RANK.en, null, true],
  ['en', MIN_DEEZER_RANK.en - 1, null, false],
  ['ja', MIN_DEEZER_RANK.ja, null, true],
  ['ko', MIN_DEEZER_RANK.en, null, false],
  ['en', null, 30, true],
  ['en', null, 29, false],
  ['en', null, null, false],
];
for (const [language, deezerRank, spotifyPopularity, expected] of FLOOR_CASES) {
  test(`isAbovePopularityFloor(${language}, rank ${deezerRank}, Spotify ${spotifyPopularity}) is ${expected}`, () => {
    assert.equal(isAbovePopularityFloor({ language, deezerRank, spotifyPopularity }), expected);
  });
}

test('tracks under the floor are judged only once their artist is enriched, and 5,000 fans keep them', () => {
  const low = MIN_DEEZER_RANK.en - 1;
  const high = MIN_DEEZER_RANK.en;
  const enriched = catalogWithRanks([low, high, null]);
  assert.equal(findTracksBelowFloor(enriched.catalog.db).below.length, 2, 'the low rank and the unranked track');
  enriched.catalog.close();

  const famous = catalogWithRanks([low, null], { fans: 5000 });
  assert.equal(findTracksBelowFloor(famous.catalog.db).below.length, 0);
  famous.catalog.close();

  const unknown = catalogWithRanks([low, null], { enriched: false });
  assert.deepEqual(findTracksBelowFloor(unknown.catalog.db), { below: [], unjudged: 2 });
  unknown.catalog.close();
});

/** Five famous originals and a small act that recorded four of them plus one own song. */
function coverActCatalog({ coverFans = 2000 } = {}) {
  const catalog = new SqliteCatalog(':memory:');
  const titles = ['Billie Jean', 'Hey Jude', 'Wonderwall', 'Creep', 'Yesterday'];
  let id = 1;
  const put = (title, artist) => catalog.upsertTrack({ title, artist, durationMs: 200000, provider: 'deezer', providerTrackId: String(id++), deezerRank: 900000 });
  titles.forEach((title, i) => put(title, `Legend ${i}`));
  titles.slice(0, 4).forEach(title => put(title, 'Sunset Chasers'));
  put('Our Own Song', 'Sunset Chasers');
  catalog.db.prepare("UPDATE artists SET enriched_at = datetime('now'), fans_count = CASE WHEN display_name = 'Sunset Chasers' THEN ? ELSE 5000000 END").run(coverFans);
  return catalog;
}

test('an act that mostly records more famous artists\' songs is a cover act', () => {
  const catalog = coverActCatalog();
  assert.deepEqual(findCoverActs(catalog.db).map(act => [act.name, act.tracks, act.copied]), [['Sunset Chasers', 5, 4]]);
  catalog.close();
  const popular = coverActCatalog({ coverFans: 60000 });
  assert.deepEqual(findCoverActs(popular.db), [], '50,000+ fans is a real act');
  popular.close();
});

test('the cleanup popularity step removes cover acts and low tracks; the dry run matches and a second run changes nothing', () => {
  const catalog = coverActCatalog();
  catalog.upsertTrack({ title: 'Nobody Knows This', artist: 'Tiny Act', durationMs: 200000, provider: 'deezer', providerTrackId: '99', deezerRank: 1000 });
  catalog.db.prepare("UPDATE artists SET enriched_at = datetime('now'), fans_count = 10 WHERE display_name = 'Tiny Act'").run();

  const step = (result) => result.steps.find(s => s.name === 'popularity');
  const dry = step(runCatalogCleanup(catalog.db, { steps: ['popularity'] }));
  const applied = step(runCatalogCleanup(catalog.db, { steps: ['popularity'], apply: true }));
  assert.deepEqual([dry.coverTracks, dry.belowFloor], [5, 1]);
  assert.deepEqual([applied.coverTracks, applied.belowFloor], [5, 1]);
  assert.equal(step(runCatalogCleanup(catalog.db, { steps: ['popularity'], apply: true })).deleted, 0);
  catalog.close();
});

test('selection windows: mainstream is the top quarter, balanced drops the bottom 30%', () => {
  assert.deepEqual(POPULARITY_SAMPLING.mainstream, { minPopularity: 75, maxPopularity: 100, alpha: 2 });
  assert.deepEqual(POPULARITY_SAMPLING.balanced, { minPopularity: 30, maxPopularity: 100, alpha: 1 });
  assert.equal(POPULARITY_SAMPLING.obscure.maxPopularity, 50);
  assert.equal(POPULARITY_SAMPLING.pure.alpha, 0);
  assert.equal(popularityWeight(90, 0), popularityWeight(5, 0), 'alpha 0 is uniform');
  assert.ok(popularityWeight(90, 2) > popularityWeight(90, 1) * 10);
});
