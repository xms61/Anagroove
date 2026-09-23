import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthenticTrack, isAnimeTrack, isJapaneseTrack } from '../../server/policy/selectionPolicy.js';
import { judgePuzzle, judgeMultiGenerationSuite } from '../../server/services/crosswordJudge.js';

test('Crossword Judge, Cultural Guards & Benchmark Heuristics', async () => {
  // 1. isAnimeTrack Tests
  assert(
    isAnimeTrack({ artist: 'FLOW', title: 'Colors (Code Geass Opening Theme)', album: 'FLOW THE BEST' }) === true,
    'isAnimeTrack accepts authentic anime opening theme'
  );
  assert(
    isAnimeTrack({ artist: 'Linked Horizon', title: 'Guren no Yumiya', album: 'Attack on Titan OST' }) === true,
    'isAnimeTrack accepts anime franchise soundtrack'
  );
  assert(
    isAnimeTrack({ artist: 'Tatsuro Yamashita', title: 'Plastic Love', album: 'Big Wave' }) === false,
    'isAnimeTrack rejects pure Japanese City Pop / non-anime track'
  );
  assert(
    isAnimeTrack({ artist: 'DJ AniMe', title: 'Hardcore Attack', album: 'Single' }) === false,
    'isAnimeTrack rejects western artist named DJ AniMe'
  );
  assert(
    isAnimeTrack({ artist: 'Ben Mazué', title: 'Le coeur nous anime', album: 'Paradis' }) === false,
    'isAnimeTrack rejects French track with animer conjugation'
  );
  assert(
    isAnimeTrack({ artist: 'Animal Collective', title: 'My Girls', album: 'Merriweather' }) === false,
    'isAnimeTrack rejects English band with animal stem'
  );
  assert(
    isAnimeTrack({ artist: 'LISA', title: 'Rockstar', album: 'Alter Ego' }) === false,
    'isAnimeTrack rejects Western rap single by LISA'
  );

  // 2. isJapaneseTrack Tests
  assert(
    isJapaneseTrack({ artist: 'Tatsuro Yamashita', title: 'Ride On Time', language: 'ja' }) === true,
    'isJapaneseTrack accepts authentic Japanese City Pop artist'
  );
  assert(
    isJapaneseTrack({ artist: 'Miki Matsubara', title: 'Stay With Me', album: 'Pocket Park' }) === true,
    'isJapaneseTrack accepts recognized Japanese artist roster'
  );
  assert(
    isJapaneseTrack({ artist: 'The Japanese House', title: 'Saw You In A Dream', language: 'en' }) === false,
    'isJapaneseTrack rejects UK indie band The Japanese House'
  );
  assert(
    isJapaneseTrack({ artist: 'Aneka', title: 'Japanese Boy', language: 'en' }) === false,
    'isJapaneseTrack rejects 80s novelty pop track Japanese Boy'
  );

  // 3. isAuthenticTrack Tests
  assert(
    isAuthenticTrack({ artist: 'Fonzi M', title: 'Yumetourou [Guitar Version]' }) === false,
    'isAuthenticTrack rejects YouTube instrumental/guitar versions'
  );
  assert(
    isAuthenticTrack({ artist: 'Various Artists', title: 'Bohemian Rhapsody (Karaoke Version)' }) === false,
    'isAuthenticTrack rejects karaoke tracks'
  );
  assert(
    isAuthenticTrack({ artist: 'Workout Crew', title: 'Levitating (130 BPM Workout Mix)' }) === false,
    'isAuthenticTrack rejects workout mix audio utilities'
  );
  assert(
    isAuthenticTrack({ artist: 'Queen', title: 'Bohemian Rhapsody', album: 'A Night At The Opera' }) === true,
    'isAuthenticTrack permits authentic original rock masterpiece'
  );

  // 4. judgePuzzle Evaluation Logic
  const mockCleanPuzzle = {
    cols: 12,
    rows: 12,
    clues: [
      { answer: 'QUEEN', length: 5, clueType: 'Track keyword', crossings: 2, song: { artist: 'Queen', title: 'Killer Queen', language: 'en', popularity: 85, release_year: 1974 } },
      { answer: 'RADIO', length: 5, clueType: 'Track keyword', crossings: 1, song: { artist: 'Queen', title: 'Radio Ga Ga', language: 'en', popularity: 88, release_year: 1984 } },
      { answer: 'CHAMPIONS', length: 9, clueType: 'Track keyword', crossings: 2, song: { artist: 'Queen', title: 'We Are The Champions', language: 'en', popularity: 92, release_year: 1977 } },
      { answer: 'RHAPSODY', length: 8, clueType: 'Track keyword', crossings: 3, song: { artist: 'Queen', title: 'Bohemian Rhapsody', language: 'en', popularity: 95, release_year: 1975 } },
      { answer: 'WILL', length: 4, clueType: 'Track keyword', crossings: 1, song: { artist: 'Queen', title: 'We Will Rock You', language: 'en', popularity: 91, release_year: 1977 } },
      { answer: 'DUST', length: 4, clueType: 'Track keyword', crossings: 2, song: { artist: 'Queen', title: 'Another One Bites The Dust', language: 'en', popularity: 94, release_year: 1980 } },
    ],
  };

  const cleanJudgment = judgePuzzle(mockCleanPuzzle, {
    prompt: 'songs by Queen',
    archetype: 'standard',
    parsed: { artist: 'Queen' },
    expectedLanguage: 'en',
    targetWords: 6,
  });

  assert(cleanJudgment.passed === true, 'judgePuzzle passes clean thematic single-artist puzzle');
  assert(cleanJudgment.metrics.wordLengths.shortCount === 4, 'judgePuzzle counts 4 short words (<=5 chars)');
  assert(cleanJudgment.metrics.wordLengths.shortRatio === 0.67, 'judgePuzzle short word ratio is 67%');

  // Test violation detection: Leaked artist clue & foreign language
  const mockViolatingPuzzle = {
    cols: 10,
    rows: 10,
    clues: [
      { answer: 'QUEEN', length: 5, clueType: 'Artist name', crossings: 1, song: { artist: 'Queen', title: 'Killer Queen', language: 'es' } },
      { answer: 'DESPACITO', length: 9, clueType: 'Song title', crossings: 1, song: { artist: 'Luis Fonsi', title: 'Despacito', language: 'es' } },
    ],
  };
  const violatingJudgment = judgePuzzle(mockViolatingPuzzle, {
    prompt: 'songs by Queen',
    archetype: 'standard',
    parsed: { artist: 'Queen' },
    expectedLanguage: 'en',
    targetWords: 6,
  });
  assert(violatingJudgment.passed === false, 'judgePuzzle fails puzzle with foreign tracks and leaked artist clues');
  assert(violatingJudgment.violations.length >= 2, 'Detects multiple violations for artist mismatch and language');

  // 5. judgeMultiGenerationSuite Aggregation
  const multiJudge = judgeMultiGenerationSuite('songs by Queen', [mockCleanPuzzle, mockCleanPuzzle], {
    archetype: 'standard',
    parsed: { artist: 'Queen' },
  });
  assert(multiJudge.generationsCount === 2, 'Aggregates 2 generations');
  assert(multiJudge.repetitiveness.totalPlacedTracks === 12, 'Tallies 12 total placed tracks');
  assert(multiJudge.repetitiveness.distinctTracksCount === 6, 'Identifies 6 unique tracks when identical puzzles passed');
  assert(multiJudge.repetitiveness.uniqueTrackRatio === 0.5, 'Computes 0.5 uniqueness ratio');
  assert(multiJudge.repetitiveness.avgJaccard === 1, 'Computes Jaccard 1.0 for completely identical generations');
});
