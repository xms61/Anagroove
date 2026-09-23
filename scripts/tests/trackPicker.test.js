import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrackPicker } from '../../server/selection/trackPicker.js';

const never = () => 0;
const picker = (queryPlan, options = {}) => createTrackPicker({ count: 10, queryPlan: { genre: 'all', ...queryPlan }, recentCount: never, ...options });

test('a named artist never becomes a grid answer, and their songs never use artist clues', () => {
  const { songs, pick } = picker({ artist: 'Dolly Parton' });
  pick([
    { title: 'Dolly', artist: 'Dolly Parton', language: 'en' },
    { title: 'Jolene', artist: 'Dolly Parton', language: 'en' },
    { title: 'Coat of Many Colors', artist: 'Dolly Parton', language: 'en' },
  ], 0);
  const answers = songs.map(s => s.answer);
  assert.ok(answers.length >= 2, 'several songs by the named artist are allowed');
  assert.ok(!answers.includes('DOLLY') && !answers.includes('PARTON') && !answers.includes('DOLLYPARTON'));
  assert.ok(songs.every(s => s.clueType !== 'Artist name'));
});

test('an anime keyphrase is banned as an answer when the prompt targets it', () => {
  const { songs, pick } = picker({ genre: 'anime' }, { animeKeyphrase: 'gundam', isTargetingAnimeKeyphrase: true });
  pick([
    { title: 'Gundam', artist: 'Band A', language: 'ja', isAnimeOped: true, animeTitle: 'Gundam' },
    { title: 'Just Communication', artist: 'TWO-MIX', language: 'ja', isAnimeOped: true, animeTitle: 'Mobile Suit Gundam Wing' },
  ], 0);
  assert.ok(songs.length >= 1);
  assert.ok(songs.every(s => s.answer !== 'GUNDAM'));
});

test('without a named artist, each artist appears once', () => {
  const { songs, rejections, pick } = picker({});
  pick([
    { title: 'Bohemian Rhapsody', artist: 'Queen', language: 'en' },
    { title: 'Radio Ga Ga', artist: 'Queen', language: 'en' },
    { title: 'Wonderwall', artist: 'Oasis', language: 'en' },
  ], 0);
  assert.deepEqual(songs.map(s => s.artist), ['Queen', 'Oasis']);
  assert.equal(rejections.duplicateArtist, 1);
});

test('tracks played more often than maxPlays wait for a later tier', () => {
  const plays = { Wonderwall: 2 };
  const { songs, rejections, pick } = picker({}, { recentCount: t => plays[t.title] || 0 });
  const candidates = [{ title: 'Wonderwall', artist: 'Oasis', language: 'en' }, { title: 'Creep', artist: 'Radiohead', language: 'en' }];
  pick(candidates, 1);
  assert.deepEqual(songs.map(s => s.title), ['Creep']);
  assert.equal(rejections.recent, 1);
  pick(candidates, 3);
  assert.deepEqual(songs.map(s => s.title), ['Creep', 'Wonderwall']);
});
