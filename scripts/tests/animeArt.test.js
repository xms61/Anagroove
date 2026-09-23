import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAnswerKeyword,
  extractAllAnswerCandidates,
  formatCrosswordClue,
  containsAnswerLeak,
} from '../../shared/musicKeywords.ts';
import { buildQueryPlan, extractAnimeKeyphrase } from '../../server/services/queryBuilder.js';
import { resolveAnimeCoverImages } from '../../server/services/animeImageService.js';
import { AnimeCatalog } from '../../server/db/animeCatalog.ts';

const KEYPHRASES = [
  ['anime gundam', 'gundam'],
  ['anime openings naruto', 'naruto'],
  ['bleach anime ost', 'bleach'],
  ['anime', ''],
  ['anime from the 90s', ''],
];
for (const [prompt, expected] of KEYPHRASES) {
  test(`extractAnimeKeyphrase("${prompt}") is "${expected}"`, () => {
    assert.equal(extractAnimeKeyphrase(prompt), expected);
  });
}

test('the query plan carries the anime keyphrase, or null for a generic prompt', () => {
  assert.equal(buildQueryPlan({ prompt: 'anime gundam' }).targetAnimeKeyphrase, 'gundam');
  assert.equal(buildQueryPlan({ prompt: 'anime' }).targetAnimeKeyphrase, null);
});

const SOLA = {
  title: 'Colorless wind',
  song_title: 'Colorless wind',
  artist: 'Aira Yuuki',
  artist_name: 'Aira Yuuki',
  animeTitle: 'Sola',
  themeType: 'OP',
  themeSlug: 'OP2',
  releaseYear: 2007,
  isAnimeOped: true,
};

/** Keyword and clue for the requested clue type. */
function clueFor(preferredType, extra = {}) {
  const keyword = extractAnswerKeyword(SOLA.title, SOLA.artist, { preferredType, animeTitle: SOLA.animeTitle, ...extra });
  const clue = formatCrosswordClue(SOLA, keyword);
  return { keyword, clue, lower: clue.toLowerCase() };
}

test('an anime theme offers the anime title, song title and artist as answers', () => {
  const candidates = extractAllAnswerCandidates(SOLA.title, SOLA.artist, { animeTitle: SOLA.animeTitle });
  assert.equal(candidates.anime?.answer, 'SOLA');
  assert.equal(candidates.title?.answer, 'COLORLESSWIND');
  assert.equal(candidates.artist?.answer, 'AIRAYUUKI');
});

test('an anime-title clue never names the anime', () => {
  const { keyword, clue, lower } = clueFor('anime');
  assert.equal(keyword.clueType, 'Anime title');
  assert.equal(keyword.answer, 'SOLA');
  assert.ok(!lower.includes('sola'));
  assert.ok(!containsAnswerLeak(clue, keyword.answer));
});

test('an artist clue never names the artist and gives the anime as context', () => {
  const { keyword, clue, lower } = clueFor('artist', { allowArtist: true });
  assert.equal(keyword.clueType, 'Artist name');
  assert.equal(keyword.answer, 'AIRAYUUKI');
  assert.ok(!lower.includes('aira') && !lower.includes('yuuki'));
  assert.ok(clue.includes('Sola'));
  assert.ok(!containsAnswerLeak(clue, keyword.answer));
});

test('a song-title clue names neither the title nor the artist', () => {
  const { keyword, clue, lower } = clueFor('title');
  assert.equal(keyword.clueType, 'Song title');
  assert.ok(!lower.includes('colorless') && !lower.includes('wind'));
  assert.ok(!lower.includes('aira yuuki'));
  assert.ok(!containsAnswerLeak(clue, keyword.answer));
});

test('a keyword clue names neither the keyword nor the artist', () => {
  const { keyword, clue, lower } = clueFor('keyword');
  assert.equal(keyword.clueType, 'Song title keyword');
  assert.ok(!lower.includes(keyword.answer.toLowerCase()));
  assert.ok(!lower.includes('aira yuuki'));
  assert.ok(!containsAnswerLeak(clue, keyword.answer));
});

function gundamCatalog() {
  const db = new AnimeCatalog(':memory:');
  const trackId = db.upsertAnimeTrack({
    animeTitle: 'Mobile Suit Gundam Wing',
    songTitle: 'Just Communication',
    artistName: 'TWO-MIX',
    themeType: 'OP',
    themeNumber: 1,
    year: 1995,
    originalFilePath: '/test/gundam_op1.webm',
  });
  db.insertSample({ animeTrackId: trackId, sampleIndex: 1, samplePath: '/test/samples/gundam_1.mp3', sampleUrl: '/audio/anime/gundam_1.mp3', offsetSeconds: 10 });
  return { db, trackId };
}

test('cover art is stored per track and per series and served with the track', () => {
  const { db, trackId } = gundamCatalog();
  const first = () => db.getRandomAnimeTracks({ count: 5 })[0];
  assert.equal(first().albumArt, '');

  assert.equal(db.updateTrackImageUrl(trackId, 'https://s4.anilist.co/file/gundam_wing.jpg'), true);
  assert.equal(first().albumArt, 'https://s4.anilist.co/file/gundam_wing.jpg');
  assert.equal(first().imageUrl, 'https://s4.anilist.co/file/gundam_wing.jpg');

  assert.equal(db.updateAnimeCoverByTitle('Mobile Suit Gundam Wing', 'https://s4.anilist.co/file/gundam_series.jpg'), 1);
  assert.equal(first().albumArt, 'https://s4.anilist.co/file/gundam_series.jpg');
  db.close();
});

test('resolveAnimeCoverImages keeps artwork a track already has', async () => {
  const { db } = gundamCatalog();
  const [resolved] = await resolveAnimeCoverImages([
    { id: 'anime_1', animeTitle: 'Mobile Suit Gundam Wing', albumArt: 'https://s4.anilist.co/existing.jpg', isAnimeOped: true },
  ], { animeDb: db });
  assert.equal(resolved.albumArt, 'https://s4.anilist.co/existing.jpg');
  db.close();
});
