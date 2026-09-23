import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAnswerKeyword,
  extractAllAnswerCandidates,
  isSingleEntityArtist,
  splitArtistNames,
} from '../../shared/musicKeywords.js';
import { blacklistIdentityKey, canonicalArtistKey, toCrosswordAnswer } from '../../shared/musicIdentity.js';

test('Canonical Keyword Extraction', async () => {
  const singleWord = extractAnswerKeyword('Hello', 'Adele');
  assert(singleWord?.answer === 'HELLO' && singleWord.clueType === 'Song title', 'Extracts single-word title keyword');

  const featTrack = extractAnswerKeyword('Stay (feat. Justin Bieber)', 'The Kid LAROI');
  assert(featTrack?.answer === 'STAY', 'Strips (feat. ...) and extracts clean title');

  const combinedTrack = extractAnswerKeyword('Your Love', 'The Outfield');
  assert(combinedTrack?.answer === 'YOURLOVE' && combinedTrack.clueType === 'Song title', 'Combines multi-word title up to 14 characters');

  const boundTrack = extractAnswerKeyword('Blinding Lights', 'The Weeknd');
  assert(boundTrack?.answer === 'BLINDINGLIGHTS' && boundTrack.answer.length === 14, 'Permits combined titles up to 14 characters');

  const longBoundTrack = extractAnswerKeyword("Don't Stop Believin'", 'Journey');
  assert(longBoundTrack?.answer === 'JOURNEY' && longBoundTrack.clueType === 'Artist name', 'Falls back to artist for titles exceeding 14 characters');

  const multiWordTooLong = extractAnswerKeyword('Smells Like Teen Spirit', 'Nirvana');
  assert(multiWordTooLong?.answer === 'NIRVANA' && multiWordTooLong.clueType === 'Artist name', 'Falls back to artist for titles exceeding 14 characters');

  const artistPreferred = extractAnswerKeyword('Your Love', 'The Outfield', { preferredType: 'artist' });
  assert(artistPreferred?.answer === 'THEOUTFIELD' && artistPreferred.clueType === 'Artist name', 'Honors preferred clue type for artist');

  const nullResult = extractAnswerKeyword('', '');
  assert(nullResult === null, 'Returns null on empty input');
  assert(canonicalArtistKey('  21 PILOTS  ') === '21 pilots', 'Artist identity preserves numeric tokens');
  assert(canonicalArtistKey('Beyoncé') === canonicalArtistKey('BEYONCE'), 'Artist identity folds case and diacritics');
  assert(toCrosswordAnswer('Beyoncé') === 'BEYONCE', 'Artist answers remove diacritics without truncation');
  assert(toCrosswordAnswer('21 pilots') === '21PILOTS', 'Artist answers retain every numeric and word token');
  assert(toCrosswordAnswer('東京') === null, 'Rejects unsupported crossword answers instead of corrupting them');

  // Single entity and ampersand expansion tests
  assert(toCrosswordAnswer('Above & Beyond') === 'ABOVEANDBEYOND', 'Replaces ampersand with AND for single-entity band');
  assert(toCrosswordAnswer('Mumford & Sons') === 'MUMFORDANDSONS', 'Replaces ampersand with AND for family band');
  assert(toCrosswordAnswer('Rock & Roll') === 'ROCKANDROLL', 'Replaces ampersand with AND in song titles');
  assert(toCrosswordAnswer('Simon & Garfunkel') === 'SIMONANDGARFUNKEL', 'Replaces ampersand with AND in iconic duo name');

  // Single entity identification vs collaboration
  assert(isSingleEntityArtist('Above & Beyond') === true, 'Identifies Above & Beyond as single entity');
  assert(isSingleEntityArtist('Mumford & Sons') === true, 'Identifies Mumford & Sons as single entity');
  assert(isSingleEntityArtist('Bob Marley & The Wailers') === true, 'Identifies Bob Marley & The Wailers as single entity');
  assert(isSingleEntityArtist('Ski Aggu & Sira') === false, 'Identifies Ski Aggu & Sira as collaboration');
  assert(isSingleEntityArtist('Drake & 21 Savage') === false, 'Identifies Drake & 21 Savage as collaboration');

  // Multi-artist splitting
  const splitCollab = splitArtistNames('Ski Aggu & Sira');
  assert(splitCollab.length === 2 && splitCollab[0] === 'Ski Aggu' && splitCollab[1] === 'Sira', 'Splits "Ski Aggu & Sira" into individual artists');
  const splitCase = splitArtistNames('Ski aggu & Sira');
  assert(splitCase.length === 2 && splitCase[0] === 'Ski aggu' && splitCase[1] === 'Sira', 'Splits case-varied "Ski aggu & Sira"');
  const splitSingle = splitArtistNames('Above & Beyond');
  assert(splitSingle.length === 1 && splitSingle[0] === 'Above & Beyond', 'Preserves single-entity band with ampersand');
  const splitFeat = splitArtistNames('The Kid LAROI feat. Justin Bieber');
  assert(splitFeat.length === 2 && splitFeat[0] === 'The Kid LAROI' && splitFeat[1] === 'Justin Bieber', 'Splits feat. artist collaboration');
  const splitComma = splitArtistNames('David Guetta, Bebe Rexha');
  assert(splitComma.length === 2 && splitComma[0] === 'David Guetta' && splitComma[1] === 'Bebe Rexha', 'Splits comma-separated artist collaboration');

  // Multi-artist answer extraction does not combine like a title
  const skiAgguCollab = extractAnswerKeyword('mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist' });
  assert(skiAgguCollab?.answer === 'SKIAGGU', 'Extracts lead artist answer SKIAGGU instead of combining as SKIAGGUSIRA');
  assert(skiAgguCollab?.answer !== 'SKIAGGUSIRA', 'Never combines collaborating artists like a title');

  const siraCollab = extractAnswerKeyword('mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist', artistIndex: 1 });
  assert(siraCollab?.answer === 'SIRA', 'Extracts co-performer answer SIRA on demand');

  const fallbackCollab = extractAnswerKeyword('mietfrei', 'Ski Aggu & Sira', {
    preferredType: 'artist',
    seenAnswers: new Set(['SKIAGGU']),
  });
  assert(fallbackCollab?.answer === 'SIRA', 'Falls back to co-performer SIRA if lead artist answer already exists on grid');

  const singleEntityKeyword = extractAnswerKeyword('Sun & Moon', 'Above & Beyond', { preferredType: 'artist' });
  assert(singleEntityKeyword?.answer === 'ABOVEANDBEYOND', 'Extracts single-entity artist with ampersand expanded to AND');

  const titleAmpersandKeyword = extractAnswerKeyword('Rock & Roll', 'Led Zeppelin', { preferredType: 'title' });
  assert(titleAmpersandKeyword?.answer === 'ROCKANDROLL', 'Extracts song title with ampersand expanded to AND');

  // Answer length variation (2-14 letters) & feature separation
  const twoLetterAnswer = toCrosswordAnswer('Go');
  assert(twoLetterAnswer === 'GO', 'Supports 2-letter answers for crossword grids');

  const aptCandidates = extractAllAnswerCandidates('APT. (feat. Bruno Mars)', 'ROSÉ & Bruno Mars');
  assert(aptCandidates.title?.answer === 'APT', 'Cleans features from title giving 3-letter answer APT');
  assert(aptCandidates.artistCandidates?.length === 2, 'Extracts 2 distinct artist candidates for ROSÉ & Bruno Mars');
  assert(aptCandidates.artistCandidates?.[0].answer === 'ROSE', 'First collaborator candidate is ROSE');
  assert(aptCandidates.artistCandidates?.[1].answer === 'BRUNOMARS', 'Second collaborator candidate is BRUNOMARS');
  assert(!aptCandidates.artistCandidates?.some(c => c.answer === 'ROSEBRUNOMARS'), 'Never concatenates collaborating artists into ROSEBRUNOMARS');

  const dieCandidates = extractAllAnswerCandidates('Die With A Smile feat. Lady Gaga', 'Bruno Mars');
  assert(dieCandidates.title?.answer === 'DIEWITHASMILE', 'Retains clean full title DIEWITHASMILE without feature leakage');
  assert(dieCandidates.shortKeyword?.answer === 'DIE', 'Extracts short 3-letter keyword DIE for length variance');

  const bucketShort = extractAnswerKeyword('Die With A Smile feat. Lady Gaga', 'Bruno Mars', { targetLengthBucket: 'short' });
  assert(bucketShort?.answer.length <= 5, 'Honors short length bucket target (<= 5 chars)');

  const bucketLong = extractAnswerKeyword('Die With A Smile feat. Lady Gaga', 'Bruno Mars', { targetLengthBucket: 'long' });
  assert(bucketLong?.answer.length >= 9, 'Honors long length bucket target (>= 9 chars)');

  const migrationIdentityKeys = new Set([
    { type: 'song', name: 'Same Title' },
    { type: 'song', name: 'Same Title', provider: 'deezer', providerTrackId: '101' },
    { type: 'song', name: 'same-title', provider: 'deezer', providerTrackId: '202' },
    { type: 'artist', name: 'Beyoncé' },
    { type: 'artist', name: 'beyonce', provider: 'deezer', providerArtistId: '42' },
  ].map(blacklistIdentityKey));
  assert(
    migrationIdentityKeys.size === 5,
    'Blacklist migration identities retain generic and distinct provider-scoped entries'
  );
});
