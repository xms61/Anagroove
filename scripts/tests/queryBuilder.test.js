import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEEZER_GENRE_TAXONOMY } from '../../server/services/deezerMusicProvider.js';
import { parsePrompt, buildQueryPlan, generateThemeVariations } from '../../server/services/queryBuilder.js';
import { validateLivePuzzlePayload } from '../../server/validators.js';

const years = (parsed) => [parsed.yearRange?.start, parsed.yearRange?.end];

// [prompt, check]
const PROMPTS = [
  ['obscure 80s synth-pop by Daft Punk', p => assert.deepEqual([p.popularity, p.decade, p.artist, p.genre], ['obscure', '1980s', 'Daft Punk', 'synth-pop'])],
  ['anime from the years 2020-2026', p => assert.deepEqual([p.genre, p.artist, ...years(p)], ['anime', undefined, 2020, 2026])],
  ['rock between 1970 and 1976', p => assert.deepEqual([p.genre, ...years(p)], ['rock', 1970, 1976])],
  ['90s grunge before 1994', p => assert.deepEqual([p.genre, years(p)[1]], ['grunge', 1993])],
  ['k-pop after 2018', p => assert.deepEqual([p.genre, years(p)[0]], ['k-pop', 2019])],
  ['soundtracks in 1999', p => assert.deepEqual([p.genre, ...years(p)], ['soundtracks', 1999, 1999])],
  ['songs by Daft Punk', p => assert.deepEqual([p.artist?.toLowerCase(), p.genre], ['daft punk', undefined])],
  ['Queen', p => assert.deepEqual([p.artist, p.genre], ['Queen', undefined])],
  ['new gen kpop', p => assert.deepEqual([p.genre, p.generation, ...years(p)], ['kpop', 'new', 2020, 2026])],
  ['3rd gen kpop', p => assert.deepEqual([p.genre, p.generation, ...years(p)], ['kpop', '3rd', 2012, 2019])],
];
for (const [prompt, check] of PROMPTS) {
  test(`parsePrompt("${prompt}")`, () => check(parsePrompt(prompt)));
}

test('pure popularity clears the fan and rank filters', () => {
  const plan = buildQueryPlan({ popularity: 'pure' });
  assert.equal(plan.popularity, 'pure');
  assert.equal(plan.minFans, 0);
  assert.equal(plan.minRank, 0);
  assert.ok(plan.deezerSearches.length > 0);
});

test('the default plan is balanced with a fan threshold', () => {
  const plan = buildQueryPlan({ genre: 'all' });
  assert.equal(plan.popularity, 'balanced');
  assert.ok(plan.minFans >= 25000);
});

test('an anime plan searches "anime opening", never the bare word (DJ AniMe)', () => {
  const plan = buildQueryPlan({ genre: 'anime' });
  assert.equal(plan.genre, 'anime');
  assert.ok(plan.deezerSearches.includes('anime opening'));
  assert.ok(!plan.deezerSearches.includes('anime'));
  assert.ok(plan.deezerSearches.every(s => !/^[a-z]{2}$/.test(s)), 'no two-letter seeds');
});

test('a prompt overrides genre=all and adds a decade search', () => {
  const plan = buildQueryPlan({ prompt: '80s Japanese City Pop', genre: 'all' });
  assert.equal(plan.genre, 'Japanese City Pop');
  assert.ok(plan.deezerSearches.includes('Japanese City Pop'));
  assert.ok(plan.deezerSearches.includes('Japanese City Pop 1980s'));
  assert.ok(plan.deezerSearches.every(s => !/^[a-z]{2}$/.test(s)));
});

test('theme variations keep the core subgenre and add known synonyms', () => {
  const cityPop = generateThemeVariations('Japanese City Pop', '1980s');
  assert.ok(cityPop.includes('City Pop') || cityPop.includes('Japanese Citypop'));
  assert.ok(!cityPop.includes('Japanese Pop'));
  const frenchHouse = generateThemeVariations('French House');
  assert.ok(frenchHouse.includes('french touch') || frenchHouse.includes('French House'));
  const kpop = generateThemeVariations('kpop');
  assert.ok(!kpop.some(v => v.startsWith('gen ')) && !kpop.includes('kpop hits'));
});

test('every UI theme is a valid genre with a live Deezer configuration', () => {
  for (const theme of ['mixed', 'kpop', 'anime', 'gaming', 'pop', 'rock', 'hiphop', 'edm', 'cinematic', 'latin', 'poppunk']) {
    assert.equal(validateLivePuzzlePayload({ genre: theme }).data?.genre, theme, theme);
    const config = DEEZER_GENRE_TAXONOMY[theme];
    assert.ok(config && (config.chartId !== undefined || config.searches?.length > 0) && config.minFans > 0 && config.minRank > 0, theme);
  }
  assert.ok(DEEZER_GENRE_TAXONOMY.all && DEEZER_GENRE_TAXONOMY.electronic, 'aliases');
  assert.ok(DEEZER_GENRE_TAXONOMY.anime.minFans >= 25000);
});
