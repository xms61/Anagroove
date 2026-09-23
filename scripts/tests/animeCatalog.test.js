import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAnimeTarget, getAnimeThemeType } from '../../server/policy/selectionPolicy.js';
import { AnimeCatalog } from '../../server/db/animeCatalog.js';

test('Dedicated Anime OP/ED Catalog, Variations & Sourcing Isolation', async () => {
  // 1. Anime Target Detection & Theme Type Isolation
  assert(isAnimeTarget('anime', '') === true, 'isAnimeTarget detects "anime" genre');
  assert(isAnimeTarget('anime openings', '') === true, 'isAnimeTarget detects "anime openings"');
  assert(isAnimeTarget('all', 'anime ed') === true, 'isAnimeTarget detects "anime ed" in prompt');
  assert(isAnimeTarget('japanese', '') === false, 'isAnimeTarget rejects bare "japanese" genre (stays in general music catalog)');
  assert(isAnimeTarget('Japanese City Pop', '') === false, 'isAnimeTarget rejects "Japanese City Pop" (stays in general music catalog)');
  assert(isAnimeTarget('rock', 'j-rock hits') === false, 'isAnimeTarget rejects "j-rock hits"');

  assert(getAnimeThemeType('anime openings', '') === 'OP', 'getAnimeThemeType detects OP');
  assert(getAnimeThemeType('anime endings', '') === 'ED', 'getAnimeThemeType detects ED');
  assert(getAnimeThemeType('anime', '') === null, 'getAnimeThemeType returns null for general anime (both OP & ED)');

  // 2. In-Memory Anime Catalog Creation & Schema
  const animeDb = new AnimeCatalog(':memory:');
  const trackId1 = animeDb.upsertAnimeTrack({
    animeTitle: 'Neon Genesis Evangelion',
    songTitle: 'A Cruel Angel\'s Thesis',
    artistName: 'Yoko Takahashi',
    themeType: 'OP',
    themeNumber: 1,
    themeSlug: 'OP1',
    year: 1995,
    season: 'Fall',
    malId: 30,
    anilistId: 30,
    originalFilePath: '1995/Fall/Evangelion-OP1.ogg',
    durationMs: 90000,
    popularity: 98,
  });
  assert(trackId1 === 1, 'Successfully upserted anime track 1');

  const trackId2 = animeDb.upsertAnimeTrack({
    animeTitle: 'Cowboy Bebop',
    songTitle: 'Tank!',
    artistName: 'SEATBELTS',
    themeType: 'OP',
    themeNumber: 1,
    themeSlug: 'OP1',
    year: 1998,
    season: 'Spring',
    malId: 1,
    anilistId: 1,
    originalFilePath: '1998/Spring/CowboyBebop-OP1.ogg',
    durationMs: 90000,
    popularity: 99,
  });
  assert(trackId2 === 2, 'Successfully upserted anime track 2');

  const trackId3 = animeDb.upsertAnimeTrack({
    animeTitle: 'Cowboy Bebop',
    songTitle: 'The Real Folk Blues',
    artistName: 'The Seatbelts ft. Mai Yamane',
    themeType: 'ED',
    themeNumber: 1,
    themeSlug: 'ED1',
    year: 1998,
    season: 'Spring',
    malId: 1,
    anilistId: 1,
    originalFilePath: '1998/Spring/CowboyBebop-ED1.ogg',
    durationMs: 90000,
    popularity: 95,
  });
  assert(trackId3 === 3, 'Successfully upserted anime track 3');

  // 3. Insert 20-second sample variations
  animeDb.insertSample({
    animeTrackId: trackId1,
    sampleIndex: 1,
    samplePath: 'data/anime_samples/1995/Fall/Evangelion-OP1_s1.ogg',
    sampleUrl: '/audio/anime/1995/Fall/Evangelion-OP1_s1.ogg',
    offsetSeconds: 5,
    durationSeconds: 20,
  });
  animeDb.insertSample({
    animeTrackId: trackId1,
    sampleIndex: 2,
    samplePath: 'data/anime_samples/1995/Fall/Evangelion-OP1_s2.ogg',
    sampleUrl: '/audio/anime/1995/Fall/Evangelion-OP1_s2.ogg',
    offsetSeconds: 35,
    durationSeconds: 20,
  });
  animeDb.insertSample({
    animeTrackId: trackId1,
    sampleIndex: 3,
    samplePath: 'data/anime_samples/1995/Fall/Evangelion-OP1_s3.ogg',
    sampleUrl: '/audio/anime/1995/Fall/Evangelion-OP1_s3.ogg',
    offsetSeconds: 65,
    durationSeconds: 20,
  });

  const samples = animeDb.getSamplesForTrack(trackId1);
  assert(samples.length === 3, 'Track 1 has exactly 3 sample variations');
  assert(samples[0].offset_seconds === 5 && samples[0].duration_seconds === 20, 'Sample 1 has offset 5s and duration 20s');
  assert(samples[1].offset_seconds === 35 && samples[1].duration_seconds === 20, 'Sample 2 has offset 35s and duration 20s');
  assert(samples[2].offset_seconds === 65 && samples[2].duration_seconds === 20, 'Sample 3 has offset 65s and duration 20s');

  // 4. Sampleless track isolation (requireSamples)
  const tracksWithSamples = animeDb.getRandomAnimeTracks({ count: 10, requireSamples: true });
  assert(tracksWithSamples.length === 1, 'Only track with verified audio samples is returned when requireSamples=true');
  assert(tracksWithSamples[0].id === 'anime:1', 'Returned track matches trackId 1');
  assert(tracksWithSamples[0].audioUrl.startsWith('/audio/anime/'), 'audioUrl uses local /audio/anime mount path');
  assert(tracksWithSamples[0].sampleVariations.length === 3, 'Returns all 3 sample variations for playback rotation');

  // Add samples for track 2 and track 3
  animeDb.insertSample({
    animeTrackId: trackId2,
    sampleIndex: 1,
    samplePath: 'data/anime_samples/1998/Spring/CowboyBebop-OP1_s1.ogg',
    sampleUrl: '/audio/anime/1998/Spring/CowboyBebop-OP1_s1.ogg',
    offsetSeconds: 5,
    durationSeconds: 20,
  });
  animeDb.insertSample({
    animeTrackId: trackId3,
    sampleIndex: 1,
    samplePath: 'data/anime_samples/1998/Spring/CowboyBebop-ED1_s1.ogg',
    sampleUrl: '/audio/anime/1998/Spring/CowboyBebop-ED1_s1.ogg',
    offsetSeconds: 5,
    durationSeconds: 20,
  });

  // 5. Query Filtering: Type ('OP' vs 'ED')
  const opTracks = animeDb.getRandomAnimeTracks({ count: 10, type: 'OP' });
  assert(opTracks.length === 2 && opTracks.every(t => t.themeType === 'OP'), 'type="OP" strictly returns only openings');

  const edTracks = animeDb.getRandomAnimeTracks({ count: 10, type: 'ED' });
  assert(edTracks.length === 1 && edTracks[0].themeType === 'ED', 'type="ED" strictly returns only endings');

  // 6. Query Filtering: Search keyword
  const searched = animeDb.getRandomAnimeTracks({ count: 10, search: 'Bebop' });
  assert(searched.length === 2 && searched.every(t => t.animeTitle === 'Cowboy Bebop'), 'Search keyword matches anime title');

  // 7. Stats
  const stats = animeDb.getStats();
  assert(stats.totalTracks === 3, 'Stats report total 3 tracks');
  assert(stats.totalOps === 2, 'Stats report total 2 OPs');
  assert(stats.totalEds === 1, 'Stats report total 1 ED');
  assert(stats.tracksWithSamples === 3, 'Stats report 3 tracks with samples');
  assert(stats.minYear === 1995 && stats.maxYear === 1998, 'Stats report correct year range');
});
