import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog, normalizeDedupeTitle, normalizeDedupeArtist } from '../../server/db/sqliteCatalog.js';
import {
  classifyVersion,
  baseTitleKey,
  detectTrackLanguage,
  deezerRankToScore,
  normalizePopularity,
  normalizeIsrc,
  normalizeReleaseYear,
} from '../../server/db/trackNormalization.js';
import { runCatalogMigrations, LATEST_CATALOG_VERSION } from '../../server/db/catalogMigrations.js';
import { DatabaseSync } from 'node:sqlite';
import { isAuthenticCandidate } from '../../server/crawler/authenticityFilter.js';
import { TokenBucketRateLimiter } from '../../server/crawler/rateLimiter.js';
import {
  MusicHarvester,
  CURATED_PLAYLIST_SEEDS,
  DECADE_GENRE_SEEDS,
  YEAR_GENRE_SEEDS,
  BIGRAM_SEEDS,
  MUSIC_LEXICON_SEEDS,
  FOUNDATION_ARTISTS,
} from '../../server/crawler/harvester.js';
import { STREAMED_ARTISTS, STREAMED_ARTIST_NAMES } from '../../server/crawler/artistBaseline.js';

test('SQLite music catalog, authenticity filter, rate limiter, schema v2 & admission policy', async () => {
  // 1. Authenticity Filter Tests
  assert(!isAuthenticCandidate({ title: 'Bohemian Rhapsody (Cover)', artist: 'Some Cover Band', preview: 'http://example.com/audio.mp3', duration: 200 }), 'Rejects title containing (Cover)');
  assert(!isAuthenticCandidate({ title: 'Smells Like Teen Spirit', artist: 'Karaoke All Stars', preview: 'http://example.com/audio.mp3', duration: 210 }), 'Rejects artist with Karaoke in name');
  assert(!isAuthenticCandidate({ title: 'Wonderwall', artist: 'Oasis Tribute Band', preview: 'http://example.com/audio.mp3', duration: 250 }), 'Rejects tribute band artist');
  assert(!isAuthenticCandidate({ title: 'Hotel California', artist: 'The Eagles', album: 'Lullaby Renditions of Eagles', preview: 'http://example.com/audio.mp3', duration: 180 }), 'Rejects lullaby album renditions');
  assert(!isAuthenticCandidate({ title: 'Billie Jean', artist: 'Michael Jackson', preview: '', duration: 290 }), 'Rejects track missing preview URL');
  assert(!isAuthenticCandidate({ title: 'Short Clip', artist: 'Quick Artist', preview: 'http://example.com/audio.mp3', duration: 20 }), 'Rejects track shorter than 45 seconds');
  assert(isAuthenticCandidate({ title: 'Around the World', artist: 'Daft Punk', album: 'Homework', preview: 'https://cdnt-preview.dzcdn.net/sample.mp3', duration: 429 }), 'Permits authentic studio track with preview');
  assert(isAuthenticCandidate({ trackName: 'Bohemian Rhapsody', artistName: 'Queen', collectionName: 'A Night At The Opera', previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a', trackTimeMillis: 355000 }), 'Permits authentic iTunes track mapping');

  // 2. Token Bucket Rate Limiter Tests
  const limiter = new TokenBucketRateLimiter({ refillRatePerSec: 50, maxTokens: 2 });
  await limiter.acquireToken();
  await limiter.acquireToken();
  assert(limiter.tokens < 1, 'Token bucket correctly consumes tokens');
  await new Promise(r => setTimeout(r, 40));
  await limiter.acquireToken();
  assert(true, 'Token bucket refills and permits acquisition');

  // 3. Normalization Key Tests
  assert(normalizeDedupeTitle('Bohemian Rhapsody (Remastered 2011)') === 'bohemianrhapsody', 'Normalizes title stripping remaster parenthetical');
  assert(normalizeDedupeTitle('Under Pressure (feat. David Bowie) [Deluxe Version]') === 'underpressure', 'Normalizes title stripping feature and deluxe version');
  assert(normalizeDedupeTitle('Stayin Alive (Radio Edit)') === 'stayinalive', 'Normalizes title stripping radio edit suffix');
  assert(normalizeDedupeArtist('The Beatles') === 'the beatles', 'Normalizes artist canonical identity');

  // 4. Multi-Vector Catalog Harvester Seeds Tests
  assert(CURATED_PLAYLIST_SEEDS.length >= 35, 'Curated playlist seeds catalog contains >= 35 high-yield queries');
  assert(DECADE_GENRE_SEEDS.length === 105, 'Decade x Genre matrix contains exactly 105 combinations (7 decades x 15 genres)');
  assert(YEAR_GENRE_SEEDS.length >= 1500, 'Year x Genre matrix contains >= 1500 combinations');
  assert(BIGRAM_SEEDS.length >= 50, 'Bigram seeds roster contains >= 50 high-frequency bigrams');
  assert(MUSIC_LEXICON_SEEDS.length >= 250, 'Music lexicon contains >= 250 high-frequency seeds');
  assert(STREAMED_ARTISTS.length === 500, 'Streamed artists dataset loads all 500 most-streamed Spotify artists');
  assert(STREAMED_ARTIST_NAMES[0] === 'Drake', 'First streamed artist is Drake ordered by total streams');
  assert((STREAMED_ARTISTS[0]?.totalStreams || 0) > 100000, 'Artist metadata contains numeric stream counts');
  assert(FOUNDATION_ARTISTS.length >= 500, 'Foundation artists roster incorporates 500 most-streamed baseline');
  assert(FOUNDATION_ARTISTS.includes('Taylor Swift') && FOUNDATION_ARTISTS.includes('Queen'), 'Foundation roster contains modern streaming giants and heritage icons');

  // 5. In-Memory SQLite Catalog Tests
  const memCatalog = new SqliteCatalog(':memory:');
  const harvester = new MusicHarvester(memCatalog);
  assert(typeof harvester.harvestCuratedPlaylists === 'function', 'Harvester defines harvestCuratedPlaylists method');
  assert(typeof harvester.runFullHarvest === 'function', 'Harvester defines runFullHarvest method');
  const initialStats = memCatalog.getStats();
  assert(initialStats.tracks === 0 && initialStats.artists === 0, 'Initializes empty in-memory catalog');

  // Ingest Deezer Track with ISRC
  const res1 = memCatalog.upsertTrack({
    title: 'Get Lucky (feat. Pharrell Williams)',
    artist: 'Daft Punk',
    isrc: 'USQX91300105',
    album: 'Random Access Memories',
    durationMs: 369000,
    releaseYear: 2013,
    popularity: 88,
    provider: 'deezer',
    providerTrackId: '67238732',
    sampleUrl: 'https://cdnt-preview.dzcdn.net/getlucky.mp3',
    sampleCodec: 'mp3',
    sampleDurationSec: 30,
    artistMetadata: { deezerId: 27, fansCount: 4000000 },
  });
  assert(res1 && res1.isNew === true && res1.isMerged === false, 'First track inserted as new canonical track');
  const insertedTrackRow = memCatalog.db.prepare('SELECT country_code, language FROM tracks WHERE id = ?').get(res1.trackId);
  assert(insertedTrackRow.country_code === 'US', 'ISRC country code correctly extracted as US');
  assert(insertedTrackRow.language === 'en', 'English language accurately tagged');

  // Ingest Spotify Track with identical ISRC (Tier 1 100% Master Match)
  const res2 = memCatalog.upsertTrack({
    title: 'Get Lucky',
    artist: 'Daft Punk',
    isrc: 'USQX91300105',
    album: 'Random Access Memories (Deluxe)',
    durationMs: 369640,
    releaseYear: 2013,
    popularity: 92,
    provider: 'spotify',
    providerTrackId: '2Foc5Q5nqNiosCNqttzHof',
    sampleUrl: null,
    artistMetadata: { spotifyId: '4tZwfgrHOc3mvqYxwDoOD1' },
  });
  assert(res2 && res2.isNew === false && res2.isMerged === true && res2.trackId === res1.trackId, 'Tier 1 ISRC match merges Spotify track into canonical record');

  // Ingest iTunes release without ISRC: Tier 2 matches artist + base title regardless of duration
  const res3 = memCatalog.upsertTrack({
    title: 'Get Lucky',
    artist: 'Daft Punk',
    album: 'Get Lucky - Single',
    durationMs: 248000,
    provider: 'itunes',
    providerTrackId: '636988899',
    sampleUrl: 'https://audio-ssl.itunes.apple.com/getlucky.m4a',
    sampleCodec: 'aac',
    sampleDurationSec: 30,
    artistMetadata: { itunesArtistId: 546829 },
  });
  assert(res3 && res3.isNew === false && res3.isMerged === true && res3.trackId === res1.trackId, 'Tier 2 base-title key merges the iTunes release of the same song');

  // Verify Samples & Providers Attached
  const postMergeStats = memCatalog.getStats();
  assert(postMergeStats.tracks === 1, 'Total canonical tracks remains 1 after multi-provider merge');
  assert(postMergeStats.audioSamples === 2, 'Stores 2 audio samples (Deezer MP3 and iTunes AAC)');
  assert(postMergeStats.providerLinks === 3, 'Stores 3 provider links (Deezer, Spotify, iTunes)');
  assert(postMergeStats.crossReferencedTracks === 1, 'Identifies track as successfully cross-referenced');

  // Batch Ingestion Test
  const batchRes = memCatalog.upsertBatch([
    {
      title: 'One More Time',
      artist: 'Daft Punk',
      album: 'Discovery',
      durationMs: 320000,
      releaseYear: 2001,
      provider: 'deezer',
      providerTrackId: '3135556',
      sampleUrl: 'https://cdnt-preview.dzcdn.net/onemoretime.mp3',
    },
    {
      title: 'Harder, Better, Faster, Stronger',
      artist: 'Daft Punk',
      album: 'Discovery',
      durationMs: 224000,
      releaseYear: 2001,
      provider: 'deezer',
      providerTrackId: '3135557',
      sampleUrl: 'https://cdnt-preview.dzcdn.net/harder.mp3',
    },
  ]);
  assert(batchRes.inserted === 2 && batchRes.total === 2, 'Batch transaction cleanly inserts multiple tracks');

  // Random Playable Track Query Test
  const randomPlayable = memCatalog.getRandomPlayableTracks({ count: 5, yearRange: { start: 2000, end: 2015 } });
  assert(randomPlayable.length >= 2, 'Queries random playable tracks within release year range');
  assert(randomPlayable.every(t => t.sample_url && t.release_year >= 2000 && t.release_year <= 2015), 'All returned tracks have verified samples and match year bounds');

  // Schema v2: admission policy, Unicode base titles, 0-100 popularity, trigram FTS

  // Catalog Schema v2 & Admission Policy
  assert(memCatalog.db.prepare('PRAGMA user_version').get().user_version === LATEST_CATALOG_VERSION, 'Fresh catalog is migrated to the latest schema version');
  const base = { durationMs: 200000, provider: 'deezer', album: 'Album', releaseYear: 2020 };
  let nextId = 700000;
  const ingest = (extra) => memCatalog.upsertTrack({ ...base, providerTrackId: String(nextId++), ...extra });

  assert(ingest({ title: 'Get Lucky (Radio Edit)', artist: 'Daft Punk' }) === null, 'Radio edit is rejected (originals only)');
  assert(ingest({ title: 'Around The World - Live', artist: 'Daft Punk' }) === null, 'Live recording is rejected');
  assert(ingest({ title: 'One More Time (Skrillex Remix)', artist: 'Daft Punk' }) === null, 'Remix is rejected');
  assert(ingest({ title: 'Digital Love', artist: 'Daft Punk', album: 'Alive 2007 (Live at Bercy)' }) === null, 'Track from a live album is rejected');
  assert(ingest({ title: 'Vida de Amor', artist: 'Los Cantantes' }) === null, 'Spanish-language track is rejected');
  assert(ingest({ title: 'Короли ночи', artist: 'Группа' }) === null, 'Cyrillic track is rejected');
  assert(ingest({ title: 'Short Clip', artist: 'Clipper', durationMs: 8000 }) === null, 'Track under 45 seconds is rejected');
  const rejections = memCatalog.getRejectionStats();
  assert(rejections.version === 4 && rejections.language === 2 && rejections.duration === 1, 'Rejections are counted per policy reason');

  const jaTrack = ingest({ title: '夜に駆ける', artist: 'YOASOBI', isrc: 'JPU902000001' });
  const jaRow = jaTrack && memCatalog.db.prepare('SELECT canonical_title, language FROM tracks WHERE id = ?').get(jaTrack.trackId);
  assert(jaRow?.canonical_title === '夜に駆ける' && jaRow.language === 'ja', 'Kana title is stored with a non-empty Unicode base title as ja');
  const kanjiTrack = ingest({ title: '紅蓮華', artist: 'LiSA', isrc: 'JPU901900400' });
  assert(kanjiTrack && memCatalog.db.prepare('SELECT language FROM tracks WHERE id = ?').get(kanjiTrack.trackId).language === 'ja', 'Kanji-only title with a JP ISRC is ja');
  const koTrack = ingest({ title: '봄날', artist: 'BTS' });
  assert(koTrack && memCatalog.db.prepare('SELECT language FROM tracks WHERE id = ?').get(koTrack.trackId).language === 'ko', 'Hangul title is ko');
  assert(ingest({ title: '月亮代表我的心', artist: '邓丽君' }) === null, 'Chinese title without JP/KR ISRC is rejected');

  const remaster = ingest({ title: 'Hey Jude - Remastered 2015', artist: 'The Beatles', durationMs: 431000, deezerRank: 562000 });
  const original = ingest({ title: 'Hey Jude', artist: 'The Beatles', durationMs: 425000, spotifyPopularity: 82 });
  const heyJude = memCatalog.db.prepare('SELECT display_title, version_type, popularity, deezer_rank, spotify_popularity FROM tracks WHERE id = ?').get(remaster?.trackId);
  assert(original?.isMerged === true && original.trackId === remaster.trackId, 'Remaster and original of one song share a single row');
  assert(heyJude.display_title === 'Hey Jude' && heyJude.version_type === 'original', 'Plain original replaces the remaster as the displayed release');
  assert(heyJude.deezer_rank === 562000 && heyJude.spotify_popularity === 82 && heyJude.popularity === 82, 'Raw provider popularity is kept and the 0-100 score prefers Spotify');

  const legacyPop = ingest({ title: 'Legacy Rank Song', artist: 'Old Crawler', popularity: 950000 });
  assert(memCatalog.db.prepare('SELECT popularity, deezer_rank FROM tracks WHERE id = ?').get(legacyPop.trackId).popularity === deezerRankToScore(950000), 'Legacy Deezer rank passed as popularity is normalized to 0-100');

  const ftsHits = memCatalog.db.prepare('SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?').all('"駆ける"');
  assert(ftsHits.length === 1 && ftsHits[0].rowid === jaTrack.trackId, 'Trigram FTS finds a Japanese substring');
  const themed = memCatalog.searchCatalogByTheme({ ftsQuery: '"lucky"', allowSampleless: true, limit: 5 });
  assert(themed.some(t => t.title.startsWith('Get Lucky')), 'searchCatalogByTheme uses the rebuilt FTS index');
  memCatalog.db.prepare('DELETE FROM tracks WHERE id = ?').run(jaTrack.trackId);
  assert(memCatalog.db.prepare('SELECT COUNT(*) AS c FROM tracks_fts WHERE tracks_fts MATCH ?').get('"駆ける"').c === 0, 'FTS trigger removes deleted tracks');
  const ftsCount = memCatalog.db.prepare('SELECT COUNT(*) AS c FROM tracks_fts').get().c;
  const trackCount = memCatalog.db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;
  assert(ftsCount === trackCount, 'FTS row count matches track count');

  memCatalog.close();

  // Normalization helpers
  assert(classifyVersion('Levels (Original Mix)') === 'original', '"Original Mix" is an original recording');
  assert(classifyVersion('Dynamite (Japanese Version)') === 'alternate', 'Language version is an alternate, not the original');
  assert(classifyVersion("Love Story (Taylor's Version)") === 'rerecord', 'Re-recording is detected');
  assert(classifyVersion('Interlude - The Trio') === 'original' && baseTitleKey('Interlude - The Trio') === 'interludethetrio', 'Unrecognised dash suffix stays part of the title');
  assert(baseTitleKey('Song - Single Version') === 'song' && baseTitleKey('Let It Go (From "Frozen")') === 'letitgo', 'Credit and release decorations are stripped from base titles');
  assert(detectTrackLanguage('紅蓮華', 'LiSA') === 'zh' && detectTrackLanguage('紅蓮華', 'LiSA', { isrc: 'JPU901900400' }) === 'ja', 'Han-only language depends on the ISRC registrant');
  assert(deezerRankToScore(562000) === 76 && deezerRankToScore(10000) === 41 && deezerRankToScore(0) === 0, 'Deezer rank maps onto the calibrated 0-100 scale');
  assert(normalizePopularity({ spotifyPopularity: 55, deezerRank: 900000 }) === 55 && normalizePopularity({ popularity: 64 }) === 64, 'Spotify popularity is the reference score');
  assert(normalizeIsrc('us-qx9-13-00105') === 'USQX91300105' && normalizeIsrc('BAD') === null, 'ISRCs are normalized or dropped');
  assert(normalizeReleaseYear(1850) === null && normalizeReleaseYear('2013-05-17') === 2013, 'Release years are range-checked');

  // Migrating a legacy (v0) catalog
  const legacyDb = new DatabaseSync(':memory:');
  legacyDb.exec(`
    CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      spotify_id TEXT UNIQUE, deezer_id INTEGER UNIQUE, itunes_artist_id INTEGER UNIQUE, genres_json TEXT, fans_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, isrc TEXT UNIQUE, canonical_title TEXT NOT NULL, display_title TEXT NOT NULL,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE, album_name TEXT, duration_ms INTEGER NOT NULL,
      release_year INTEGER, release_date TEXT, popularity INTEGER DEFAULT 0, is_explicit INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE track_providers (id INTEGER PRIMARY KEY AUTOINCREMENT, track_id INTEGER NOT NULL, provider TEXT NOT NULL,
      provider_track_id TEXT NOT NULL, external_url TEXT, raw_metadata_json TEXT, harvested_at TEXT, UNIQUE(provider, provider_track_id));
    CREATE VIRTUAL TABLE tracks_fts USING fts5(title, artist, album, content='tracks', content_rowid='id');
    INSERT INTO artists (id, canonical_name, display_name) VALUES (1, 'lisa', 'LiSA'), (2, 'the beatles', 'The Beatles');
    INSERT INTO tracks (id, isrc, canonical_title, display_title, artist_id, album_name, duration_ms, popularity)
      VALUES (1, 'JPU901900400', '', '紅蓮華', 1, 'LEO-NiNE', 239000, 562000),
             (2, NULL, 'heyjuderemastered2015', 'Hey Jude - Remastered 2015', 2, '1', 431000, 900000);
    INSERT INTO track_providers (track_id, provider, provider_track_id, raw_metadata_json) VALUES (2, 'spotify', 'sp1', '{"popularity":88}');
  `);
  const migration = runCatalogMigrations(legacyDb);
  const legacyRows = legacyDb.prepare('SELECT id, canonical_title, language, version_type, popularity, deezer_rank, spotify_popularity FROM tracks ORDER BY id').all();
  assert(migration.from === 0 && migration.to === LATEST_CATALOG_VERSION && migration.applied.length === LATEST_CATALOG_VERSION, 'Legacy catalog migrates from v0 to the latest version');
  assert(legacyRows[0].canonical_title === '紅蓮華' && legacyRows[0].language === 'ja' && legacyRows[0].popularity === 76 && legacyRows[0].deezer_rank === 562000, 'Migration backfills Unicode base title, ISRC-aware language and 0-100 score');
  assert(legacyRows[1].canonical_title === 'heyjude' && legacyRows[1].version_type === 'remaster' && legacyRows[1].spotify_popularity === 88 && legacyRows[1].popularity === 88, 'Migration classifies versions and prefers Spotify popularity');
  assert(legacyDb.prepare('SELECT COUNT(*) AS c FROM tracks_fts WHERE tracks_fts MATCH ?').get('"紅蓮華"').c === 1, 'Migration rebuilds a working FTS index');
  assert(runCatalogMigrations(legacyDb).applied.length === 0, 'Re-running migrations is a no-op');
  legacyDb.close();
});
