import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDedupeArtist, normalizeDedupeTitle } from '../../server/db/sqliteCatalog.ts';
import {
  baseTitleKey,
  classifyVersion,
  cleanDisplayText,
  detectTrackLanguage,
  normalizeIsrc,
  normalizeReleaseYear,
} from '../../server/db/trackNormalization.ts';

const VERSIONS = [
  ['Levels (Original Mix)', 'original'],
  ['Interlude - The Trio', 'original'],
  ['Hey Jude - Remastered 2015', 'remaster'],
  ['Dynamite (Japanese Version)', 'alternate'],
  ["Love Story (Taylor's Version)", 'rerecord'],
];
for (const [title, expected] of VERSIONS) {
  test(`classifyVersion("${title}") is ${expected}`, () => {
    assert.equal(classifyVersion(title), expected);
  });
}

const BASE_TITLES = [
  ['Interlude - The Trio', 'interludethetrio', 'an unrecognised dash suffix stays part of the title'],
  ['Song - Single Version', 'song', 'release decoration'],
  ['Let It Go (From "Frozen")', 'letitgo', 'credit decoration'],
];
for (const [title, expected, why] of BASE_TITLES) {
  test(`baseTitleKey("${title}"): ${why}`, () => {
    assert.equal(baseTitleKey(title), expected);
  });
}

const DEDUPE_TITLES = [
  ['Bohemian Rhapsody (Remastered 2011)', 'bohemianrhapsody'],
  ['Under Pressure (feat. David Bowie) [Deluxe Version]', 'underpressure'],
  ['Stayin Alive (Radio Edit)', 'stayinalive'],
];
for (const [title, expected] of DEDUPE_TITLES) {
  test(`normalizeDedupeTitle("${title}")`, () => {
    assert.equal(normalizeDedupeTitle(title), expected);
  });
}

test('normalizeDedupeArtist lowercases the canonical artist key', () => {
  assert.equal(normalizeDedupeArtist('The Beatles'), 'the beatles');
});

test('a Han-only title is ja only with a JP ISRC registrant', () => {
  assert.equal(detectTrackLanguage('紅蓮華', 'LiSA'), 'zh');
  assert.equal(detectTrackLanguage('紅蓮華', 'LiSA', { isrc: 'JPU901900400' }), 'ja');
});

test('ISRCs are normalized or dropped', () => {
  assert.equal(normalizeIsrc('us-qx9-13-00105'), 'USQX91300105');
  assert.equal(normalizeIsrc('BAD'), null);
});

test('release years are range-checked and read from dates', () => {
  assert.equal(normalizeReleaseYear(1850), null);
  assert.equal(normalizeReleaseYear('2013-05-17'), 2013);
});

test('cleanDisplayText decodes entities (also double-encoded) and strips invisible characters, idempotently', () => {
  assert.equal(cleanDisplayText('I&#039;m Not The Only One'), "I'm Not The Only One");
  assert.equal(cleanDisplayText('Rock &amp;amp; Roll'), 'Rock & Roll');
  assert.equal(cleanDisplayText(`  Equator - ${String.fromCharCode(0x200b)} Eastern  `), 'Equator - Eastern');
  assert.equal(cleanDisplayText(cleanDisplayText('A &amp; B')), 'A & B');
});

test('tags naming the original release are original; movie versions are alternate', () => {
  for (const title of ['Mayonaka no Door (Single ver.)', 'Nuit de folie (Version originale 1988)', 'So Far Away (Full Version)']) {
    assert.equal(classifyVersion(title), 'original', title);
  }
  assert.equal(classifyVersion('Sparkle - movie ver.'), 'alternate');
  assert.equal(classifyVersion('Dreams (2004 Remaster)'), 'remaster');
});
