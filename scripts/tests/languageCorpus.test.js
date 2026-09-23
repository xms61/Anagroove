import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTrackLanguage } from '../../server/db/languageClassifier.js';

// Deleting a track is irreversible, so the corpus leans on English titles that n-gram
// detectors misread. Each row: [title, artist, expected, extra input].
const CORPUS = [
  // English titles that read as other languages
  ["Sweet Child O' Mine", "Guns N' Roses", 'en'],
  ['Moth To A Flame', 'Swedish House Mafia', 'en'],
  ['Cutie Pie', 'Lovelytheband', 'en'],
  ['99 Luftballons', 'Nena', 'en'],
  ['Hotel California', 'Eagles', 'en'],
  ['Bohemian Rhapsody', 'Queen', 'en'],
  ['Plastic Love', 'Mariya Takeuchi', 'en'],
  ['Hype Boy', 'NewJeans', 'en'],
  ['Despacito', 'Luis Fonsi', 'en', {}, 'one word is too short to rule on'],
  ['Mamma Mia', 'ABBA', 'en', { artistLanguage: 'en' }, 'an English artist vote outweighs two Italian words'],
  ['Quiet Shadow', 'Silver Pines', 'en', { artistLanguage: 'en' }, 'the artist vote also covers two-word misreads (es without it)'],
  // Japanese / Korean by script, ISRC registrant or artist vote
  ['夜に駆ける', 'YOASOBI', 'ja'],
  ['봄날', 'BTS', 'ko'],
  ['Gangnam Style (강남스타일)', 'PSY', 'ko'],
  ['Idol', 'YOASOBI', 'ja', { artistLanguage: 'ja' }],
  ['Dynamite', 'BTS', 'ko', { artistLanguage: 'ko' }],
  ['Lemon', '米津玄師', 'ja', { isrc: 'JPU901800100' }],
  ['Lemon', '米津玄師', 'zh', {}, 'a Han-only name without JP/KR evidence reads as Chinese'],
  ['Cupid', 'FIFTY FIFTY', 'ko', { isrc: 'KRA402300010' }],
  // Other languages (rejected at ingest, deleted by cleanup)
  ['Je ne regrette rien', 'Edith Piaf', 'fr'],
  ['Voglio Vederti Danzare', 'Franco Battiato', 'it'],
  ['月亮代表我的心', '邓丽君', 'zh'],
  ['Короли ночи', 'Группа', 'ru'],
  ['KoЯn', 'KoЯn', 'en', {}, 'one stylized letter is not Cyrillic text'],
];

for (const [title, artist, expected, extra = {}, why] of CORPUS) {
  const hints = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(', ');
  test(`${title} / ${artist}${hints ? ` (${hints})` : ''} -> ${expected}`, () => {
    assert.equal(resolveTrackLanguage({ title, artist, ...extra }), expected, why);
  });
}
