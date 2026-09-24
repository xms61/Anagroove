import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAnswerKeyword,
  extractAllAnswerCandidates,
  isSingleEntityArtist,
  splitArtistNames,
  type ExtractKeywordOptions,
} from '../../shared/musicKeywords.ts';
import { blacklistIdentityKey, canonicalArtistKey, toCrosswordAnswer, type BlacklistIdentityItem } from '../../shared/musicIdentity.ts';

// [title, artist, options, answer, clue type, why]
const KEYWORDS: [title: string, artist: string, options: ExtractKeywordOptions, answer: string, clueType: string, why: string][] = [
  ['Hello', 'Adele', {}, 'HELLO', 'Song title', 'a one-word title'],
  ['Stay (feat. Justin Bieber)', 'The Kid LAROI', {}, 'STAY', 'Song title', 'feat. credits are stripped'],
  ['Your Love', 'The Outfield', {}, 'YOURLOVE', 'Song title', 'multi-word titles are joined'],
  ['Blinding Lights', 'The Weeknd', {}, 'BLINDINGLIGHTS', 'Song title', '14 letters is the maximum'],
  ["Don't Stop Believin'", 'Journey', {}, 'JOURNEY', 'Artist name', 'a title over 14 letters falls back to the artist'],
  ['Smells Like Teen Spirit', 'Nirvana', {}, 'NIRVANA', 'Artist name', 'a title over 14 letters falls back to the artist'],
  ['Your Love', 'The Outfield', { preferredType: 'artist' }, 'THEOUTFIELD', 'Artist name', 'the preferred clue type'],
  ['mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist' }, 'SKIAGGU', 'Artist name', 'the lead artist of a collaboration, never joined'],
  ['mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist', artistIndex: 1 }, 'SIRA', 'Artist name', 'a co-performer on request'],
  ['mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist', seenAnswers: new Set(['SKIAGGU']) }, 'SIRA', 'Artist name', 'the co-performer when the lead is on the grid'],
  ['Sun & Moon', 'Above & Beyond', { preferredType: 'artist' }, 'ABOVEANDBEYOND', 'Artist name', 'a single-entity band with & -> AND'],
  ['Rock & Roll', 'Led Zeppelin', { preferredType: 'title' }, 'ROCKANDROLL', 'Song title', '& -> AND in a title'],
];
for (const [title, artist, options, answer, clueType, why] of KEYWORDS) {
  test(`extractAnswerKeyword("${title}", "${artist}"): ${why}`, () => {
    const keyword = extractAnswerKeyword(title, artist, options);
    assert.equal(keyword?.answer, answer);
    assert.equal(keyword?.clueType, clueType);
  });
}

test('extractAnswerKeyword returns null for empty input', () => {
  assert.equal(extractAnswerKeyword('', ''), null);
});

test('length buckets steer the answer length', () => {
  assert.ok(extractAnswerKeyword('Die With A Smile feat. Lady Gaga', 'Bruno Mars', { targetLengthBucket: 'short' })!.answer.length <= 5);
  assert.ok(extractAnswerKeyword('Die With A Smile feat. Lady Gaga', 'Bruno Mars', { targetLengthBucket: 'long' })!.answer.length >= 9);
});

test('answer candidates keep collaborators separate and offer a short keyword', () => {
  const apt = extractAllAnswerCandidates('APT. (feat. Bruno Mars)', 'ROSÉ & Bruno Mars')!;
  assert.equal(apt.title?.answer, 'APT');
  assert.deepEqual(apt.artistCandidates?.map(c => c.answer), ['ROSE', 'BRUNOMARS']);

  const die = extractAllAnswerCandidates('Die With A Smile feat. Lady Gaga', 'Bruno Mars')!;
  assert.equal(die.title?.answer, 'DIEWITHASMILE');
  assert.equal(die.shortKeyword?.answer, 'DIE');
});

const ANSWERS = [
  ['Beyoncé', 'BEYONCE'],
  ['21 pilots', '21PILOTS'],
  ['Go', 'GO'],
  ['Above & Beyond', 'ABOVEANDBEYOND'],
  ['Mumford & Sons', 'MUMFORDANDSONS'],
  ['Rock & Roll', 'ROCKANDROLL'],
  ['Simon & Garfunkel', 'SIMONANDGARFUNKEL'],
  ['東京', null],
];
for (const [text, expected] of ANSWERS) {
  test(`toCrosswordAnswer("${text}") is ${expected}`, () => {
    assert.equal(toCrosswordAnswer(text), expected);
  });
}

test('artist identity keys keep numbers and fold case and diacritics', () => {
  assert.equal(canonicalArtistKey('  21 PILOTS  '), '21 pilots');
  assert.equal(canonicalArtistKey('Beyoncé'), canonicalArtistKey('BEYONCE'));
});

const ENTITIES: [name: string, expected: boolean][] = [
  ['Above & Beyond', true],
  ['Mumford & Sons', true],
  ['Bob Marley & The Wailers', true],
  ['Ski Aggu & Sira', false],
  ['Drake & 21 Savage', false],
];
for (const [name, expected] of ENTITIES) {
  test(`isSingleEntityArtist("${name}") is ${expected}`, () => {
    assert.equal(isSingleEntityArtist(name), expected);
  });
}

const SPLITS: [name: string, expected: string[]][] = [
  ['Ski Aggu & Sira', ['Ski Aggu', 'Sira']],
  ['Ski aggu & Sira', ['Ski aggu', 'Sira']],
  ['Above & Beyond', ['Above & Beyond']],
  ['The Kid LAROI feat. Justin Bieber', ['The Kid LAROI', 'Justin Bieber']],
  ['David Guetta, Bebe Rexha', ['David Guetta', 'Bebe Rexha']],
];
for (const [name, expected] of SPLITS) {
  test(`splitArtistNames("${name}")`, () => {
    assert.deepEqual(splitArtistNames(name), expected);
  });
}

test('blacklist identity keys keep generic and distinct provider-scoped entries apart', () => {
  const items: BlacklistIdentityItem[] = [
    { type: 'song', name: 'Same Title' },
    { type: 'song', name: 'Same Title', provider: 'deezer', providerTrackId: '101' },
    { type: 'song', name: 'same-title', provider: 'deezer', providerTrackId: '202' },
    { type: 'artist', name: 'Beyoncé' },
    { type: 'artist', name: 'beyonce', provider: 'deezer', providerArtistId: '42' },
  ];
  const keys = new Set(items.map(blacklistIdentityKey));
  assert.equal(keys.size, 5);
});
