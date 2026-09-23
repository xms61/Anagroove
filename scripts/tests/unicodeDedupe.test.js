import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { baseTitleKey } from '../../server/db/trackNormalization.js';
import { runCatalogCleanup } from '../../server/db/catalogCleanup.ts';

const FULLWIDTH_LOVE = String.fromCharCode(0xff2c, 0xff2f, 0xff36, 0xff25);
const HALFWIDTH_IDOL = String.fromCharCode(0xff71, 0xff72, 0xff84, 0xff9e, 0xff99);

test('base title keys keep kana, hangul and kanji', () => {
  for (const title of ['紅蓮華', '炎', '夜に駆ける', 'アイドル', 'あいどる', '사랑', '사랑해']) {
    assert.equal(baseTitleKey(title), title, `${title} keeps its own key`);
  }
  assert.notEqual(baseTitleKey('アイドル'), baseTitleKey('あいどる'), 'katakana and hiragana spellings stay distinct');
});

test('base title keys fold version tags, spacing and width', () => {
  assert.equal(baseTitleKey('紅蓮華 (Remastered 2020)'), '紅蓮華');
  assert.equal(baseTitleKey('夜に駆ける - Live'), '夜に駆ける');
  assert.equal(baseTitleKey('좋은 날'), baseTitleKey('좋은날'));
  assert.equal(baseTitleKey(FULLWIDTH_LOVE), 'love');
  assert.equal(baseTitleKey(HALFWIDTH_IDOL), 'アイドル');
});

test('distinct CJK titles survive ingest and cleanup; true duplicates merge', () => {
  const catalog = new SqliteCatalog(':memory:');
  let nextId = 1;
  const ingest = (title, artist, isrc) => catalog.upsertTrack({
    title, artist, isrc, provider: 'deezer', providerTrackId: String(nextId++), album: 'Album', durationMs: 200000, releaseYear: 2020,
  });

  const guren = ingest('紅蓮華', 'LiSA', 'JPU901900400');
  const homura = ingest('炎', 'LiSA', 'JPU902000500');
  const remaster = ingest('紅蓮華 (Remastered 2020)', 'LiSA', 'JPU901900400');
  ingest('アイドル', 'YOASOBI', 'JPU902300001');
  ingest('夜に駆ける', 'YOASOBI', 'JPU901900001');
  const love = ingest('사랑', 'Artist K', 'KRA402300001');
  const loveYou = ingest('사랑해', 'Artist K', 'KRA402300002');
  const goodDay = ingest('좋은 날', 'IU');
  const goodDayNoSpace = ingest('좋은날', 'IU');

  assert.notEqual(guren.trackId, homura.trackId);
  assert.notEqual(love.trackId, loveYou.trackId);
  assert.ok(remaster.isMerged && remaster.trackId === guren.trackId, 'remaster folds into the original');
  assert.ok(goodDayNoSpace.isMerged && goodDayNoSpace.trackId === goodDay.trackId, 'spacing variant folds into one song');

  const titles = () => catalog.db.prepare('SELECT display_title FROM tracks ORDER BY id').all().map(r => r.display_title);
  const before = titles();
  assert.deepEqual(before, ['紅蓮華', '炎', 'アイドル', '夜に駆ける', '사랑', '사랑해', '좋은 날']);

  runCatalogCleanup(catalog.db, { apply: true });
  assert.deepEqual(titles(), before, 'cleanup keeps every distinct CJK song');
  const languages = catalog.db.prepare('SELECT DISTINCT language FROM tracks ORDER BY language').all().map(r => r.language);
  assert.deepEqual(languages, ['ja', 'ko']);
  catalog.close();
});
