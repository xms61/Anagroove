import assert from 'node:assert/strict';
import { test } from 'node:test';
import { THEMES, themeById, genresForPrompt } from '../../shared/themes.js';
import { ALLOWED_LANGUAGES } from '../../server/db/trackNormalization.js';
import { allowedLanguagesForContext } from '../../server/policy/selectionPolicy.js';
import { DEEZER_GENRE_TAXONOMY } from '../../server/services/deezerMusicProvider.js';
import { validateLivePuzzlePayload } from '../../server/validators.js';

test('theme ids are unique and every theme has a label, icon and description', () => {
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
  for (const theme of THEMES) {
    assert.ok(theme.name && theme.icon && theme.description, theme.id);
  }
});

test('every theme only uses admitted catalog languages', () => {
  for (const theme of THEMES) {
    assert.ok(theme.languages.length > 0, theme.id);
    assert.ok(theme.languages.every(language => ALLOWED_LANGUAGES.includes(language)), theme.id);
  }
});

test('every theme except Mixed has genre clusters, and every theme has crawl seeds', () => {
  for (const theme of THEMES) {
    assert.ok(theme.id === 'all' || theme.genres.length > 0, theme.id);
    assert.ok(theme.seeds.length > 0, theme.id);
  }
});

test('every theme is a valid live-puzzle genre with a live Deezer configuration', () => {
  for (const { id } of THEMES) {
    assert.equal(validateLivePuzzlePayload({ genre: id }).data?.genre, id);
    const config = DEEZER_GENRE_TAXONOMY[id];
    assert.ok(config && (config.chartId !== undefined || config.searches?.length > 0) && config.minFans > 0 && config.minRank > 0, id);
  }
});

test('the selection languages of a theme are the theme\'s own', () => {
  for (const theme of THEMES.filter(t => t.id !== 'all')) {
    assert.deepEqual(allowedLanguagesForContext(theme.id), [...theme.languages], theme.id);
  }
});

test('the removed Latin theme is gone; "mixed" is an old name for Mixed', () => {
  assert.equal(themeById('latin'), undefined);
  assert.equal(themeById('mixed')?.id, 'all');
});

// [genre, prompt, expected genres (subset), genres that must not appear]
const PROMPTS = [
  ['rock', '', ['Rock', 'Classic Rock'], []],
  ['all', '80s Japanese City Pop', ['City Pop', 'Japanese'], ['Pop']],
  ['all', 'pop-punk anthems', ['Punk', 'Emo'], ['Pop']],
  ['all', 'k-pop girl groups', ['K-Pop'], ['Pop']],
  ['all', '90s grunge', ['Grunge'], []],
  ['all', 'classic rock ballads', ['Classic Rock'], ['Rock']],
  ['all', 'songs about rain', [], []],
  ['all', 'underground rap', ['Rap/Hip Hop', 'Hip-Hop', 'Hip Hop'], []],
  ['all', 'trapped in the grapevine', [], ['Rap/Hip Hop']],
  ['all', 'video game music', ['Films/Games'], []],
  ['all', 'french house', ['French House'], []],
  ['all', 'synth-pop', ['Electronic', 'Pop'], []],
];
for (const [genre, prompt, included, excluded] of PROMPTS) {
  test(`genresForPrompt("${genre}", "${prompt}")`, () => {
    const genres = genresForPrompt(genre, prompt);
    for (const g of included) assert.ok(genres.includes(g), `missing ${g} in ${JSON.stringify(genres)}`);
    for (const g of excluded) assert.ok(!genres.includes(g), `unexpected ${g} in ${JSON.stringify(genres)}`);
    if (included.length === 0) assert.deepEqual(genres, []);
  });
}
