import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { isAuthenticTrack } from '../../server/policy/selectionPolicy.js';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { baseTitleKey, deezerRankToScore } from '../../server/db/trackNormalization.js';
import { runCatalogMigrations } from '../../server/db/catalogMigrations.js';
import { recomputeCatalogLanguages } from '../../server/db/catalogLanguages.js';
import { checkAuthenticity } from '../../server/policy/authenticityRules.js';
import { CatalogEnricher } from '../../server/crawler/enricher.js';
import { isAuthenticCandidate } from '../../server/crawler/authenticityFilter.js';
import { MusicHarvester, toCatalogCandidate } from '../../server/crawler/harvester.js';
import { routedFetch } from './helpers.js';

test('identity keys keep kana dakuten and composed hangul, and fold Latin accents', () => {
  assert.equal(canonicalArtistKey('アイドル'), 'アイドル');
  assert.notEqual(baseTitleKey('アイドル'), baseTitleKey('アイトル'));
  assert.equal(canonicalArtistKey('봄날'), '봄날');
  assert.equal(canonicalArtistKey('Beyoncé'), 'beyonce');
});

test('migration v3 recomputes stored artist and title keys', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      spotify_id TEXT UNIQUE, deezer_id INTEGER UNIQUE, itunes_artist_id INTEGER UNIQUE, genres_json TEXT, fans_count INTEGER DEFAULT 0);
    CREATE TABLE tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, isrc TEXT UNIQUE, canonical_title TEXT NOT NULL, display_title TEXT NOT NULL,
      artist_id INTEGER NOT NULL, album_name TEXT, duration_ms INTEGER NOT NULL, release_year INTEGER, release_date TEXT, popularity INTEGER DEFAULT 0, is_explicit INTEGER DEFAULT 0);
    INSERT INTO artists (id, canonical_name, display_name) VALUES (1, 'すっと真夜中ていいのに', 'ずっと真夜中でいいのに。');
    INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, popularity) VALUES ('JPU902000077', 'アイトル', 'アイドル', 1, 'アイドル', 213000, 700000);
  `);
  runCatalogMigrations(db);
  assert.equal(db.prepare('SELECT canonical_name FROM artists').get().canonical_name, 'ずっと真夜中でいいのに');
  assert.equal(db.prepare('SELECT canonical_title FROM tracks').get().canonical_title, 'アイドル');
  db.close();
});

test('the shared authenticity rules name the reason', () => {
  assert.equal(checkAuthenticity({ title: 'Kapitel 190 - Tintenherz (Ungekürzt)', artist: 'Cornelia Funke' }).reason, 'spoken_word');
  assert.equal(checkAuthenticity({ title: 'Folge 1: Das Schloss', artist: 'Gruselkabinett' }).reason, 'spoken_word');
  assert.equal(checkAuthenticity({ title: 'Starboy (Piano Cover)', artist: 'Piano Guys' }).reason, 'cover');
  assert.equal(checkAuthenticity({ title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia' }).authentic, true);
});

test('the crawler filter and song selection share the authenticity rules', () => {
  const chapter = { title: 'Kapitel 12 - Der Sturm', artist: 'Hörbuch Sprecher', album: 'Folge 3', preview: 'https://x.test/a.mp3', duration: 200 };
  assert.equal(isAuthenticCandidate(chapter), false);
  assert.equal(isAuthenticTrack(chapter), false);
});

test('upsertTrack refuses spoken word, and a voted Japanese artist keeps English-titled songs as ja', () => {
  const catalog = new SqliteCatalog(':memory:');
  let id = 900000;
  const put = (extra) => catalog.upsertTrack({ durationMs: 210000, provider: 'deezer', providerTrackId: String(id++), album: 'Album', ...extra });

  assert.equal(put({ title: 'Kapitel 5 - Der Anfang', artist: 'Sprecher' }), null);
  assert.equal(catalog.getRejectionStats().inauthentic, 1);

  put({ title: '紅蓮華', artist: 'Test JP Artist', isrc: 'JPU902000011' });
  put({ title: '炎', artist: 'Test JP Artist', isrc: 'JPU902000010' });
  put({ title: 'ごはんを食べよう', artist: 'Test JP Artist' });
  recomputeCatalogLanguages(catalog.db);
  assert.equal(catalog.db.prepare("SELECT primary_language FROM artists WHERE canonical_name = 'test jp artist'").get().primary_language, 'ja');

  const english = put({ title: 'Crossing Field', artist: 'Test JP Artist' });
  assert.equal(catalog.db.prepare('SELECT language FROM tracks WHERE id = ?').get(english.trackId).language, 'ja');
  assert.deepEqual(catalog.countSummary(), { tracks: 4, artists: 1 });
  catalog.close();
});

const deezerTrack = (id, title, artist, extra = {}) => ({
  id, title, artist: { id: 5000 + id, name: artist }, album: { id: 7000 + id, title: `${title} - Single` },
  duration: 200, rank: 650000, preview: `https://cdnt-preview.dzcdn.net/${id}.mp3`, link: `https://www.deezer.com/track/${id}`, ...extra,
});

test('toCatalogCandidate keeps the rank, album id and artist id', () => {
  const candidate = toCatalogCandidate(deezerTrack(1, 'Levitating', 'Dua Lipa'));
  assert.equal(candidate.deezerRank, 650000);
  assert.equal(candidate.rawMetadata.albumId, 7001);
  assert.equal(candidate.artistMetadata.deezerId, 5001);
});

test('Apple chart entries are stored only when an exact Deezer track matches', async () => {
  const catalog = new SqliteCatalog(':memory:');
  const fetchImpl = routedFetch([
    [/marketingtools\.apple\.com\/api\/v2\/jp\//, { feed: { results: [{ artistName: 'YOASOBI', name: 'アイドル' }, { artistName: 'Nobody', name: 'Missing Song' }] } }],
    [/marketingtools\.apple\.com/, { feed: { results: [] } }],
    [/api\.deezer\.com\/search\?q=.*YOASOBI/, { data: [deezerTrack(2, 'アイドル', 'YOASOBI'), deezerTrack(3, 'アイドル (English Version)', 'YOASOBI')] }],
    [/api\.deezer\.com\/search/, { data: [] }],
  ]);
  const result = await new MusicHarvester(catalog, { fetchImpl }).harvestAppleCharts({ storefronts: ['jp'], limit: 10 });
  assert.equal(result.harvested, 1);
  assert.equal(result.unmatched, 1);
  const idol = catalog.db.prepare("SELECT language, deezer_rank FROM tracks WHERE canonical_title = 'アイドル'").get();
  assert.equal(idol?.language, 'ja');
  assert.equal(idol.deezer_rank, 650000);
  catalog.close();
});

test('an out-of-scope artist is skipped before any album request', async () => {
  const catalog = new SqliteCatalog(':memory:');
  const fetchImpl = routedFetch([
    [/search\/artist/, { data: [{ id: 42, name: 'Grupo Norteño', nb_fan: 900000 }] }],
    [/artist\/42\/top/, { data: ['Por Esos Ojos', 'No Pasa Nada', 'La Sala de Espera', 'Mi Corazón Contigo'].map((t, i) => deezerTrack(100 + i, t, 'Grupo Norteño')) }],
  ]);
  const harvester = new MusicHarvester(catalog, { fetchImpl });
  const result = await harvester.harvestArtistDiscography('Grupo Norteño');
  assert.equal(result.skipped, true);
  assert.ok(!fetchImpl.calls.some(url => /\/albums/.test(url)));
  assert.equal(harvester.skippedArtists, 1);
  catalog.close();
});

/** Five seeded tracks and the provider responses the enrichment steps see. */
function enrichmentFixture() {
  const catalog = new SqliteCatalog(':memory:');
  const seed = (title, artist, deezerId, extra = {}) => catalog.upsertTrack({
    title, artist, durationMs: 200000, album: 'A', provider: 'deezer', providerTrackId: String(deezerId), deezerRank: 1000,
    rawMetadata: { albumId: 8000 + deezerId }, artistMetadata: { deezerId: 6000 + deezerId }, ...extra,
  });
  const tracks = {
    levitating: seed('Levitating', 'Dua Lipa', 11),
    starboy: seed('Starboy', 'The Weeknd', 12),
    gone: seed('Gone Song', 'Ghost Act', 13),
    flaky: seed('Flaky Song', 'Flaky Act', 14),
  };
  seed('Owner Song', 'Owner Act', 15, { isrc: 'USUM71607007' });
  const fetchImpl = routedFetch([
    [/api\.deezer\.com\/track\/11$/, { id: 11, isrc: 'GBAHT2000942', release_date: '2020-03-27', rank: 900000 }],
    [/api\.deezer\.com\/track\/12$/, { id: 12, isrc: 'USUM71607007', release_date: '2016-09-21', rank: 800000 }],
    [/api\.deezer\.com\/track\/13$/, { error: { type: 'DataException', code: 800 } }],
    [/api\.deezer\.com\/track\/14$/, { __status: 503 }],
    [/api\.deezer\.com\/track\/15$/, { id: 15, rank: 1000 }],
    [/api\.deezer\.com\/artist\/6011$/, { id: 6011, nb_fan: 12000000 }],
    [/api\.deezer\.com\/album\/8011$/, { id: 8011, genres: { data: [{ name: 'Pop' }, { name: 'Dance' }] } }],
    [/api\.deezer\.com\/artist\//, { nb_fan: 0 }],
    [/api\.deezer\.com\/album\//, { genres: { data: [] } }],
    [/itunes\.apple\.com\/search.*Levitating/, { results: [
      { trackId: 1, artistName: 'Dua Lipa', trackName: 'Levitating (feat. DaBaby)', trackTimeMillis: 260000, previewUrl: 'https://audio.test/wrong.m4a' },
      { trackId: 2, artistId: 99, artistName: 'Dua Lipa', trackName: 'Levitating', trackTimeMillis: 201500, previewUrl: 'https://audio.test/ok.m4a', trackViewUrl: 'https://music.apple.com/x' },
    ] }],
    [/itunes\.apple\.com\/search/, { results: [{ trackId: 3, artistName: 'Someone Else', trackName: 'Starboy', trackTimeMillis: 200000 }] }],
  ]);
  const row = (track) => catalog.db.prepare('SELECT isrc, release_year, deezer_rank, popularity, country_code, enriched_at FROM tracks WHERE id = ?').get(track.trackId);
  return { catalog, tracks, row, enricher: new CatalogEnricher(catalog, { fetchImpl }) };
}

test('Deezer track enrichment fills ISRC, year, registrant and rank', async () => {
  const { catalog, tracks, row, enricher } = enrichmentFixture();
  await enricher.enrichDeezerTracks({ limit: 10 });
  const levitating = row(tracks.levitating);
  assert.equal(levitating.isrc, 'GBAHT2000942');
  assert.equal(levitating.release_year, 2020);
  assert.equal(levitating.country_code, 'GB');
  assert.equal(levitating.deezer_rank, 900000);
  assert.equal(levitating.popularity, deezerRankToScore(900000));
  catalog.close();
});

test('Deezer track enrichment leaves ISRC conflicts for merging, stamps missing tracks and retries errors', async () => {
  const { catalog, tracks, row, enricher } = enrichmentFixture();
  const stats = await enricher.enrichDeezerTracks({ limit: 10 });
  assert.equal(row(tracks.starboy).isrc, null, 'the ISRC belongs to another row');
  assert.equal(row(tracks.starboy).release_year, 2016);
  assert.equal(stats.isrcConflicts, 1);
  assert.notEqual(row(tracks.gone).enriched_at, null, 'unknown to Deezer: stamped, not retried');
  assert.equal(stats.missing, 1);
  assert.equal(row(tracks.flaky).enriched_at, null, 'a 503 leaves the track for the next run');
  assert.equal(stats.errors, 1);
  assert.equal((await enricher.enrichDeezerTracks({ limit: 10 })).checked, 1);
  catalog.close();
});

test('artist enrichment fills fans and album genres', async () => {
  const { catalog, enricher } = enrichmentFixture();
  const stats = await enricher.enrichArtists({ limit: 10 });
  const dua = catalog.db.prepare("SELECT fans_count, genres_json, enriched_at FROM artists WHERE canonical_name = 'dua lipa'").get();
  assert.equal(dua.fans_count, 12000000);
  assert.ok(JSON.parse(dua.genres_json).includes('Dance'));
  assert.ok(dua.enriched_at);
  assert.ok(stats.checked >= 1);
  catalog.close();
});

test('the iTunes cross-reference needs artist, base title and duration, and never creates tracks', async () => {
  const { catalog, tracks, enricher } = enrichmentFixture();
  const before = catalog.countSummary().tracks;
  const stats = await enricher.crossReferenceItunes({ limit: 10 });
  const links = catalog.db.prepare("SELECT track_id, provider_track_id FROM track_providers WHERE provider = 'itunes'").all();
  assert.deepEqual(links.map(l => [l.track_id, l.provider_track_id]), [[tracks.levitating.trackId, '2']]);
  assert.equal(catalog.countSummary().tracks, before);
  assert.ok(stats.noMatch >= 1);
  assert.equal(catalog.db.prepare('SELECT COUNT(*) AS c FROM tracks WHERE itunes_checked_at IS NULL').get().c, 0, 'every checked track is stamped');
  catalog.close();
});

test('one album request dates every catalog track on it; unknown albums are stamped, not retried', async () => {
  const catalog = new SqliteCatalog(':memory:');
  const seed = (title, deezerId, albumId) => catalog.upsertTrack({
    title, artist: 'Album Artist', durationMs: 200000, album: 'X', provider: 'deezer', providerTrackId: String(deezerId), deezerRank: 1000,
    rawMetadata: albumId ? { albumId } : null,
  }).trackId;
  const onAlbum = [seed('First Song', 31, 700), seed('Second Song', 32, 700), seed('Third Song', 33, null)];
  const gone = seed('Gone Song', 34, 701);
  const enricher = new CatalogEnricher(catalog, {
    fetchImpl: routedFetch([
      [/api\.deezer\.com\/album\/700$/, { id: 700, release_date: '2011-05-02', tracks: { data: [{ id: 31 }, { id: 32 }, { id: 33 }] } }],
      [/api\.deezer\.com\/album\/701$/, { error: { type: 'DataException', code: 800 } }],
    ]),
  });
  const row = (id) => catalog.db.prepare('SELECT release_year, release_date, album_checked_at FROM tracks WHERE id = ?').get(id);

  const stats = await enricher.enrichAlbums({ limit: 10 });
  assert.equal(stats.checked, 2);
  assert.equal(stats.yearFilled, 3, 'the third track matched through the album track list');
  for (const id of onAlbum) assert.deepEqual([row(id).release_year, row(id).release_date], [2011, '2011-05-02']);
  assert.equal(row(gone).release_year, null);
  assert.notEqual(row(gone).album_checked_at, null);
  assert.equal(stats.missing, 1);
  assert.equal((await enricher.enrichAlbums({ limit: 10 })).checked, 0);
  catalog.close();
});
