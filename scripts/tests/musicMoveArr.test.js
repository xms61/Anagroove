import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqliteCatalog } from '../../server/db/sqliteCatalog.js';
import { deezerRankToScore } from '../../server/db/trackNormalization.js';
import {
  resolveTrackPreview,
  batchResolvePreviews,
  extractNumericCatalogTrackId,
  clearPreviewCacheForTesting,
} from '../../server/services/previewResolver.js';
import { parseDelimitedLine, mapRowToCandidate, parseSqlInsertTuple } from '../ingest_musicmovearr.js';

test('MusicMoveArr Streaming Ingestor & Lazy Preview Hydration', async () => {
  // 1. Delimited line parsing (CSV & TSV)
  const csvRow = parseDelimitedLine('"101","Discovery, Vol. 1","Daft Punk"', ',');
  assert(csvRow.length === 3 && csvRow[1] === 'Discovery, Vol. 1', 'Parses quoted CSV fields containing delimiters');

  const tsvRow = parseDelimitedLine('202\tInstant Crush\tJulian Casablancas', '\t');
  assert(tsvRow.length === 3 && tsvRow[1] === 'Instant Crush', 'Parses TSV records cleanly');

  // 2. MusicMoveArr row mapping to candidate
  const headers = ['id', 'title', 'artist', 'album', 'duration', 'rank', 'isrc', 'release_date'];
  const rowData = ['3135556', 'One More Time', 'Daft Punk', 'Discovery', '320', '850000', 'USVI20000001', '2001-03-12'];
  const candidate = mapRowToCandidate(rowData, headers, 'deezer');

  assert(candidate !== null, 'Candidate object generated from row data');
  assert(candidate.providerTrackId === '3135556', 'Extracts provider track ID');
  assert(candidate.title === 'One More Time', 'Extracts track title');
  assert(candidate.artist === 'Daft Punk', 'Extracts artist name');
  assert(candidate.durationMs === 320000, 'Normalizes duration from seconds to milliseconds');
  assert(candidate.deezerRank === 850000 && candidate.popularity === deezerRankToScore(850000), 'Keeps the raw Deezer rank and maps it to the calibrated 0-100 score');
  assert(candidate.countryCode === 'US', 'Extracts country code US from ISRC');
  assert(candidate.language === 'en', 'Detects English language');
  assert(candidate.sampleUrl === null, 'Leaves sampleUrl null for on-the-fly lazy hydration');

  // 3. SQL INSERT tuple parser
  const sqlTuple = parseSqlInsertTuple("(1001, 'Get Lucky', 'Pharrell Williams', 248000, 92, NULL)");
  assert(sqlTuple.length === 6, 'Parses 6 values from SQL tuple');
  assert(sqlTuple[1] === 'Get Lucky', 'Extracts string value without quotes');
  assert(sqlTuple[5] === null, 'Maps SQL NULL to JavaScript null');

  // 4. Numeric Catalog Track ID extraction
  assert(extractNumericCatalogTrackId({ id: 'deezer:104' }) === null, 'Rejects provider prefix ID from numeric catalog ID');
  assert(extractNumericCatalogTrackId({ id: 'sqlite:42' }) === 42, 'Extracts numeric ID from sqlite:42');
  assert(extractNumericCatalogTrackId({ catalogTrackId: 99 }) === 99, 'Extracts catalogTrackId property');
  assert(extractNumericCatalogTrackId({ id: 105 }) === 105, 'Accepts direct positive integer ID');

  // 5. In-Memory Preview Resolver & Cache
  clearPreviewCacheForTesting();
  const existingSampleTrack = {
    id: 'sqlite:1',
    title: 'Around The World',
    artist: 'Daft Punk',
    sample_url: 'https://cdnt-preview.dzcdn.net/around.mp3',
  };
  const resolvedDirect = await resolveTrackPreview(existingSampleTrack);
  assert(resolvedDirect && resolvedDirect.source === 'existing', 'Returns existing sample immediately');
  assert(resolvedDirect.url === 'https://cdnt-preview.dzcdn.net/around.mp3', 'Preserves valid sample URL');

  // 6. Batch Preview Resolver
  const batchInput = [
    { id: 'track-1', sample_url: 'https://cdnt-preview.dzcdn.net/1.mp3' },
    { id: 'track-2', audioUrl: 'https://cdnt-preview.dzcdn.net/2.mp3' },
  ];
  const batchRes = await batchResolvePreviews(batchInput);
  assert(batchRes.resolvedTracks.length === 2, 'Batch resolves all tracks with verified preview URLs');
  assert(batchRes.failedTracks.length === 0, 'Zero failed tracks when samples exist');

  // 7. SQLite catalog: sampleless rows and lazy preview hydration
  const memCatalog = new SqliteCatalog(':memory:');
  const insertRes = memCatalog.upsertTrack({
    title: 'Lazy Sampleless Song',
    artist: 'Lazy Band',
    album: 'Lazy Album',
    durationMs: 210000,
    releaseYear: 2024,
    popularity: 75,
    provider: 'deezer',
    providerTrackId: '999888',
    sampleUrl: null, // Initial Scenario C state: no sample
  });
  assert(insertRes.isNew === true, 'Inserts sampleless candidate track');

  // The selection window returns sampleless rows; previews are resolved from the Deezer id
  const [lazy] = memCatalog.sampleCatalogTracks({ start: 0 });
  assert.equal(lazy.title, 'Lazy Sampleless Song');
  assert.equal(lazy.deezer_id, '999888');
  assert.equal(lazy.sample_url, null);

  // A lazily resolved preview is stored and served on the next read
  const sampleSaved = memCatalog.insertSample(lazy.id, {
    provider: 'deezer',
    providerTrackId: '999888',
    sampleUrl: 'https://cdnt-preview.dzcdn.net/lazy-hydrated.mp3',
    audioCodec: 'mp3',
    sampleDurationSec: 30,
    httpStatus: 200,
  });
  assert.equal(sampleSaved, true);
  assert.equal(memCatalog.sampleCatalogTracks({ start: 0 })[0].sample_url, 'https://cdnt-preview.dzcdn.net/lazy-hydrated.mp3');

  memCatalog.close();
});
