import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAnswerKeyword,
  formatCrosswordClue,
  sanitizeClue,
  containsAnswerLeak,
} from '../../shared/musicKeywords.js';

const LEAKS = [
  ['[Anime] ED1 of "Mahou Sensei Negima!" by Yuu Kobayashi', 'YUUKOBAYASHI', true, 'the concatenated artist'],
  ['[Anime] ED1 of "Mahou Sensei Negima!" by Yuu Kobayashi', 'KOBAYASHI', true, 'one artist token'],
  ['Track by Bad Company', 'BADCOMPANY', true, 'a self-titled artist'],
  ['Performer behind the hit "Blinding Lights"', 'THEWEEKND', false, 'a clean clue'],
];
for (const [clue, answer, expected, what] of LEAKS) {
  test(`containsAnswerLeak: ${what} -> ${expected}`, () => {
    assert.equal(containsAnswerLeak(clue, answer), expected);
  });
}

test('sanitizeClue swaps a leaking clue for the fallback and keeps a clean one', () => {
  assert.equal(sanitizeClue('Track by Bad Company', 'BADCOMPANY', 'Fallback clue'), 'Fallback clue');
  assert.equal(sanitizeClue('Performer behind the hit "Blinding Lights"', 'THEWEEKND', 'Fallback clue'), 'Performer behind the hit "Blinding Lights"');
});

const NEGIMA = {
  title: 'Kagayaku Kimi e',
  song_title: 'Kagayaku Kimi e',
  artist: 'Yuu Kobayashi',
  artist_name: 'Yuu Kobayashi',
  animeTitle: 'Mahou Sensei Negima!',
  themeType: 'ED',
  themeSlug: 'ED1',
  releaseYear: 2005,
  isAnimeOped: true,
};

test('an anime artist clue names the anime and theme slug but not the artist', () => {
  const clue = formatCrosswordClue(NEGIMA, { answer: 'YUUKOBAYASHI', clueType: 'Artist name', artistName: 'Yuu Kobayashi' });
  assert.ok(!/yuu|kobayashi/i.test(clue));
  assert.ok(clue.includes('Mahou Sensei Negima!'));
  assert.ok(clue.includes('ED1'));
  assert.ok(!containsAnswerLeak(clue, 'YUUKOBAYASHI'));
});

test('an anime song-title clue gives the theme slug but not the title or artist', () => {
  const clue = formatCrosswordClue(NEGIMA, { answer: 'KAGAYAKUKIMIE', clueType: 'Song title' });
  assert.ok(!/kagayaku/i.test(clue));
  assert.ok(!clue.includes('Yuu Kobayashi'));
  assert.ok(clue.includes('ED1'));
  assert.ok(!containsAnswerLeak(clue, 'KAGAYAKUKIMIE'));
});

test('an anime keyword clue does not contain the keyword', () => {
  const clue = formatCrosswordClue(NEGIMA, { answer: 'KAGAYAKU', clueType: 'Song title keyword' });
  assert.ok(!/kagayaku/i.test(clue));
  assert.ok(!containsAnswerLeak(clue, 'KAGAYAKU'));
});

const BLINDING_LIGHTS = { title: 'Blinding Lights', artist: 'The Weeknd', releaseYear: 2020, isAnimeOped: false };

test('an artist clue names a hit song, a title clue names the artist', () => {
  const artistClue = formatCrosswordClue(BLINDING_LIGHTS, { answer: 'THEWEEKND', clueType: 'Artist name', artistName: 'The Weeknd' });
  assert.ok(!/weeknd/i.test(artistClue));
  assert.ok(artistClue.includes('Blinding Lights'));
  assert.ok(!containsAnswerLeak(artistClue, 'THEWEEKND'));

  const titleClue = formatCrosswordClue(BLINDING_LIGHTS, { answer: 'BLINDINGLIGHTS', clueType: 'Song title' });
  assert.ok(!/blinding/i.test(titleClue));
  assert.ok(titleClue.includes('The Weeknd'));
  assert.ok(!containsAnswerLeak(titleClue, 'BLINDINGLIGHTS'));
});

test('a self-titled song is not named in its artist clue', () => {
  const clue = formatCrosswordClue({ title: 'Iron Maiden', artist: 'Iron Maiden', releaseYear: 1980, isAnimeOped: false }, {
    answer: 'IRONMAIDEN', clueType: 'Artist name', artistName: 'Iron Maiden',
  });
  assert.ok(!/maiden/i.test(clue));
  assert.ok(!containsAnswerLeak(clue, 'IRONMAIDEN'));
});

test('no clue type leaks its answer for any anime title/artist/franchise combination', () => {
  const franchises = ['Naruto', 'One Piece', 'Bleach', 'Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'Fullmetal Alchemist'];
  const artists = ['KANA-BOON', 'Ado', 'LiSA', 'Asian Kung-Fu Generation', 'Linked Horizon', 'EVE', 'RADWIMPS'];
  const titles = ['Silhouette', 'Shin Jidai', 'Gurenge', 'Haruka Kanata', 'Shinzou wo Sasageyo', 'Kaikai Kitan', 'Sparkle'];
  titles.forEach((title, t) => artists.forEach((artist, a) => {
    const animeTitle = franchises[(t + a) % franchises.length];
    const themeSlug = `${a % 2 ? 'ED' : 'OP'}${1 + (t % 5)}`;
    const track = { title, song_title: title, artist, artist_name: artist, animeTitle, themeType: themeSlug.slice(0, 2), themeSlug, releaseYear: 2000 + t, isAnimeOped: true };
    for (const preferredType of ['anime', 'title', 'artist', 'keyword']) {
      const keyword = extractAnswerKeyword(title, artist, { preferredType, allowArtist: true, animeTitle });
      if (!keyword) continue;
      const clue = formatCrosswordClue(track, keyword);
      assert.ok(!containsAnswerLeak(clue, keyword.answer), `"${clue}" leaks ${keyword.answer}`);
    }
  }));
});
