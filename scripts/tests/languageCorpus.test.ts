import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyArtistLanguage, resolveTrackLanguage, scriptLanguage } from '../../server/db/languageClassifier.ts';

// Deleting a track is irreversible, so the corpus leans on English titles that n-gram
// detectors misread. Each row: [title, artist, expected, extra input, why].
// [title, artist, expected language, extra hints, why]
const CORPUS: [string, string, string, Record<string, string>?, string?][] = [
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
const ARTIST_VOTES: [string[], string[], string | null][] = [
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

// Romanized titles and US-registered ISRCs: a scene genre decides with evidence. [artist, genres, isrcs, expected]
const ENGLISH_TITLES = ['Fancy', 'Feel Special', 'The Feels', 'What Is Love', 'Talk that Talk', 'Set Me Free'];
const SCENE_VOTES: [artist: string, genres: string[], isrcs: string[], expected: string, why: string][] = [
  ['TWICE', ['K-Pop', 'Asian Music'], ['US5TA1900001', 'US5TA1900002', 'JPWP02100001'], 'ko', 'a K-pop act Deezer files under Asian Music'],
  ['NewJeans', ['K-Pop'], ['USA2P2300001', 'USA2P2300002', 'KRNAR2300001'], 'ko', 'one Korean registration'],
  ['TOMORROW X TOGETHER', ['K-Pop', 'Anime', 'Asian Music'], ['JPU902200001', 'USA2P2200001', 'USA2P2200002', 'USA2P2200003'], 'ko', 'K-Pop before a Japanese anime tie-in'],
  ['2NE1', ['Asian Music', 'K-Pop'], ['JPB601400001', 'JPB601400002', 'JPB601400003', 'KRA491100001', 'KRB471400001'], 'ko', 'Japanese live recordings of a K-pop group'],
  ['Queen', ['Rock', 'K-Pop'], ['GBUM71000001', 'GBUM71000002', 'GBUM71000003'], 'en', 'a Western act on a Korean chart playlist'],
  ['Kylie Minogue', ['Pop', 'K-Pop'], ['GB5KW0000001', 'GB5KW0000002', 'JPWP00000001'], 'en', 'a Japan edition is no Korean evidence'],
  ['ONE OK ROCK', ['Japanese', 'Rock'], ['JPA271700001', 'USAT21700001', 'USAT21700002', 'USAT21700003'], 'ja', 'a quarter of the ISRCs are Japanese'],
  ['Eve', ['Anime', 'Rap/Hip Hop'], ['JPU902000001', ...Array.from({ length: 7 }, (_, i) => `USIR1000000${i}`)], 'en', 'a few Japanese ISRCs among many'],
  ['Taylor Swift', ['Pop', 'Japanese'], ['USCJY1431309', 'USCJY1431310', 'USCJY1431311'], 'en', 'a Western act on a Japanese chart playlist'],
  ['Pritam', ['Pop', 'Asian Music'], ['INH101000001', 'INH101000002'], 'en', 'Asian Music without a scene genre'],
];
for (const [artist, genres, isrcs, expected, why] of SCENE_VOTES) {
  test(`${artist} (${genres.join(', ')}) votes ${expected}: ${why}`, () => {
    assert.equal(classifyArtistLanguage({ titles: ENGLISH_TITLES, isrcs, name: artist, genres }).language, expected);
  });
}

test('a non-Latin script counts only when it is most of the letters', () => {
  assert.equal(scriptLanguage('KoЯn'), null);
  assert.equal(scriptLanguage('DISCIPLΞS'), null);
  assert.equal(scriptLanguage('Кино'), 'ru');
});
