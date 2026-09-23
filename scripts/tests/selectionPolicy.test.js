import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAnswerKeyword } from '../../shared/musicKeywords.js';
import { isLanguagePermitted, isTemporalPermitted } from '../../server/policy/selectionPolicy.js';

test('Temporal Filtering, Answer Length Variety & English Enforcement', async () => {
  // 1. Temporal Filtering
  assert(
    isTemporalPermitted({ releaseDate: '1991-09-24', title: 'Smells Like Teen Spirit', artist: 'Nirvana' }, { start: 1990, end: 1999 }) === true,
    'Permits 1991 release for 90s decade filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '2022-03-01', title: 'As It Was', artist: 'Harry Styles' }, { start: 1990, end: 1999 }) === false,
    'Rejects 2022 release for 90s decade filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '2024-05-01', title: 'Espresso', artist: 'Sabrina Carpenter' }, { start: 2020, end: 2026 }) === true,
    'Permits 2024 release for 2020-2026 contemporary filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '1984-11-29', title: 'Careless Whisper', artist: 'George Michael' }, { start: 2020, end: 2026 }) === false,
    'Rejects 1984 release for 2020-2026 filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '2022-10-21', title: 'Hotel California (2022 Remaster)', artist: 'Eagles' }, { start: 2020, end: 2026 }) === false,
    'Rejects legacy remaster tagged track for contemporary 2020-2026 filter'
  );
  assert(
    isTemporalPermitted({ title: 'Live at Budokan (1982)', artist: 'Cheap Trick' }, { start: 1980, end: 1989 }) === true,
    'Extracts 1982 year from album/title vintage string'
  );
  assert(
    isTemporalPermitted({ title: 'Unknown Track', artist: 'Unknown Artist' }, { start: 1980, end: 1989 }) === false,
    'Rejects track with undetermined release year when strict yearRange is active'
  );

  // 2. English Enforcement for Random Crosswords
  assert(
    isLanguagePermitted({ title: 'Despacito', artist: 'Luis Fonsi' }, 'all', '') === false,
    'Strictly rejects Spanish language tracks for random crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Je t\'aime', artist: 'Lara Fabian' }, 'all', '') === false,
    'Strictly rejects French language tracks for random crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Atemlos durch die Nacht', artist: 'Helene Fischer' }, 'all', '') === false,
    'Strictly rejects German language tracks for random crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Stayin\' Alive', artist: 'Bee Gees' }, 'all', '') === true,
    'Permits iconic English hit for random crosswords'
  );

  // 3. Answer Length Variety and Bucketing
  const shortCandidate = extractAnswerKeyword('Dancing in the Dark', 'Bruce Springsteen', { targetLengthBucket: 'short' });
  assert(
    shortCandidate && shortCandidate.answer.length >= 2 && shortCandidate.answer.length <= 5,
    `Extracts short answer candidate (length ${shortCandidate?.answer?.length}): ${shortCandidate?.answer}`
  );

  const mediumCandidate = extractAnswerKeyword('Dancing in the Dark', 'Bruce Springsteen', { targetLengthBucket: 'medium' });
  assert(
    mediumCandidate && mediumCandidate.answer.length >= 6 && mediumCandidate.answer.length <= 8,
    `Extracts medium answer candidate (length ${mediumCandidate?.answer?.length}): ${mediumCandidate?.answer}`
  );

  const longCandidate = extractAnswerKeyword('Blinding Lights', 'The Weeknd', { targetLengthBucket: 'long' });
  assert(
    longCandidate && longCandidate.answer.length >= 9 && longCandidate.answer.length <= 14,
    `Extracts long answer candidate (length ${longCandidate?.answer?.length}): ${longCandidate?.answer}`
  );
});
