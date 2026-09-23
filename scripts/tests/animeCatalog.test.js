import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAnimeTarget, getAnimeThemeType } from '../../server/policy/selectionPolicy.js';
import { AnimeCatalog } from '../../server/db/animeCatalog.js';

const TARGETS = [
  ['anime', '', true],
  ['anime openings', '', true],
  ['all', 'anime ed', true],
  ['japanese', '', false],
  ['Japanese City Pop', '', false],
  ['rock', 'j-rock hits', false],
];
for (const [genre, prompt, expected] of TARGETS) {
  test(`isAnimeTarget("${genre}", "${prompt}") is ${expected}`, () => {
    assert.equal(isAnimeTarget(genre, prompt), expected);
  });
}

test('getAnimeThemeType picks OP or ED, or null for both', () => {
  assert.equal(getAnimeThemeType('anime openings', ''), 'OP');
  assert.equal(getAnimeThemeType('anime endings', ''), 'ED');
  assert.equal(getAnimeThemeType('anime', ''), null);
});

const THEMES = [
  { animeTitle: 'Neon Genesis Evangelion', songTitle: "A Cruel Angel's Thesis", artistName: 'Yoko Takahashi', themeType: 'OP', themeSlug: 'OP1', year: 1995, season: 'Fall', malId: 30, anilistId: 30, file: '1995/Fall/Evangelion-OP1', popularity: 98 },
  { animeTitle: 'Cowboy Bebop', songTitle: 'Tank!', artistName: 'SEATBELTS', themeType: 'OP', themeSlug: 'OP1', year: 1998, season: 'Spring', malId: 1, anilistId: 1, file: '1998/Spring/CowboyBebop-OP1', popularity: 99 },
  { animeTitle: 'Cowboy Bebop', songTitle: 'The Real Folk Blues', artistName: 'The Seatbelts ft. Mai Yamane', themeType: 'ED', themeSlug: 'ED1', year: 1998, season: 'Spring', malId: 1, anilistId: 1, file: '1998/Spring/CowboyBebop-ED1', popularity: 95 },
];

/** Three themes; `sampleOffsets[i]` lists the 20 s clips added to theme i. */
function catalogWith(sampleOffsets) {
  const db = new AnimeCatalog(':memory:');
  const ids = THEMES.map(({ file, ...theme }) => db.upsertAnimeTrack({ ...theme, themeNumber: 1, originalFilePath: `${file}.ogg`, durationMs: 90000 }));
  ids.forEach((id, i) => (sampleOffsets[i] || []).forEach((offsetSeconds, n) => db.insertSample({
    animeTrackId: id,
    sampleIndex: n + 1,
    samplePath: `data/anime_samples/${THEMES[i].file}_s${n + 1}.ogg`,
    sampleUrl: `/audio/anime/${THEMES[i].file}_s${n + 1}.ogg`,
    offsetSeconds,
    durationSeconds: 20,
  })));
  return { db, ids };
}

test('a theme keeps every clip in offset order', () => {
  const { db, ids } = catalogWith([[5, 35, 65]]);
  assert.deepEqual(ids, [1, 2, 3]);
  const samples = db.getSamplesForTrack(ids[0]);
  assert.deepEqual(samples.map(s => [s.offset_seconds, s.duration_seconds]), [[5, 20], [35, 20], [65, 20]]);
  db.close();
});

test('requireSamples returns only themes with clips, served from /audio/anime', () => {
  const { db } = catalogWith([[5, 35, 65]]);
  const [track, ...rest] = db.getRandomAnimeTracks({ count: 10, requireSamples: true });
  assert.equal(rest.length, 0);
  assert.equal(track.id, 'anime:1');
  assert.ok(track.audioUrl.startsWith('/audio/anime/'));
  assert.equal(track.sampleVariations.length, 3);
  db.close();
});

test('themes filter by type (OP/ED) and by anime title', () => {
  const { db } = catalogWith([[5], [5], [5]]);
  const types = (options) => db.getRandomAnimeTracks({ count: 10, ...options }).map(t => t.themeType).sort();
  assert.deepEqual(types({ type: 'OP' }), ['OP', 'OP']);
  assert.deepEqual(types({ type: 'ED' }), ['ED']);
  const bebop = db.getRandomAnimeTracks({ count: 10, search: 'Bebop' });
  assert.equal(bebop.length, 2);
  assert.ok(bebop.every(t => t.animeTitle === 'Cowboy Bebop'));
  db.close();
});

test('stats count themes, OP/ED, clips and the year range', () => {
  const { db } = catalogWith([[5], [5], [5]]);
  const { totalTracks, totalOps, totalEds, tracksWithSamples, minYear, maxYear } = db.getStats();
  assert.deepEqual(
    { totalTracks, totalOps, totalEds, tracksWithSamples, minYear, maxYear },
    { totalTracks: 3, totalOps: 2, totalEds: 1, tracksWithSamples: 3, minYear: 1995, maxYear: 1998 }
  );
  db.close();
});
