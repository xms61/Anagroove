import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import {
  extractAnswerKeyword,
  formatCrosswordClue,
  sanitizeClue,
  containsAnswerLeak,
} from '../../shared/musicKeywords.js';

test('Zero-Spoiler Clue System & Audio Proxy Configuration', async () => {
  // 1. Vite config proxy check
  const viteConfigContent = fs.readFileSync('vite.config.ts', 'utf-8');
  assert(viteConfigContent.includes("'/audio':"), 'Vite configuration includes /audio proxy rule');
  assert(viteConfigContent.includes('target: `http://127.0.0.1:${serverPort}`'), 'Vite /audio proxy targets Express serverPort');

  // 2. containsAnswerLeak unit assertions
  assert(
    containsAnswerLeak('[Anime] ED1 of "Mahou Sensei Negima!" by Yuu Kobayashi', 'YUUKOBAYASHI', ['Yuu Kobayashi']) === true,
    'containsAnswerLeak detects exact concatenated artist answer in clue'
  );
  assert(
    containsAnswerLeak('[Anime] ED1 of "Mahou Sensei Negima!" by Yuu Kobayashi', 'KOBAYASHI') === true,
    'containsAnswerLeak detects individual artist surname token'
  );
  assert(
    containsAnswerLeak('Performer behind the hit "Blinding Lights"', 'THEWEEKND') === false,
    'containsAnswerLeak permits clean non-leaking clue'
  );
  assert(
    containsAnswerLeak('Track by Bad Company', 'BADCOMPANY') === true,
    'containsAnswerLeak detects self-titled artist leak'
  );

  // 2b. sanitizeClue fallback assertions
  assert(
    sanitizeClue('Track by Bad Company', 'BADCOMPANY', 'Fallback clue') === 'Fallback clue',
    'sanitizeClue replaces leaked clue with fallback template'
  );
  assert(
    sanitizeClue('Performer behind the hit "Blinding Lights"', 'THEWEEKND', 'Fallback clue') === 'Performer behind the hit "Blinding Lights"',
    'sanitizeClue retains clean clue when no leak is detected'
  );

  // 3. Anime Clue Formatting & Zero Leak Guarantee
  const sampleAnimeTrack = {
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

  // 3a. Artist clue for anime track
  const artistClue = formatCrosswordClue(sampleAnimeTrack, {
    answer: 'YUUKOBAYASHI',
    clueType: 'Artist name',
    artistName: 'Yuu Kobayashi',
  });
  assert(!artistClue.toLowerCase().includes('yuu'), 'Anime artist clue NEVER contains artist first name');
  assert(!artistClue.toLowerCase().includes('kobayashi'), 'Anime artist clue NEVER contains artist surname');
  assert(artistClue.includes('Mahou Sensei Negima!'), 'Anime artist clue specifies anime franchise');
  assert(artistClue.includes('ED1'), 'Anime artist clue specifies theme slug');
  assert(!containsAnswerLeak(artistClue, 'YUUKOBAYASHI'), 'containsAnswerLeak confirms 0 leak for anime artist clue');

  // 3b. Song title clue for anime track
  const titleClue = formatCrosswordClue(sampleAnimeTrack, {
    answer: 'KAGAYAKUKIMIE',
    clueType: 'Song title',
  });
  assert(!titleClue.toLowerCase().includes('kagayaku'), 'Anime title clue NEVER contains song title');
  assert(!titleClue.includes('Yuu Kobayashi'), 'Anime title clue does NOT involve artist name');
  assert(titleClue.includes('ED1'), 'Anime title clue mentions theme slug ED1');
  assert(!containsAnswerLeak(titleClue, 'KAGAYAKUKIMIE'), 'containsAnswerLeak confirms 0 leak for anime title clue');

  // 3c. Title keyword clue for anime track
  const keywordClue = formatCrosswordClue(sampleAnimeTrack, {
    answer: 'KAGAYAKU',
    clueType: 'Song title keyword',
  });
  assert(!keywordClue.toLowerCase().includes('kagayaku'), 'Anime keyword clue NEVER contains the keyword answer');
  assert(!containsAnswerLeak(keywordClue, 'KAGAYAKU'), 'containsAnswerLeak confirms 0 leak for anime keyword clue');

  // 4. General Music Clue Formatting & Zero Leak Guarantee
  const generalTrack = {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    releaseYear: 2020,
    isAnimeOped: false,
  };

  const generalArtistClue = formatCrosswordClue(generalTrack, {
    answer: 'THEWEEKND',
    clueType: 'Artist name',
    artistName: 'The Weeknd',
  });
  assert(!generalArtistClue.toLowerCase().includes('weeknd'), 'General artist clue NEVER contains artist name');
  assert(generalArtistClue.includes('Blinding Lights'), 'General artist clue identifies hit track');
  assert(!containsAnswerLeak(generalArtistClue, 'THEWEEKND'), 'containsAnswerLeak confirms 0 leak for general artist clue');

  const generalTitleClue = formatCrosswordClue(generalTrack, {
    answer: 'BLINDINGLIGHTS',
    clueType: 'Song title',
  });
  assert(!generalTitleClue.toLowerCase().includes('blinding'), 'General title clue NEVER contains title tokens');
  assert(generalTitleClue.includes('The Weeknd'), 'General title clue identifies artist');
  assert(!containsAnswerLeak(generalTitleClue, 'BLINDINGLIGHTS'), 'containsAnswerLeak confirms 0 leak for general title clue');

  // 5. Self-Titled Edge Case Protection
  const selfTitledTrack = {
    title: 'Iron Maiden',
    artist: 'Iron Maiden',
    releaseYear: 1980,
    isAnimeOped: false,
  };
  const selfTitledArtistClue = formatCrosswordClue(selfTitledTrack, {
    answer: 'IRONMAIDEN',
    clueType: 'Artist name',
    artistName: 'Iron Maiden',
  });
  assert(!selfTitledArtistClue.toLowerCase().includes('maiden'), 'Self-titled track suppresses title in artist clue to avoid spoiler');
  assert(!containsAnswerLeak(selfTitledArtistClue, 'IRONMAIDEN'), 'Zero leak on self-titled artist clue');

  // 6. High-Volume Randomized Stress Test (500 iterations)
  const franchises = ['Naruto', 'One Piece', 'Bleach', 'Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'Fullmetal Alchemist'];
  const artists = ['KANA-BOON', 'Ado', 'LiSA', 'Asian Kung-Fu Generation', 'Linked Horizon', 'EVE', 'RADWIMPS'];
  const titles = ['Silhouette', 'Shin Jidai', 'Gurenge', 'Haruka Kanata', 'Shinzou wo Sasageyo', 'Kaikai Kitan', 'Sparkle'];

  for (let i = 0; i < 500; i++) {
    const f = franchises[i % franchises.length];
    const a = artists[i % artists.length];
    const t = titles[i % titles.length];
    const track = {
      title: t,
      song_title: t,
      artist: a,
      artist_name: a,
      animeTitle: f,
      themeType: i % 2 === 0 ? 'OP' : 'ED',
      themeSlug: `${i % 2 === 0 ? 'OP' : 'ED'}${1 + (i % 5)}`,
      releaseYear: 2000 + (i % 24),
      isAnimeOped: true,
    };

    const preferredType = ['anime', 'title', 'artist', 'keyword'][i % 4];
    const keyword = extractAnswerKeyword(t, a, { preferredType, allowArtist: true, animeTitle: f });
    if (!keyword) continue;

    const clue = formatCrosswordClue(track, keyword);

    const leak = containsAnswerLeak(clue, keyword.answer);
    if (leak) {
      throw new Error(`Leak detected in stress test! Clue: "${clue}", Answer: "${keyword.answer}"`);
    }
  }
  assert(true, 'Zero answer leaks across 500 randomized stress test generations (including Anime title)');
});
