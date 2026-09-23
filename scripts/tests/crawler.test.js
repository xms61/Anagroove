import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { isAuthenticTrack } from '../../server/policy/selectionPolicy.js';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { baseTitleKey, deezerRankToScore } from '../../server/db/trackNormalization.js';
import { runCatalogMigrations } from '../../server/db/catalogMigrations.js';
import { resolveTrackLanguage, classifyArtistLanguage } from '../../server/db/languageClassifier.js';
import { recomputeCatalogLanguages } from '../../server/db/catalogLanguages.js';
import { checkAuthenticity } from '../../server/policy/authenticityRules.js';
import { CatalogEnricher } from '../../server/crawler/enricher.js';
import { DatabaseSync } from 'node:sqlite';
import { isAuthenticCandidate } from '../../server/crawler/authenticityFilter.js';
import {
  MusicHarvester,
  toCatalogCandidate,
  CURATED_PLAYLIST_SEEDS,
  MUSIC_LEXICON_SEEDS,
} from '../../server/crawler/harvester.js';
import { routedFetch } from './helpers.js';

test('Language Classifier, Authenticity Rules, Harvester & Enrichment', async () => {
  // 1. Language classifier
  const lang = (title, artist, isrc = null, artistLanguage = null) => resolveTrackLanguage({ title, artist, isrc, artistLanguage });
  assert(lang('Die With A Smile', 'Lady Gaga') === 'en' && lang('Die Young', 'Kesha', null, 'en') === 'en', '"Die ..." English titles are not German');
  assert(lang('Crazy Story, Pt. 3', 'King Von') === 'en', 'Artist names are never run through the text detector');
  assert(lang('Viva La Vida', 'Coldplay', null, 'en') === 'en', 'Short foreign phrase keeps the artist catalog language');
  assert(lang('Despacito', 'Luis Fonsi', null, 'es') === 'es' && lang('Por Esos Ojos', 'Fuerza Regida') === 'es', 'Spanish songs are detected');
  assert(lang('Gurenge', 'LiSA', 'JPU901900400') === 'ja' && lang('Crossing Field', 'LiSA', null, 'ja') === 'ja', 'Romanized/English titles by Japanese artists are ja');
  assert(lang('DDU DDU', 'SUNMI', 'KRA381801001') === 'ko', 'KR-registered track by an unknown artist is ko');
  assert(lang('PENTHOUSE', 'Unknown Act') === 'en', 'Single-word titles never trigger a foreign-language verdict on their own');
  assert(lang('Atemlos durch die Nacht', 'Helene Fischer') === 'de', 'Multi-word German title is de');
  assert(classifyArtistLanguage({ titles: ['Dynamite', '봄날', '피 땀 눈물', 'Butter'] }).language === 'ko', 'Artist with hangul titles votes ko');
  assert(classifyArtistLanguage({ titles: ['Idol', 'Tabun', 'Racing Into The Night'], isrcs: ['JPU902000001', 'JPU902000002'] }).language === 'ja', 'Artist with JP-registered ISRCs votes ja');
  assert(classifyArtistLanguage({ titles: ['Le monde est à moi', 'Bande organisée', 'La zone', 'Mon pote'] }).language === 'fr', 'French catalog votes fr');
  assert(classifyArtistLanguage({ titles: ['Hello'] }).language === null, 'Too few titles leaves the artist language unknown');

  // 1b. Identity keys keep kana dakuten and composed hangul; Latin accents still fold
  assert(canonicalArtistKey('アイドル') === 'アイドル' && baseTitleKey('アイドル') !== baseTitleKey('アイトル'), 'Kana dakuten survive identity keys (アイドル is not アイトル)');
  assert(canonicalArtistKey('봄날') === '봄날' && canonicalArtistKey('Beyoncé') === 'beyonce', 'Hangul stays composed while Latin accents fold');
  const keyDb = new DatabaseSync(':memory:');
  keyDb.exec(`
    CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      spotify_id TEXT UNIQUE, deezer_id INTEGER UNIQUE, itunes_artist_id INTEGER UNIQUE, genres_json TEXT, fans_count INTEGER DEFAULT 0);
    CREATE TABLE tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, isrc TEXT UNIQUE, canonical_title TEXT NOT NULL, display_title TEXT NOT NULL,
      artist_id INTEGER NOT NULL, album_name TEXT, duration_ms INTEGER NOT NULL, release_year INTEGER, release_date TEXT, popularity INTEGER DEFAULT 0, is_explicit INTEGER DEFAULT 0);
    INSERT INTO artists (id, canonical_name, display_name) VALUES (1, 'すっと真夜中ていいのに', 'ずっと真夜中でいいのに。');
    INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, popularity) VALUES ('JPU902000077', 'アイトル', 'アイドル', 1, 'アイドル', 213000, 700000);
  `);
  runCatalogMigrations(keyDb);
  assert(keyDb.prepare('SELECT canonical_name FROM artists').get().canonical_name === 'ずっと真夜中でいいのに'
    && keyDb.prepare('SELECT canonical_title FROM tracks').get().canonical_title === 'アイドル', 'Migration v3 recomputes stored artist and title keys');
  keyDb.close();

  // 2. Shared authenticity rules
  assert(checkAuthenticity({ title: 'Kapitel 190 - Tintenherz (Ungekürzt)', artist: 'Cornelia Funke' }).reason === 'spoken_word', 'Audiobook chapters are spoken word');
  assert(checkAuthenticity({ title: 'Folge 1: Das Schloss', artist: 'Gruselkabinett' }).reason === 'spoken_word', 'Radio-play artists are spoken word');
  assert(checkAuthenticity({ title: 'Starboy (Piano Cover)', artist: 'Piano Guys' }).reason === 'cover', 'Covers are rejected');
  assert(checkAuthenticity({ title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia' }).authentic === true, 'Normal releases are authentic');
  const kapitel = { title: 'Kapitel 12 - Der Sturm', artist: 'Hörbuch Sprecher', album: 'Folge 3', preview: 'https://x.test/a.mp3', duration: 200 };
  assert(isAuthenticCandidate(kapitel) === false && isAuthenticTrack(kapitel) === false, 'Crawler filter and song selection share the same rules');

  // 3. Catalog write path: authenticity gate and artist-language vote
  const cat = new SqliteCatalog(':memory:');
  let pid = 900000;
  const put = (extra) => cat.upsertTrack({ durationMs: 210000, provider: 'deezer', providerTrackId: String(pid++), album: 'Album', ...extra });
  assert(put({ title: 'Kapitel 5 - Der Anfang', artist: 'Sprecher' }) === null && cat.getRejectionStats().inauthentic === 1, 'upsertTrack rejects spoken word as inauthentic');
  put({ title: '紅蓮華', artist: 'Test JP Artist', isrc: 'JPU902000011' });
  put({ title: '炎', artist: 'Test JP Artist', isrc: 'JPU902000010' });
  put({ title: 'ごはんを食べよう', artist: 'Test JP Artist' });
  recomputeCatalogLanguages(cat.db);
  assert(cat.db.prepare("SELECT primary_language FROM artists WHERE canonical_name = 'test jp artist'").get().primary_language === 'ja', 'Artist language is voted from the catalog');
  const english = put({ title: 'Crossing Field', artist: 'Test JP Artist' });
  assert(cat.db.prepare('SELECT language FROM tracks WHERE id = ?').get(english.trackId).language === 'ja', 'New English-titled track inherits the Japanese artist language');
  assert(cat.countSummary().tracks === 4 && cat.countSummary().artists === 1, 'countSummary returns cheap track/artist counts');

  // 4. Harvester (mocked network)
  const deezerTrack = (id, title, artist, extra = {}) => ({
    id, title, artist: { id: 5000 + id, name: artist }, album: { id: 7000 + id, title: `${title} - Single` },
    duration: 200, rank: 650000, preview: `https://cdnt-preview.dzcdn.net/${id}.mp3`, link: `https://www.deezer.com/track/${id}`, ...extra,
  });
  const candidate = toCatalogCandidate(deezerTrack(1, 'Levitating', 'Dua Lipa'));
  assert(candidate.deezerRank === 650000 && candidate.rawMetadata.albumId === 7001 && candidate.artistMetadata.deezerId === 5001, 'toCatalogCandidate keeps rank, album id and artist id');
  assert(!MUSIC_LEXICON_SEEDS.includes('amor') && !MUSIC_LEXICON_SEEDS.includes('liebe') && CURATED_PLAYLIST_SEEDS.includes('top japan'), 'Seeds target English, Japanese and Korean music');

  const harvestCat = new SqliteCatalog(':memory:');
  const chartFetch = routedFetch([
    [/marketingtools\.apple\.com\/api\/v2\/jp\//, { feed: { results: [{ artistName: 'YOASOBI', name: 'アイドル' }, { artistName: 'Nobody', name: 'Missing Song' }] } }],
    [/marketingtools\.apple\.com/, { feed: { results: [] } }],
    [/api\.deezer\.com\/search\?q=.*YOASOBI/, { data: [deezerTrack(2, 'アイドル', 'YOASOBI'), deezerTrack(3, 'アイドル (English Version)', 'YOASOBI')] }],
    [/api\.deezer\.com\/search/, { data: [] }],
  ]);
  const chartHarvester = new MusicHarvester(harvestCat, { fetchImpl: chartFetch });
  const chartRes = await chartHarvester.harvestAppleCharts({ storefronts: ['jp'], limit: 10 });
  const idolRow = harvestCat.db.prepare("SELECT display_title, language, deezer_rank FROM tracks WHERE canonical_title = 'アイドル'").get();
  assert(chartRes.harvested === 1 && chartRes.unmatched === 1, 'Apple chart entries are matched to exact Deezer tracks');
  assert(idolRow?.language === 'ja' && idolRow.deezer_rank === 650000, 'Chart track is stored with language and Deezer rank');

  const skipFetch = routedFetch([
    [/search\/artist/, { data: [{ id: 42, name: 'Grupo Norteño', nb_fan: 900000 }] }],
    [/artist\/42\/top/, { data: ['Por Esos Ojos', 'No Pasa Nada', 'La Sala de Espera', 'Mi Corazón Contigo'].map((t, i) => deezerTrack(100 + i, t, 'Grupo Norteño')) }],
  ]);
  const skipHarvester = new MusicHarvester(harvestCat, { fetchImpl: skipFetch });
  const skipped = await skipHarvester.harvestArtistDiscography('Grupo Norteño');
  assert(skipped.skipped === true && !skipFetch.calls.some(u => /\/albums/.test(u)) && skipHarvester.skippedArtists === 1, 'Out-of-scope artists are skipped before album requests');

  // 5. Enrichment (mocked network)
  const enrichCat = new SqliteCatalog(':memory:');
  const seed = (title, artist, deezerId, extra = {}) => enrichCat.upsertTrack({ title, artist, durationMs: 200000, album: 'A', provider: 'deezer', providerTrackId: String(deezerId), deezerRank: 1000, rawMetadata: { albumId: 8000 + deezerId }, artistMetadata: { deezerId: 6000 + deezerId }, ...extra });
  const t1 = seed('Levitating', 'Dua Lipa', 11);
  const t2 = seed('Starboy', 'The Weeknd', 12);
  const t3 = seed('Gone Song', 'Ghost Act', 13);
  const t4 = seed('Flaky Song', 'Flaky Act', 14);
  seed('Owner Song', 'Owner Act', 15, { isrc: 'USUM71607007' });
  const enrichFetch = routedFetch([
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
  const enricher = new CatalogEnricher(enrichCat, { fetchImpl: enrichFetch });
  const deezerStats = await enricher.enrichDeezerTracks({ limit: 10 });
  const row = (id) => enrichCat.db.prepare('SELECT isrc, release_year, release_date, deezer_rank, popularity, country_code, enriched_at FROM tracks WHERE id = ?').get(id);
  assert(row(t1.trackId).isrc === 'GBAHT2000942' && row(t1.trackId).release_year === 2020 && row(t1.trackId).country_code === 'GB', 'Deezer enrichment fills ISRC, release year and registrant');
  assert(row(t1.trackId).deezer_rank === 900000 && row(t1.trackId).popularity === deezerRankToScore(900000), 'Deezer enrichment refreshes rank and the 0-100 score');
  assert(row(t2.trackId).isrc === null && deezerStats.isrcConflicts === 1 && row(t2.trackId).release_year === 2016, 'ISRC owned by another row is not duplicated (left for merging)');
  assert(row(t3.trackId).enriched_at !== null && deezerStats.missing === 1, 'Tracks Deezer no longer knows are stamped, not retried');
  assert(row(t4.trackId).enriched_at === null && deezerStats.errors === 1, 'Transient errors leave the track for the next run');
  assert((await enricher.enrichDeezerTracks({ limit: 10 })).checked === 1, 'A second run only retries the failed track');

  const artistStats = await enricher.enrichArtists({ limit: 10 });
  const dua = enrichCat.db.prepare("SELECT fans_count, genres_json, enriched_at FROM artists WHERE canonical_name = 'dua lipa'").get();
  assert(dua.fans_count === 12000000 && JSON.parse(dua.genres_json).includes('Dance') && dua.enriched_at && artistStats.checked >= 1, 'Artist enrichment fills fans and album genres');

  const tracksBefore = enrichCat.countSummary().tracks;
  const itunesStats = await enricher.crossReferenceItunes({ limit: 10 });
  const itunesLink = enrichCat.db.prepare("SELECT track_id, provider_track_id FROM track_providers WHERE provider = 'itunes'").all();
  assert(itunesLink.length === 1 && itunesLink[0].track_id === t1.trackId && itunesLink[0].provider_track_id === '2', 'iTunes match requires artist, base title and duration');
  assert(enrichCat.countSummary().tracks === tracksBefore && itunesStats.noMatch >= 1, 'iTunes cross-reference never creates tracks');
  assert(enrichCat.db.prepare('SELECT COUNT(*) AS c FROM tracks WHERE itunes_checked_at IS NULL').get().c === 0, 'Every checked track is stamped so the queue advances');

  cat.close();
  harvestCat.close();
  enrichCat.close();
});
