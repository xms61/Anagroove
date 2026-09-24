import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrompt, buildQueryPlan, type PromptOptions } from '../../server/services/queryBuilder.ts';

const years = (parsed) => [parsed.yearRange?.start, parsed.yearRange?.end];

// [prompt, check]
const PROMPTS: [prompt: string, check: (parsed: PromptOptions) => void][] = [
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

test('the default plan is balanced, for every genre, with no artist', () => {
  const plan = buildQueryPlan({ genre: 'all' });
  assert.deepEqual([plan.popularity, plan.genre, plan.artist], ['balanced', 'all', '']);
  assert.equal(buildQueryPlan({ popularity: 'pure' }).popularity, 'pure');
});

test('a prompt overrides genre=all and keeps its decade', () => {
  const plan = buildQueryPlan({ prompt: '80s Japanese City Pop', genre: 'all' });
  assert.deepEqual([plan.genre, plan.decade, plan.artist], ['Japanese City Pop', '1980s', '']);
});

test('a prompt naming an artist puts the artist in the plan (the only live lookup), in every language', () => {
  const plan = buildQueryPlan({ prompt: 'songs by Queen' });
  assert.deepEqual([plan.artist.toLowerCase(), plan.languages], ['queen', ['en', 'ja', 'ko']]);
  assert.equal(buildQueryPlan({ genre: 'rock', artist: 'AC/DC' }).artist, 'AC/DC');
  assert.equal(buildQueryPlan({ genre: 'kpop' }).languages, null, 'the theme decides');
});
