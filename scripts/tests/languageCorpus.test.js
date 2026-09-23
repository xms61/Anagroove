import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyArtistLanguage, resolveTrackLanguage, scriptLanguage } from '../../server/db/languageClassifier.js';

// Deleting a track is irreversible, so the corpus leans on English titles that n-gram
// detectors misread. Each row: [title, artist, expected, extra input, why].
const CORPUS = [
  // English titles that read as other languages
  ["Sweet Child O' Mine", "Guns N' Roses", 'en'],
  ['Moth To A Flame', 'Swedish House Mafia', 'en'],
  ['Cutie Pie', 'Lovelytheband', 'en'],
  ['Teenage Dirtbag', 'Wheatus', 'en', {}, 'two-word titles only turn foreign with a clear margin'],
  ['99 Luftballons', 'Nena', 'en'],
  ['Hotel California', 'Eagles', 'en'],
  ['Bohemian Rhapsody', 'Queen', 'en'],
  ['Plastic Love', 'Mariya Takeuchi', 'en'],
  ['Hype Boy', 'NewJeans', 'en'],
  ['Die With A Smile', 'Lady Gaga', 'en', {}, '"Die ..." is not German'],
  ['Die Young', 'Kesha', 'en', { artistLanguage: 'en' }],
  ['Crazy Story, Pt. 3', 'King Von', 'en', {}, 'artist names are never run through the text detector'],
  ['PENTHOUSE', 'Unknown Act', 'en', {}, 'one word never gives a foreign verdict'],
  ['Despacito', 'Luis Fonsi', 'en', {}, 'one word is too short to rule on'],
  ['Viva La Vida', 'Coldplay', 'en', { artistLanguage: 'en' }, 'a short foreign phrase keeps the artist language'],
  ['Mamma Mia', 'ABBA', 'en', { artistLanguage: 'en' }, 'an English artist vote outweighs two Italian words'],
  ['Quiet Shadow', 'Silver Pines', 'en', { artistLanguage: 'en' }, 'the artist vote also covers two-word misreads (es without it)'],
  ['Freak On a Leash', 'KoЯn', 'en', {}, 'a stylized artist name'],
  ['P.I.M.P.', '50 Cent', 'en', { artistLanguage: 'en' }, 'a dotted acronym has no words'],
  // Japanese / Korean by script, ISRC registrant or artist vote
  ['夜に駆ける', 'YOASOBI', 'ja'],
  ['봄날', 'BTS', 'ko'],
  ['Gangnam Style (강남스타일)', 'PSY', 'ko'],
  ['Idol', 'YOASOBI', 'ja', { artistLanguage: 'ja' }],
  ['Crossing Field', 'LiSA', 'ja', { artistLanguage: 'ja' }],
  ['Gurenge', 'LiSA', 'ja', { isrc: 'JPU901900400' }, 'a romanized title with a JP ISRC'],
  ['Dynamite', 'BTS', 'ko', { artistLanguage: 'ko' }],
  ['DDU DDU', 'SUNMI', 'ko', { isrc: 'KRA381801001' }],
  ['Lemon', '米津玄師', 'ja', { isrc: 'JPU901800100' }],
  ['Lemon', '米津玄師', 'zh', {}, 'a Han-only name without JP/KR evidence reads as Chinese'],
  ['Cupid', 'FIFTY FIFTY', 'ko', { isrc: 'KRA402300010' }],
  // Other languages (rejected at ingest, deleted by cleanup)
  ['Despacito', 'Luis Fonsi', 'es', { artistLanguage: 'es' }],
  ['Por Esos Ojos', 'Fuerza Regida', 'es'],
  ['Mi Gente', 'J Balvin', 'es', {}, 'a clear Spanish title without an artist vote'],
  ['Te Quería Ver', 'Alemán', 'es'],
  ["Pour que tu m'aimes encore", 'Céline Dion', 'fr', { artistLanguage: 'en' }, 'a long, clearly French title overrules an English artist vote'],
  ['Je ne regrette rien', 'Edith Piaf', 'fr'],
  ['Atemlos durch die Nacht', 'Helene Fischer', 'de'],
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

// [titles, isrcs, expected artist language]
const ARTIST_VOTES = [
  [['Dynamite', '봄날', '피 땀 눈물', 'Butter'], [], 'ko'],
  [['Idol', 'Tabun', 'Racing Into The Night'], ['JPU902000001', 'JPU902000002'], 'ja'],
  [['Le monde est à moi', 'Bande organisée', 'La zone', 'Mon pote'], [], 'fr'],
  [['Por Esos Ojos', 'La Sala de Espera', 'Mi Corazón Contigo'], [], 'es'],
  [['Brown Sugar', 'The Door', 'Playa Playa'], [], 'en'],
  [['Hello'], [], null],
];
for (const [titles, isrcs, expected] of ARTIST_VOTES) {
  test(`an artist with ${titles.join(' / ')} votes ${expected}`, () => {
    assert.equal(classifyArtistLanguage({ titles, isrcs }).language, expected);
  });
}

test('a non-Latin script counts only when it is most of the letters', () => {
  assert.equal(scriptLanguage('KoЯn'), null);
  assert.equal(scriptLanguage('DISCIPLΞS'), null);
  assert.equal(scriptLanguage('Кино'), 'ru');
});
