// TODO: This monolithic test runner (2000+ lines) should be split into per-module test files.
// Recommended structure:
//   scripts/tests/test_crossword_engine.js  — crossword generation, grid placement, scoring
//   scripts/tests/test_music_keywords.js    — keyword extraction, answer candidates, clue types
//   scripts/tests/test_query_builder.js     — prompt parsing, decade/artist/genre detection
//   scripts/tests/test_music_identity.js    — canonical keys, transliteration, blacklist matching
//   scripts/tests/test_authenticity.js      — isAuthenticTrack, cover/karaoke/workout rejection
//   scripts/tests/test_validators.js        — server-side input validation
//   scripts/tests/test_websocket.js         — multiplayer room lifecycle, race/coop sync
//   scripts/run_tests.js (this file)        — orchestrator that runs all test modules
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';
import { shuffleArray } from '../shared/shuffle.js';
import { generateLiveCrossword } from '../shared/liveCrossword.js';
import {
  extractAnswerKeyword,
  extractAllAnswerCandidates,
  isSingleEntityArtist,
  splitArtistNames,
  formatCrosswordClue,
  sanitizeClue,
  containsAnswerLeak,
} from '../shared/musicKeywords.js';
import {
  blacklistIdentityKey,
  blacklistMatchesTrack,
  canonicalArtistKey,
  toCrosswordAnswer,
} from '../shared/musicIdentity.js';
import {
  deezerMusicProvider,
  DEEZER_GENRE_TAXONOMY,
  getDeezerCacheStatsForTesting,
  mapDeezerTrack,
  resetDeezerCachesForTesting,
} from '../server/services/deezerMusicProvider.js';
import { mapItunesTrack, detectStorefront } from '../server/services/itunesMusicProvider.js';
import { parsePrompt, buildQueryPlan, generateThemeVariations, extractAnimeKeyphrase } from '../server/services/queryBuilder.js';
import { resolveAnimeCoverImages } from '../server/services/animeImageService.js';
import { getRandomSongPool, setMusicProviderForTesting } from '../server/selection/songPool.js';
import {
  isLanguagePermitted,
  isThematicallyPermitted,
  isTemporalPermitted,
  isAuthenticTrack,
  isAnimeTrack,
  isJapaneseTrack,
  isAnimeTarget,
  getAnimeThemeType,
  allowedLanguagesForContext,
  resolveReleaseYear,
} from '../server/policy/selectionPolicy.js';
import { createRng, weightedOrder } from '../server/selection/random.js';
import { judgePuzzle, judgeMultiGenerationSuite } from '../server/services/crosswordJudge.js';
import {
  validateUserId,
  validateProgressPayload,
  validateHistoryPayload,
  validateBlacklistPayload,
  validateMusicQuery,
  validateLivePuzzlePayload,
  validateWsMessage,
  validatePreviewRef
} from '../server/validators.js';
import { createLivePuzzleStore, server, parseTrustProxy, clientIpFromUpgrade } from '../server/server.js';
import { db } from '../server/db.js';
import { SqliteCatalog, normalizeDedupeTitle, normalizeDedupeArtist } from '../server/db/sqliteCatalog.js';
import {
  classifyVersion,
  baseTitleKey,
  cleanDisplayText,
  detectTrackLanguage,
  deezerRankToScore,
  normalizePopularity,
  normalizeIsrc,
  normalizeReleaseYear,
} from '../server/db/trackNormalization.js';
import { runCatalogMigrations, LATEST_CATALOG_VERSION } from '../server/db/catalogMigrations.js';
import { resolveTrackLanguage, classifyArtistLanguage, scriptLanguage } from '../server/db/languageClassifier.js';
import { runCatalogCleanup } from '../server/db/catalogCleanup.js';
import { evaluateCatalogGate } from '../server/db/catalogGate.js';
import { UserStore } from '../server/db/userStore.js';
import { recomputeCatalogLanguages } from '../server/db/catalogLanguages.js';
import { checkAuthenticity } from '../server/policy/authenticityRules.js';
import { CatalogEnricher } from '../server/crawler/enricher.js';
import { DatabaseSync } from 'node:sqlite';
import { CatalogValidator } from '../server/db/catalogValidator.js';
import { AnimeCatalog } from '../server/db/animeCatalog.js';
import { isAuthenticCandidate } from '../server/crawler/authenticityFilter.js';
import { TokenBucketRateLimiter } from '../server/crawler/rateLimiter.js';
import {
  MusicHarvester,
  toCatalogCandidate,
  CURATED_PLAYLIST_SEEDS,
  DECADE_GENRE_SEEDS,
  YEAR_GENRE_SEEDS,
  BIGRAM_SEEDS,
  MUSIC_LEXICON_SEEDS,
  FOUNDATION_ARTISTS,
} from '../server/crawler/harvester.js';
import { STREAMED_ARTISTS, STREAMED_ARTIST_NAMES } from '../server/crawler/artistBaseline.js';
import {
  resolveTrackPreview,
  batchResolvePreviews,
  extractNumericCatalogTrackId,
  clearPreviewCacheForTesting,
  parsePreviewExpiry,
  isPreviewUrlFresh,
  parsePreviewRef,
  previewRefForTrack,
  resolvePreviewRef,
  setPreviewFetchForTesting,
} from '../server/services/previewResolver.js';
import {
  parseDelimitedLine,
  mapRowToCandidate,
  parseSqlInsertTuple,
} from '../scripts/ingest_musicmovearr.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runUnitTests() {
  console.log('\n--- 1. Testing Unbiased Fisher-Yates Shuffle ---');
  const empty = shuffleArray([]);
  assert(Array.isArray(empty) && empty.length === 0, 'Handles empty array');

  const single = shuffleArray([42]);
  assert(single.length === 1 && single[0] === 42, 'Handles single element array');

  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shuffled = shuffleArray(original);
  assert(shuffled.length === original.length, 'Preserves total array length');
  assert(original.every(x => shuffled.includes(x)), 'Preserves all original elements');

  // Verify non-deterministic behavior across multiple runs
  let differences = 0;
  for (let i = 0; i < 5; i++) {
    const s = shuffleArray(original);
    if (s.some((val, idx) => val !== original[idx])) {
      differences++;
    }
  }
  assert(differences > 0, 'Produces randomized permutations across runs');

  console.log('\n--- 1b. Testing Live Crossword Placement Engine ---');
  const sampleTracks = [
    { id: 'track_1', title: 'Get Lucky', artist: 'Daft Punk', audioUrl: 'http://example.com/1.mp3', answer: 'GETLUCKY', clueType: 'Song title' },
    { id: 'track_2', title: 'Starboy', artist: 'The Weeknd', audioUrl: 'http://example.com/2.mp3', answer: 'STARBOY', clueType: 'Song title' },
    { id: 'track_3', title: 'One More Time', artist: 'Daft Punk', audioUrl: 'http://example.com/3.mp3', answer: 'ONEMORETIME', clueType: 'Song title' },
    { id: 'track_4', title: 'Harder', artist: 'Daft Punk', audioUrl: 'http://example.com/4.mp3', answer: 'HARDER', clueType: 'Song title' },
    { id: 'track_5', title: 'Around The World', artist: 'Daft Punk', audioUrl: 'http://example.com/5.mp3', answer: 'AROUNDTHEWORLD', clueType: 'Song title' },
    { id: 'track_6', title: 'Instant Crush', artist: 'Daft Punk', audioUrl: 'http://example.com/6.mp3', answer: 'INSTANTCRUSH', clueType: 'Song title' },
    { id: 'track_7', title: 'Technologic', artist: 'Daft Punk', audioUrl: 'http://example.com/7.mp3', answer: 'TECHNOLOGIC', clueType: 'Song title' },
    { id: 'track_8', title: 'Aerodynamic', artist: 'Daft Punk', audioUrl: 'http://example.com/8.mp3', answer: 'AERODYNAMIC', clueType: 'Song title' },
  ];
  const testPuzzle = generateLiveCrossword(sampleTracks, 'Test Puzzle', 6);
  assert(testPuzzle && testPuzzle.clues.length >= 5, 'Generates valid intersecting crossword layout');
  assert(testPuzzle && testPuzzle.rows > 0 && testPuzzle.cols > 0, 'Computes bounding box rows and cols');
  assert(testPuzzle && testPuzzle.grid.length === testPuzzle.rows, 'Grid rows match computed bounds');
  assert(testPuzzle && testPuzzle.grid[0].length === testPuzzle.cols, 'Grid cols match computed bounds');
  assert(testPuzzle && testPuzzle.clues.every(c => c.row >= 0 && c.col >= 0), 'All clue coordinates are non-negative');
  assert(testPuzzle && testPuzzle.clues.every(c => (c.crossings || 1) >= 1 && (c.crossings || 1) <= 3), 'All words cross between 1 and 3 times');
  const distinctCrossings = new Set(testPuzzle.clues.map(c => c.crossings || 1));
  assert(distinctCrossings.size >= 2, 'Words feature varied crossing frequencies (e.g. 1, 2, or 3 crossings)');

  console.log('\n--- 2. Testing Canonical Keyword Extraction ---');
  const singleWord = extractAnswerKeyword('Hello', 'Adele');
  assert(singleWord?.answer === 'HELLO' && singleWord.clueType === 'Song title', 'Extracts single-word title keyword');

  const featTrack = extractAnswerKeyword('Stay (feat. Justin Bieber)', 'The Kid LAROI');
  assert(featTrack?.answer === 'STAY', 'Strips (feat. ...) and extracts clean title');

  const combinedTrack = extractAnswerKeyword('Your Love', 'The Outfield');
  assert(combinedTrack?.answer === 'YOURLOVE' && combinedTrack.clueType === 'Song title', 'Combines multi-word title up to 14 characters');

  const boundTrack = extractAnswerKeyword('Blinding Lights', 'The Weeknd');
  assert(boundTrack?.answer === 'BLINDINGLIGHTS' && boundTrack.answer.length === 14, 'Permits combined titles up to 14 characters');

  const longBoundTrack = extractAnswerKeyword("Don't Stop Believin'", 'Journey');
  assert(longBoundTrack?.answer === 'JOURNEY' && longBoundTrack.clueType === 'Artist name', 'Falls back to artist for titles exceeding 14 characters');

  const multiWordTooLong = extractAnswerKeyword('Smells Like Teen Spirit', 'Nirvana');
  assert(multiWordTooLong?.answer === 'NIRVANA' && multiWordTooLong.clueType === 'Artist name', 'Falls back to artist for titles exceeding 14 characters');

  const artistPreferred = extractAnswerKeyword('Your Love', 'The Outfield', { preferredType: 'artist' });
  assert(artistPreferred?.answer === 'THEOUTFIELD' && artistPreferred.clueType === 'Artist name', 'Honors preferred clue type for artist');

  const nullResult = extractAnswerKeyword('', '');
  assert(nullResult === null, 'Returns null on empty input');
  assert(canonicalArtistKey('  21 PILOTS  ') === '21 pilots', 'Artist identity preserves numeric tokens');
  assert(canonicalArtistKey('Beyoncé') === canonicalArtistKey('BEYONCE'), 'Artist identity folds case and diacritics');
  assert(toCrosswordAnswer('Beyoncé') === 'BEYONCE', 'Artist answers remove diacritics without truncation');
  assert(toCrosswordAnswer('21 pilots') === '21PILOTS', 'Artist answers retain every numeric and word token');
  assert(toCrosswordAnswer('東京') === null, 'Rejects unsupported crossword answers instead of corrupting them');

  // Single entity and ampersand expansion tests
  assert(toCrosswordAnswer('Above & Beyond') === 'ABOVEANDBEYOND', 'Replaces ampersand with AND for single-entity band');
  assert(toCrosswordAnswer('Mumford & Sons') === 'MUMFORDANDSONS', 'Replaces ampersand with AND for family band');
  assert(toCrosswordAnswer('Rock & Roll') === 'ROCKANDROLL', 'Replaces ampersand with AND in song titles');
  assert(toCrosswordAnswer('Simon & Garfunkel') === 'SIMONANDGARFUNKEL', 'Replaces ampersand with AND in iconic duo name');

  // Single entity identification vs collaboration
  assert(isSingleEntityArtist('Above & Beyond') === true, 'Identifies Above & Beyond as single entity');
  assert(isSingleEntityArtist('Mumford & Sons') === true, 'Identifies Mumford & Sons as single entity');
  assert(isSingleEntityArtist('Bob Marley & The Wailers') === true, 'Identifies Bob Marley & The Wailers as single entity');
  assert(isSingleEntityArtist('Ski Aggu & Sira') === false, 'Identifies Ski Aggu & Sira as collaboration');
  assert(isSingleEntityArtist('Drake & 21 Savage') === false, 'Identifies Drake & 21 Savage as collaboration');

  // Multi-artist splitting
  const splitCollab = splitArtistNames('Ski Aggu & Sira');
  assert(splitCollab.length === 2 && splitCollab[0] === 'Ski Aggu' && splitCollab[1] === 'Sira', 'Splits "Ski Aggu & Sira" into individual artists');
  const splitCase = splitArtistNames('Ski aggu & Sira');
  assert(splitCase.length === 2 && splitCase[0] === 'Ski aggu' && splitCase[1] === 'Sira', 'Splits case-varied "Ski aggu & Sira"');
  const splitSingle = splitArtistNames('Above & Beyond');
  assert(splitSingle.length === 1 && splitSingle[0] === 'Above & Beyond', 'Preserves single-entity band with ampersand');
  const splitFeat = splitArtistNames('The Kid LAROI feat. Justin Bieber');
  assert(splitFeat.length === 2 && splitFeat[0] === 'The Kid LAROI' && splitFeat[1] === 'Justin Bieber', 'Splits feat. artist collaboration');
  const splitComma = splitArtistNames('David Guetta, Bebe Rexha');
  assert(splitComma.length === 2 && splitComma[0] === 'David Guetta' && splitComma[1] === 'Bebe Rexha', 'Splits comma-separated artist collaboration');

  // Multi-artist answer extraction does not combine like a title
  const skiAgguCollab = extractAnswerKeyword('mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist' });
  assert(skiAgguCollab?.answer === 'SKIAGGU', 'Extracts lead artist answer SKIAGGU instead of combining as SKIAGGUSIRA');
  assert(skiAgguCollab?.answer !== 'SKIAGGUSIRA', 'Never combines collaborating artists like a title');

  const siraCollab = extractAnswerKeyword('mietfrei', 'Ski Aggu & Sira', { preferredType: 'artist', artistIndex: 1 });
  assert(siraCollab?.answer === 'SIRA', 'Extracts co-performer answer SIRA on demand');

  const fallbackCollab = extractAnswerKeyword('mietfrei', 'Ski Aggu & Sira', {
    preferredType: 'artist',
    seenAnswers: new Set(['SKIAGGU']),
  });
  assert(fallbackCollab?.answer === 'SIRA', 'Falls back to co-performer SIRA if lead artist answer already exists on grid');

  const singleEntityKeyword = extractAnswerKeyword('Sun & Moon', 'Above & Beyond', { preferredType: 'artist' });
  assert(singleEntityKeyword?.answer === 'ABOVEANDBEYOND', 'Extracts single-entity artist with ampersand expanded to AND');

  const titleAmpersandKeyword = extractAnswerKeyword('Rock & Roll', 'Led Zeppelin', { preferredType: 'title' });
  assert(titleAmpersandKeyword?.answer === 'ROCKANDROLL', 'Extracts song title with ampersand expanded to AND');

  // Answer length variation (2-14 letters) & feature separation
  const twoLetterAnswer = toCrosswordAnswer('Go');
  assert(twoLetterAnswer === 'GO', 'Supports 2-letter answers for crossword grids');

  const aptCandidates = extractAllAnswerCandidates('APT. (feat. Bruno Mars)', 'ROSÉ & Bruno Mars');
  assert(aptCandidates.title?.answer === 'APT', 'Cleans features from title giving 3-letter answer APT');
  assert(aptCandidates.artistCandidates?.length === 2, 'Extracts 2 distinct artist candidates for ROSÉ & Bruno Mars');
  assert(aptCandidates.artistCandidates?.[0].answer === 'ROSE', 'First collaborator candidate is ROSE');
  assert(aptCandidates.artistCandidates?.[1].answer === 'BRUNOMARS', 'Second collaborator candidate is BRUNOMARS');
  assert(!aptCandidates.artistCandidates?.some(c => c.answer === 'ROSEBRUNOMARS'), 'Never concatenates collaborating artists into ROSEBRUNOMARS');

  const dieCandidates = extractAllAnswerCandidates('Die With A Smile feat. Lady Gaga', 'Bruno Mars');
  assert(dieCandidates.title?.answer === 'DIEWITHASMILE', 'Retains clean full title DIEWITHASMILE without feature leakage');
  assert(dieCandidates.shortKeyword?.answer === 'DIE', 'Extracts short 3-letter keyword DIE for length variance');

  const bucketShort = extractAnswerKeyword('Die With A Smile feat. Lady Gaga', 'Bruno Mars', { targetLengthBucket: 'short' });
  assert(bucketShort?.answer.length <= 5, 'Honors short length bucket target (<= 5 chars)');

  const bucketLong = extractAnswerKeyword('Die With A Smile feat. Lady Gaga', 'Bruno Mars', { targetLengthBucket: 'long' });
  assert(bucketLong?.answer.length >= 9, 'Honors long length bucket target (>= 9 chars)');

  const migrationIdentityKeys = new Set([
    { type: 'song', name: 'Same Title' },
    { type: 'song', name: 'Same Title', provider: 'deezer', providerTrackId: '101' },
    { type: 'song', name: 'same-title', provider: 'deezer', providerTrackId: '202' },
    { type: 'artist', name: 'Beyoncé' },
    { type: 'artist', name: 'beyonce', provider: 'deezer', providerArtistId: '42' },
  ].map(blacklistIdentityKey));
  assert(
    migrationIdentityKeys.size === 5,
    'Blacklist migration identities retain generic and distinct provider-scoped entries'
  );

  console.log('\n--- 3. Testing Backend Input Validators ---');
  assert(validateUserId('valid_user-123') === 'valid_user-123', 'Accepts valid user ID format');
  assert(validateUserId('bad user!') === null, 'Rejects user ID with spaces and punctuation');
  assert(validateUserId('x') === null, 'Rejects too short user ID (<3 chars)');
  assert(validateUserId('a'.repeat(65)) === null, 'Rejects too long user ID (>64 chars)');

  const validProgress = validateProgressPayload({
    puzzleId: 'puzzle-1',
    userLetters: [['A', 'B'], ['C', 'D']]
  });
  assert(validProgress.valid === true, 'Accepts valid progress grid');

  const invalidProgress = validateProgressPayload({
    puzzleId: 'puzzle-1',
    userLetters: [['TOOLONG', 'B']]
  });
  assert(invalidProgress.valid === false, 'Rejects multi-character cell content');

  const validBl = validateBlacklistPayload({ name: 'Coldplay', type: 'artist' });
  assert(validBl.valid === true, 'Accepts valid blacklist payload');

  const invalidBl = validateBlacklistPayload({ name: 'Coldplay', type: 'album' });
  assert(invalidBl.valid === false, 'Rejects invalid blacklist type');

  const validHist = validateHistoryPayload({ puzzleId: 'p-1', title: 'Great Hit', cluesCount: 10, timeSeconds: 120 });
  assert(validHist.valid === true, 'Accepts valid history payload');

  const invalidHist = validateHistoryPayload({ puzzleId: 'p-1', cluesCount: -5 });
  assert(invalidHist.valid === false, 'Rejects negative clues count in history');

  const validQuery = validateMusicQuery({ genre: 'rock', minFans: '500000', count: '15', recent: 'a,b,c' });
  assert(validQuery.genre === 'rock' && validQuery.count === 15 && validQuery.recentIds.length === 3, 'Sanitizes and parses music query parameters');
  assert(validateLivePuzzlePayload({ targetWords: 'bad' }).valid === false, 'Rejects malformed live-puzzle requests');

  const validWs = validateWsMessage({
    action: 'create_room',
    playerId: 'host_123',
    playerName: 'Alice',
    mode: 'coop',
    livePuzzleToken: '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  });
  assert(validWs.valid === true, 'Accepts valid WebSocket action');

  const invalidWs = validateWsMessage({
    action: 'malicious_action',
    playerId: 'user_1'
  });
  assert(invalidWs.valid === false, 'Rejects unlisted WebSocket action');

  console.log('\n--- 3b. Testing Live Mode Genre Taxonomy & Catalog Parity ---');
  const catalogThemes = [
    'mixed', 'kpop', 'anime', 'gaming', 'pop', 'rock',
    'hiphop', 'edm', 'cinematic', 'latin', 'poppunk'
  ];
  for (const theme of catalogThemes) {
    const puzValidation = validateLivePuzzlePayload({ genre: theme });
    assert(puzValidation.valid && puzValidation.data.genre === theme, `validateLivePuzzlePayload accepts genre '${theme}'`);
    const conf = DEEZER_GENRE_TAXONOMY[theme];
    assert(
      conf && (conf.chartId !== undefined || conf.searches?.length > 0) && conf.minFans > 0 && conf.minRank > 0,
      `DEEZER_GENRE_TAXONOMY defines viable configuration for catalog theme '${theme}'`
    );
  }
  assert(Boolean(DEEZER_GENRE_TAXONOMY.all && DEEZER_GENRE_TAXONOMY.electronic), 'Backward compatibility aliases all and electronic exist');

  console.log('\n--- 3c. Testing Prompt Parsing, iTunes Mapping & Steered Query Builder ---');
  const parsedPrompt = parsePrompt('obscure 80s synth-pop by Daft Punk');
  assert(parsedPrompt.popularity === 'obscure', 'Parses obscure popularity modifier');
  assert(parsedPrompt.decade === '1980s', 'Parses 80s decade into 1980s');
  assert(parsedPrompt.artist === 'Daft Punk', 'Parses artist from directive "by Daft Punk"');
  assert(parsedPrompt.genre === 'synth-pop', 'Extracts remaining theme as genre');

  const purePlan = buildQueryPlan({ popularity: 'pure' });
  assert(purePlan.popularity === 'pure' && purePlan.minFans === 0 && purePlan.minRank === 0, 'Pure mode clears popularity filters');
  assert(purePlan.deezerSearches.length > 0, 'Pure mode injects entropy search seeds');

  const animePlan = buildQueryPlan({ genre: 'anime' });
  assert(animePlan.genre === 'anime' && animePlan.deezerSearches.includes('anime opening'), 'Genre query retains targeted anime opening search');
  assert(!animePlan.deezerSearches.includes('anime'), 'Genre query avoids bare "anime" search to prevent DJ AniMe collisions');
  assert(animePlan.deezerSearches.every(s => !/^[a-z]{2}$/.test(s)), 'Genre query avoids adding unrelated alphanumeric seeds');

  assert(isLanguagePermitted({ title: 'Blinding Lights', artist: 'The Weeknd' }, 'pop') === true, 'Allows English track for pop');
  assert(isLanguagePermitted({ title: 'Amor de Mi Vida', artist: 'Artista' }, 'pop') === false, 'Rejects foreign track in English pop');
  assert(isLanguagePermitted({ title: 'Gurenge', artist: 'LiSA' }, 'anime') === true, 'Permits Japanese track for anime');
  assert(isLanguagePermitted({ title: 'Dynamite', artist: 'BTS' }, 'kpop') === true, 'Permits Korean track for kpop');

  const cityPopPlan = buildQueryPlan({ prompt: '80s Japanese City Pop', genre: 'all' });
  assert(cityPopPlan.genre === 'Japanese City Pop', 'Prompt overrides default genre=all');
  assert(cityPopPlan.deezerSearches.includes('Japanese City Pop'), 'Generates targeted Deezer search for prompt genre');
  assert(cityPopPlan.deezerSearches.includes('Japanese City Pop 1980s'), 'Generates compound search with decade');
  assert(cityPopPlan.deezerSearches.every(s => !/^[a-z]{2}$/.test(s)), 'Prompt query never injects random 2-letter seeds');

  assert(isLanguagePermitted({ title: 'Plastic Love', artist: 'Mariya Takeuchi' }, 'all', '80s Japanese City Pop') === true, 'Permits Japanese tracks for City Pop prompt');
  assert(isLanguagePermitted({ title: '真夜中のドア / Stay With Me', artist: '松原みき' }, 'all', 'Japanese City Pop') === true, 'Permits Kanji/Kana for Japanese City Pop prompt');

  // Storefront detection across international genres
  assert(detectStorefront('Japanese City Pop') === 'JP', 'Detects Japan storefront for Japanese City Pop');
  assert(detectStorefront('Korean Trot') === 'KR', 'Detects Korea storefront for Korean Trot');
  assert(detectStorefront('K-Pop') === 'US', 'Routes K-Pop to global US storefront');
  assert(detectStorefront('French House') === 'FR', 'Detects France storefront for French House');
  assert(detectStorefront('German Krautrock') === 'DE', 'Detects Germany storefront for German Krautrock');
  assert(detectStorefront('Bossa Nova') === 'BR', 'Detects Brazil storefront for Bossa Nova');
  assert(detectStorefront('Reggae Roots') === 'JM', 'Detects Jamaica storefront for Reggae Roots');
  assert(detectStorefront('Afrobeat') === 'NG', 'Detects Nigeria storefront for Afrobeat');
  assert(detectStorefront('Britpop') === 'GB', 'Detects UK storefront for Britpop');
  assert(detectStorefront('90s Grunge') === 'US', 'Defaults to US storefront for general rock');

  // Theme variation atomicity & subgenre retention
  const jcpVars = generateThemeVariations('Japanese City Pop', '1980s');
  assert(jcpVars.includes('City Pop') || jcpVars.includes('Japanese Citypop'), 'Retains atomic City Pop genre in variations');
  assert(!jcpVars.includes('Japanese Pop'), 'Does not dilute City Pop into general Japanese Pop');

  const fhVars = generateThemeVariations('French House');
  assert(fhVars.includes('french touch') || fhVars.includes('French House'), 'Includes French Touch synonym for French House');

  // Thematic relevance & cultural homonym filtering
  assert(isThematicallyPermitted({ title: 'Something', artist: 'The Japanese House' }, 'all', 'Japanese City Pop') === false, 'Rejects "The Japanese House" homonym for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Face Melter', artist: 'The Japanese Popstars' }, 'all', 'Japanese City Pop') === false, 'Rejects "The Japanese Popstars" homonym for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Japanese Boy', artist: 'Aneka' }, 'all', 'Japanese City Pop') === false, 'Rejects Aneka "Japanese Boy" novelty track for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Japanese Porn', artist: 'Doctor Flake' }, 'all', 'Japanese City Pop') === false, 'Rejects "Japanese Porn" novelty track for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Unforgettable', artist: 'French Montana' }, 'all', 'French House') === false, 'Rejects "French Montana" homonym for French House');
  assert(isThematicallyPermitted({ title: 'Memories', artist: 'German Brigante' }, 'all', 'German Krautrock') === false, 'Rejects "German Brigante" homonym for German Krautrock');
  assert(isThematicallyPermitted({ title: 'Kill City', artist: 'Iggy Pop' }, 'all', 'Japanese City Pop') === false, 'Rejects Iggy Pop "Kill City" split-genre collision for City Pop');
  assert(isThematicallyPermitted({ title: 'Sparkle', artist: 'Tatsuro Yamashita' }, 'all', 'Japanese City Pop') === true, 'Permits authentic Tatsuro Yamashita for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'One More Time', artist: 'Daft Punk' }, 'all', 'French House') === true, 'Permits authentic Daft Punk for French House');
  assert(isThematicallyPermitted({ title: 'Vitamin C', artist: 'Can' }, 'all', 'German Krautrock') === true, 'Permits authentic Can for German Krautrock');
  assert(isThematicallyPermitted({ title: 'In Bloom', artist: 'Nirvana' }, 'all', '90s Grunge') === true, 'Permits authentic Nirvana for 90s Grunge');

  const itunesSample = {
    trackId: 12345,
    trackName: 'Midnight City',
    artistName: 'M83',
    previewUrl: 'https://audio.itunes.com/preview.m4a',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
    collectionName: 'Hurry Up, We Are Dreaming'
  };
  const mappedItunes = mapItunesTrack(itunesSample);
  assert(mappedItunes?.id === 'itunes:12345' && mappedItunes?.provider === 'itunes', 'Maps iTunes track format');
  assert(mappedItunes?.albumArt?.includes('600x600bb'), 'Scales iTunes artwork to 600x600');
  assert(mapItunesTrack({ trackId: 999 }) === null, 'Rejects iTunes track missing preview or title');

  // Multi-dimensional prompt parsing & temporal bounds
  const animeRange = parsePrompt('anime from the years 2020-2026');
  assert(
    animeRange.genre === 'anime' &&
    !animeRange.artist &&
    animeRange.yearRange?.start === 2020 &&
    animeRange.yearRange?.end === 2026,
    'Parses year range "2020-2026" without misidentifying as artist'
  );

  const rockBetween = parsePrompt('rock between 1970 and 1976');
  assert(
    rockBetween.genre === 'rock' &&
    rockBetween.yearRange?.start === 1970 &&
    rockBetween.yearRange?.end === 1976,
    'Parses "between 1970 and 1976" range'
  );

  const grungeBefore = parsePrompt('90s grunge before 1994');
  assert(
    grungeBefore.genre === 'grunge' &&
    grungeBefore.yearRange?.end === 1993,
    'Parses upper bound "before 1994"'
  );

  const kpopAfter = parsePrompt('k-pop after 2018');
  assert(
    kpopAfter.genre === 'k-pop' &&
    kpopAfter.yearRange?.start === 2019,
    'Parses lower bound "after 2018"'
  );

  const soundtrackYear = parsePrompt('soundtracks in 1999');
  assert(
    soundtrackYear.genre === 'soundtracks' &&
    soundtrackYear.yearRange?.start === 1999 &&
    soundtrackYear.yearRange?.end === 1999,
    'Parses single year "in 1999"'
  );

  // Single artist prompt parsing & noise word scrubbing
  const daftPrompt = parsePrompt('songs by Daft Punk');
  assert(
    daftPrompt.artist?.toLowerCase() === 'daft punk' &&
    !daftPrompt.genre,
    'Parses "songs by Daft Punk" without residual "songs" genre'
  );

  const queenPrompt = parsePrompt('Queen');
  assert(
    queenPrompt.artist === 'Queen' &&
    !queenPrompt.genre,
    'Identifies standalone recognized artist "Queen"'
  );

  // Temporal candidate filtering validation
  assert(isTemporalPermitted({ releaseDate: '2022-04-06T00:00:00Z' }, { start: 2020, end: 2026 }) === true, 'Permits release year within range');
  assert(isTemporalPermitted({ releaseDate: '2019-12-31T00:00:00Z' }, { start: 2020, end: 2026 }) === false, 'Rejects release year before range start');
  assert(isTemporalPermitted({ releaseDate: '2027-01-01T00:00:00Z' }, { start: 2020, end: 2026 }) === false, 'Rejects release year after range end');
  assert(isTemporalPermitted({ releaseDate: '1993-09-21T00:00:00Z' }, { end: 1993 }) === true, 'Permits release year meeting upper bound');
  assert(isTemporalPermitted({ releaseDate: '1994-03-08T00:00:00Z' }, { end: 1993 }) === false, 'Rejects release year exceeding upper bound');

  // Universal Remaster / Reissue Vintage Filtering
  assert(isTemporalPermitted({ title: 'Saved (2024 Remaster)', releaseDate: '2024-01-01' }, { start: 2024, end: 2026 }) === false, 'Rejects legacy remaster tagged as 2024 for contemporary prompt');
  assert(isTemporalPermitted({ title: 'Animate (2004 Remaster)', releaseDate: '2024-01-01' }, { start: 2024, end: 2026 }) === false, 'Extracts 2004 vintage year from title and rejects outside 2024-2026');
  assert(isTemporalPermitted({ title: 'Same Blue', releaseDate: '2024-10-01' }, { start: 2024, end: 2026 }) === true, 'Permits original 2024 track');

  // Cross-theme stem collision and homonym guardrail tests
  // Anime stem collisions (anim*)
  assert(isThematicallyPermitted({ title: 'Bat You\'ll Fly', artist: 'Animal Collective' }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects "Animal Collective" prefix collision for anime');
  assert(isThematicallyPermitted({ title: 'Saved', artist: 'Animosity' }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects "Animosity" prefix collision for anime');
  assert(isThematicallyPermitted({ title: 'As Crianças E Os Animais', artist: 'Os Abelhudos' }, 'anime', 'anime') === false, 'Rejects "Animais" prefix collision for anime');
  assert(isThematicallyPermitted({ title: 'Freefall', artist: 'Techno Animal' }, 'anime', 'anime') === false, 'Rejects "Techno Animal" for anime');
  assert(isThematicallyPermitted({ title: 'Dominator Anthem', artist: 'AniMe' }, 'anime', 'anime') === false, 'Rejects DJ AniMe hardcore anthem for anime');
  assert(isThematicallyPermitted({ title: 'Make It Break', artist: 'Anime', providerArtistId: '147485' }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects Deezer Artist ID 147485 (DJ AniMe) for anime');
  assert(isThematicallyPermitted({ title: 'Absolute Power', artist: 'Broken Minds & Anime', album: 'Break Your Mind' }, 'anime', 'anime') === false, 'Rejects DJ Anime collaboration for anime');
  assert(isThematicallyPermitted({ title: 'Party', artist: 'DJ AniMe', album: 'Aftermath' }, 'anime', 'anime') === false, 'Rejects DJ AniMe prefix for anime');
  assert(isThematicallyPermitted({ title: 'Break Your Mind', artist: 'Broken Minds', album: 'Break Your Mind' }, 'anime', 'anime') === false, 'Rejects Masters of Hardcore album Break Your Mind for anime');
  assert(isThematicallyPermitted({ title: 'Same Blue', artist: 'Official髭男dism' }, 'anime', 'anime songs from 2024 to 2026') === true, 'Permits authentic anime theme for Japanese artist');
  assert(isThematicallyPermitted({ title: 'Sousou no Frieren Opening', artist: 'Dimension Anime' }, 'anime', 'anime') === true, 'Permits authentic anime opening release');

  // Storefront leakage (K-Pop in Apple Music JP)
  assert(isThematicallyPermitted({ title: 'I GOT YOU', artist: 'TWICE', selection: { genre: 'K-Pop' } }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects K-Pop storefront leakage for anime prompt');

  // Gaming stem collisions
  assert(isThematicallyPermitted({ title: 'How We Do', artist: 'The Game' }, 'gaming', 'video game music') === false, 'Rejects rapper "The Game" for gaming prompt');
  assert(isThematicallyPermitted({ title: 'Un Gamin de Paris', artist: 'Francis Lemarque' }, 'gaming', 'video game music') === false, 'Rejects "Gamin" collision for gaming');

  // Pop-Punk collisions
  assert(isThematicallyPermitted({ title: 'Around the World', artist: 'Daft Punk' }, 'poppunk', 'pop-punk hits') === false, 'Rejects Daft Punk for pop-punk');

  // EDM / Dance collisions
  assert(isThematicallyPermitted({ title: 'We Own The Night', artist: 'Dance Gavin Dance' }, 'edm', 'dance edm') === false, 'Rejects post-hardcore band Dance Gavin Dance for EDM');
  assert(isThematicallyPermitted({ title: 'Private Dancer', artist: 'Tina Turner' }, 'edm', 'dance music') === false, 'Rejects Tina Turner Private Dancer for EDM');

  // Latin collisions
  assert(isThematicallyPermitted({ title: 'Radio Africa', artist: 'Latin Quarter' }, 'latin', 'latin music') === false, 'Rejects British band Latin Quarter for Latin');

  // K-Pop Generation Prompt Parsing
  const newGenPrompt = parsePrompt('new gen kpop');
  assert(
    newGenPrompt.genre === 'kpop' &&
    newGenPrompt.generation === 'new' &&
    newGenPrompt.yearRange?.start === 2020 &&
    newGenPrompt.yearRange?.end === 2026,
    'Parses "new gen kpop" into 2020-2026 year range and kpop genre'
  );

  const thirdGenPrompt = parsePrompt('3rd gen kpop');
  assert(
    thirdGenPrompt.genre === 'kpop' &&
    thirdGenPrompt.generation === '3rd' &&
    thirdGenPrompt.yearRange?.start === 2012 &&
    thirdGenPrompt.yearRange?.end === 2019,
    'Parses "3rd gen kpop" into 2012-2019 year range and kpop genre'
  );

  const kpopVariations = generateThemeVariations('kpop');
  assert(
    !kpopVariations.some(v => v.startsWith('gen ')) &&
    !kpopVariations.includes('kpop hits'),
    'Theme variations for kpop avoid "gen kpop" prefixes and over-broad hit queries'
  );

  // Default shuffle buildQueryPlan uses balanced popularity
  const shufflePlan = buildQueryPlan({ genre: 'all' });
  assert(
    shufflePlan.popularity === 'balanced' && shufflePlan.minFans >= 25000,
    'Shuffle query plan defaults to balanced popularity with active fan thresholds'
  );

  // Foreign Dub & Language Filters
  assert(
    isLanguagePermitted({ title: 'Soda Pop (version française)', artist: 'Saja Boys' }, 'kpop', 'new gen kpop') === false,
    'Rejects foreign dub "(version française)" for K-Pop'
  );
  assert(
    isLanguagePermitted({ title: 'Symphonie à dix-sept parties, RH 64: II. Larghetto', artist: 'François-Xavier Roth' }, 'all') === false,
    'Rejects classical orchestral movements for mainstream crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Rock a Bye Baby', artist: 'Nursery Rhymes 123' }, 'all') === false,
    'Rejects nursery rhyme compilations'
  );
  assert(
    isLanguagePermitted({ title: 'Telegrama', artist: 'Zeca Baleiro', selection: { genre: 'Pop Latino' } }, 'all') === false,
    'Rejects foreign genre tracks (Pop Latino) for general crosswords'
  );

  // Authenticity & Low-Quality/Workout/Tribute Filter
  assert(
    isAuthenticTrack({ title: 'Like a G6 (Workout Mix 128 BPM)', artist: 'Power Music Workout' }) === false,
    'Rejects Power Music Workout tracks'
  );
  assert(
    isAuthenticTrack({ title: 'NewJeans (8-Bit Computer Game Version)', artist: '8-Bit Arcade' }) === false,
    'Rejects 8-bit arcade tribute tracks'
  );
  assert(
    isAuthenticTrack({ title: 'White Winged Dove', artist: '1981 Rock Classics' }) === false,
    'Rejects generic year compilation brands'
  );
  assert(
    isAuthenticTrack({ title: 'New Jeans (Slowed + Reverb)', artist: 'Lucrativerecords' }) === false,
    'Rejects slowed/reverb modifications'
  );
  assert(
    isAuthenticTrack({ title: 'New Jeans (Instrumental Version)', artist: 'Lewis Hanton' }) === false,
    'Rejects instrumental covers'
  );
  assert(
    isAuthenticTrack({ title: 'Attention', artist: 'NewJeans' }) === true,
    'Permits authentic track release'
  );

  // K-Pop Thematic Guardrails (Rejection of Carrie Underwood, Steven Wilson, Destiny\'s Child)
  assert(
    isThematicallyPermitted({ title: 'People Who Eat Darkness', artist: 'Steven Wilson' }, 'kpop', 'new gen kpop') === false,
    'Rejects Steven Wilson for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Before He Cheats', artist: 'Carrie Underwood' }, 'kpop', 'new gen kpop') === false,
    'Rejects Carrie Underwood for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Cater 2 U', artist: 'Destiny\'s Child' }, 'kpop', 'new gen kpop') === false,
    'Rejects Destiny\'s Child for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Eyes Without a Face', artist: 'Billy Idol', selection: { genre: 'Rock' } }, 'kpop', 'new gen kpop') === false,
    'Rejects Western Rock on iTunes for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'NEW GEN', artist: 'M4rkim' }, 'kpop', 'new gen kpop') === false,
    'Rejects non-Korean artist token collision for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Liminal Space', artist: 'LE SSERAFIM', selection: { genre: 'K-Pop' } }, 'kpop', 'new gen kpop') === true,
    'Permits authentic K-Pop group LE SSERAFIM'
  );
  assert(
    isThematicallyPermitted({ title: 'CASE 143', artist: 'Stray Kids', selection: { genre: 'K-Pop' } }, 'kpop', 'new gen kpop') === true,
    'Permits authentic K-Pop group Stray Kids'
  );

  // Anime Precision, Authenticity & Homonym Guardrails
  assert(
    DEEZER_GENRE_TAXONOMY.anime.minFans >= 25000,
    'Anime taxonomy enforces minFans >= 25000 to eliminate amateur uploads'
  );
  assert(
    isAuthenticTrack({ title: 'Gurenge (Metal Cover)', artist: 'Little V.' }) === false,
    'Rejects YouTube metal cover artist Little V.'
  );
  assert(
    isAuthenticTrack({ title: 'Unravel', artist: 'Pellek' }) === false,
    'Rejects YouTube rock/metal cover artist Pellek'
  );
  assert(
    isAuthenticTrack({ title: 'IDOL', artist: 'ShiroNeko' }) === false,
    'Rejects fan cover artist ShiroNeko'
  );
  assert(
    isAuthenticTrack({ title: 'Music Box Lullaby', artist: 'Music Box Anime OST' }) === false,
    'Rejects music box BGM cover'
  );
  assert(
    isAuthenticTrack({ title: 'Oshi no Ko (Phonk Remix)', artist: 'Mupp' }) === false,
    'Rejects phonk remix tracks'
  );
  assert(
    isAuthenticTrack({ title: 'IDOL', artist: 'YOASOBI' }) === true,
    'Permits authentic YOASOBI IDOL'
  );
  assert(
    isThematicallyPermitted({ title: "How Far I'll Go", artist: 'Auliʻi Cravalho', album: 'Moana Soundtrack' }, 'anime') === false,
    "Rejects Disney's Moana Western soundtrack for anime"
  );
  assert(
    isThematicallyPermitted({ title: 'Anime Theme', artist: 'Bedroom Artist' }, 'anime') === false,
    "Rejects novelty title matching 'Anime Theme'"
  );
  assert(
    isThematicallyPermitted({ title: "You're So Beautiful", artist: 'Empire Cast' }, 'anime') === false,
    'Rejects Empire Cast American drama for anime'
  );
  assert(
    isThematicallyPermitted({ title: 'IDOL', artist: 'Dizzy DROS' }, 'anime') === false,
    'Rejects Moroccan hip-hop Dizzy DROS for anime'
  );
  assert(
    isThematicallyPermitted({ title: 'Yo sabia', artist: 'Sandoval' }, 'anime') === false,
    'Rejects Latin pop Sandoval for anime'
  );

  console.log('\n--- 3d. Testing Temporal Filtering, Answer Length Variety & English Enforcement ---');

  // 1. Temporal Filtering
  assert(
    isTemporalPermitted({ releaseDate: '1991-09-24', title: 'Smells Like Teen Spirit', artist: 'Nirvana' }, { start: 1990, end: 1999 }) === true,
    'Permits 1991 release for 90s decade filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '2022-03-01', title: 'As It Was', artist: 'Harry Styles' }, { start: 1990, end: 1999 }) === false,
    'Rejects 2022 release for 90s decade filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '2024-05-01', title: 'Espresso', artist: 'Sabrina Carpenter' }, { start: 2020, end: 2026 }) === true,
    'Permits 2024 release for 2020-2026 contemporary filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '1984-11-29', title: 'Careless Whisper', artist: 'George Michael' }, { start: 2020, end: 2026 }) === false,
    'Rejects 1984 release for 2020-2026 filter'
  );
  assert(
    isTemporalPermitted({ releaseDate: '2022-10-21', title: 'Hotel California (2022 Remaster)', artist: 'Eagles' }, { start: 2020, end: 2026 }) === false,
    'Rejects legacy remaster tagged track for contemporary 2020-2026 filter'
  );
  assert(
    isTemporalPermitted({ title: 'Live at Budokan (1982)', artist: 'Cheap Trick' }, { start: 1980, end: 1989 }) === true,
    'Extracts 1982 year from album/title vintage string'
  );
  assert(
    isTemporalPermitted({ title: 'Unknown Track', artist: 'Unknown Artist' }, { start: 1980, end: 1989 }) === false,
    'Rejects track with undetermined release year when strict yearRange is active'
  );

  // 2. English Enforcement for Random Crosswords
  assert(
    isLanguagePermitted({ title: 'Despacito', artist: 'Luis Fonsi' }, 'all', '') === false,
    'Strictly rejects Spanish language tracks for random crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Je t\'aime', artist: 'Lara Fabian' }, 'all', '') === false,
    'Strictly rejects French language tracks for random crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Atemlos durch die Nacht', artist: 'Helene Fischer' }, 'all', '') === false,
    'Strictly rejects German language tracks for random crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Stayin\' Alive', artist: 'Bee Gees' }, 'all', '') === true,
    'Permits iconic English hit for random crosswords'
  );

  // 3. Answer Length Variety and Bucketing
  const shortCandidate = extractAnswerKeyword('Dancing in the Dark', 'Bruce Springsteen', { targetLengthBucket: 'short' });
  assert(
    shortCandidate && shortCandidate.answer.length >= 2 && shortCandidate.answer.length <= 5,
    `Extracts short answer candidate (length ${shortCandidate?.answer?.length}): ${shortCandidate?.answer}`
  );

  const mediumCandidate = extractAnswerKeyword('Dancing in the Dark', 'Bruce Springsteen', { targetLengthBucket: 'medium' });
  assert(
    mediumCandidate && mediumCandidate.answer.length >= 6 && mediumCandidate.answer.length <= 8,
    `Extracts medium answer candidate (length ${mediumCandidate?.answer?.length}): ${mediumCandidate?.answer}`
  );

  const longCandidate = extractAnswerKeyword('Blinding Lights', 'The Weeknd', { targetLengthBucket: 'long' });
  assert(
    longCandidate && longCandidate.answer.length >= 9 && longCandidate.answer.length <= 14,
    `Extracts long answer candidate (length ${longCandidate?.answer?.length}): ${longCandidate?.answer}`
  );

  console.log('\n--- 4. Testing Deezer Provider Resilience and Cache Bounds ---');
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  let now = 0;
  let chartRequests = 0;
  let failedArtistRequests = 0;
  let successfulArtistRequests = 0;
  let retryFailedArtistRequests = true;
  let failAllArtistRequests = false;
  let topLevelFailure = false;
  resetDeezerCachesForTesting();
  Date.now = () => now;
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/chart/0/tracks')) {
      chartRequests++;
      if (topLevelFailure) return new Response('', { status: 400 });
      return new Response(JSON.stringify({
        data: [
          { id: 1, title: 'First Hit', preview: 'https://cdn.example.test/1.mp3', rank: 500000, artist: { id: 10, name: 'First Artist' } },
          { id: 2, title: 'Second Hit', preview: 'https://cdn.example.test/2.mp3', rank: 500000, artist: { id: 20, name: 'Second Artist' } },
        ],
      }), { status: 200 });
    }
    if (requestUrl.includes('/artist/10')) {
      failedArtistRequests++;
      return new Response('', { status: retryFailedArtistRequests ? 503 : 400 });
    }
    if (failAllArtistRequests) return new Response('', { status: 400 });
    successfulArtistRequests++;
    return new Response(JSON.stringify({ nb_fan: 900000 }), { status: 200 });
  };

  try {
    const candidates = await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    assert(
      candidates.length === 1 && candidates[0].providerTrackId === '2' &&
      failedArtistRequests === 3 && successfulArtistRequests === 1,
      'Skips an artist enrichment after retries while retaining other Deezer candidates'
    );

    now += (5 * 60 * 1000) + 1;
    await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    assert(
      chartRequests === 2 && successfulArtistRequests === 2,
      'Expired Deezer track and artist cache entries are removed and refetched'
    );

    resetDeezerCachesForTesting();
    retryFailedArtistRequests = false;
    failAllArtistRequests = true;
    const requestsBeforeFailedScan = chartRequests;
    const emptyCandidates = await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    failAllArtistRequests = false;
    const recoveredCandidates = await deezerMusicProvider.getCandidateTracks({ limit: 2, minFans: 250000 });
    assert(
      emptyCandidates.length === 0 && recoveredCandidates.length === 1 &&
      chartRequests === requestsBeforeFailedScan + 2,
      'Failed artist scans do not cache an empty candidate pool'
    );

    resetDeezerCachesForTesting();
    topLevelFailure = true;
    let propagatedTopLevelFailure = false;
    try {
      await deezerMusicProvider.getCandidateTracks({ limit: 1, minFans: 250000 });
    } catch {
      propagatedTopLevelFailure = true;
    }
    topLevelFailure = false;
    assert(propagatedTopLevelFailure, 'Propagates top-level Deezer provider failures');

    resetDeezerCachesForTesting();
    for (let i = 0; i <= 100; i++) {
      await deezerMusicProvider.getCandidateTracks({ minFans: i, limit: 1 });
    }
    const requestsBeforeEvictedCacheRead = chartRequests;
    await deezerMusicProvider.getCandidateTracks({ minFans: 0, limit: 1 });
    const cacheStats = getDeezerCacheStatsForTesting();
    assert(
      cacheStats.trackEntries === 100 && cacheStats.artistEntries <= 100 &&
      chartRequests === requestsBeforeEvictedCacheRead + 1,
      'Deezer caches use a bounded deterministic eviction limit'
    );
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
    resetDeezerCachesForTesting();
  }

  let tokenNumber = 0;
  const livePuzzleStore = createLivePuzzleStore({
    ttlMs: 10,
    maxEntries: 2,
    createToken: () => `token-${++tokenNumber}`,
  });
  livePuzzleStore.add({ id: 1 });
  livePuzzleStore.add({ id: 2 });
  livePuzzleStore.add({ id: 3 });
  assert(livePuzzleStore.size === 2, 'Live puzzle store evicts the oldest payload at capacity');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(livePuzzleStore.size === 0, 'Live puzzle store expires idle payloads independently');
  livePuzzleStore.clear();
}

async function runIntegrationTests() {
  console.log('\n--- 5. Running Integration Tests with Ephemeral Server ---');

  // Start ephemeral server on random available port
  const testServer = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => {
      resolve(s);
    });
  });

  const address = testServer.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    // Health Check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /api/health responds with 200 ok');

    // Missing X-User-Id rejection
    const unauthRes = await fetch(`${baseUrl}/api/progress`);
    assert(unauthRes.status === 400, 'GET /api/progress without X-User-Id rejected with 400');

    // Invalid X-User-Id format rejection
    const malformedRes = await fetch(`${baseUrl}/api/progress`, {
      headers: { 'X-User-Id': 'invalid ID with spaces!' }
    });
    assert(malformedRes.status === 400, 'GET /api/progress with malformed X-User-Id rejected with 400');

    // Valid progress save & retrieve
    const testUserId = `test_user_${Date.now()}`;
    const saveRes = await fetch(`${baseUrl}/api/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({
        puzzleId: 'test-puz-1',
        themeId: 'rock',
        userLetters: [['T', 'E'], ['S', 'T']],
        validity: [['correct', 'correct'], ['correct', 'correct']]
      })
    });
    const saveData = await saveRes.json();
    assert(saveRes.status === 200 && saveData.success === true, 'POST /api/progress saves state with 200 ok');

    const getRes = await fetch(`${baseUrl}/api/progress`, {
      headers: { 'X-User-Id': testUserId }
    });
    const getData = await getRes.json();
    assert(getData.progress?.puzzleId === 'test-puz-1', 'GET /api/progress retrieves persisted state');

    // Blacklist persistence
    const blPost = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'The Beatles', type: 'artist' })
    });
    assert(blPost.status === 200, 'POST /api/blacklist adds item');

    const blGet = await fetch(`${baseUrl}/api/blacklist`, {
      headers: { 'X-User-Id': testUserId }
    });
    const blData = await blGet.json();
    assert(blData.blacklist.some(b => b.name === 'The Beatles'), 'GET /api/blacklist contains added item');

    const beyonceBlacklist = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'Beyoncé', type: 'artist', provider: 'deezer', providerArtistId: '42' })
    });
    const beyonceGeneric = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'beyonce', type: 'artist' })
    });
    const beyonceSecondScoped = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'BEYONCE', type: 'artist', provider: 'deezer', providerArtistId: '43' })
    });
    const beyonceGenericVariant = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ name: 'BEYONCÉ', type: 'artist' })
    });
    const beyonceData = await beyonceGenericVariant.json();
    const beyonceEntries = beyonceData.blacklist.filter(item => item.canonicalKey === 'beyonce');
    const genericBeyonce = beyonceEntries.find(item => !item.provider);
    const scopedBeyonce = beyonceEntries.find(item =>
      item.provider === 'deezer' && item.providerArtistId === '42'
    );
    assert(
      beyonceBlacklist.status === 200 && beyonceGeneric.status === 200 && beyonceSecondScoped.status === 200 &&
      beyonceEntries.length === 3 && genericBeyonce && scopedBeyonce &&
      beyonceEntries.some(item => item.provider === 'deezer' && item.providerArtistId === '43'),
      'Generic and distinct provider-scoped artist blacklist entries coexist'
    );

    const mapped = mapDeezerTrack({
      id: 99,
      title: 'Test Track',
      preview: 'https://cdn.example.test/preview.mp3',
      link: 'https://www.deezer.com/track/99',
      rank: 500000,
      artist: { id: 42, name: 'Beyoncé' },
      album: { title: 'Test Album', cover_medium: 'https://cdn.example.test/cover.jpg' }
    }, { nb_fan: 900000 });
    assert(
      mapped?.artist === 'Beyoncé' && mapped.provider === 'deezer' && mapped.providerTrackId === '99' && mapped.providerArtistId === '42',
      'Deezer mapping preserves display names and provider IDs'
    );
    assert(
      blacklistMatchesTrack([genericBeyonce], { ...mapped, artist: 'BEYONCE', providerArtistId: '43' }) &&
      blacklistMatchesTrack([scopedBeyonce], { ...mapped, artist: 'BEYONCE' }) &&
      !blacklistMatchesTrack([scopedBeyonce], { ...mapped, artist: 'BEYONCE', providerArtistId: '43' }) &&
      !blacklistMatchesTrack([scopedBeyonce], { ...mapped, provider: 'other', artist: 'BEYONCE' }),
      'Generic artists match canonically while scoped artists match exact provider IDs'
    );
    assert(
      !blacklistMatchesTrack(
        [{ type: 'song', name: 'Hello', provider: 'deezer', providerTrackId: '1' }],
        { provider: 'deezer', providerTrackId: '2', title: 'Hello', artist: 'Different Artist' }
      ),
      'Provider-specific blacklist IDs do not block homonyms'
    );

    const [firstSameTitleSong, secondSameTitleSong, genericSong, genericSongVariant] = await Promise.all([
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'Same Title', type: 'song', provider: 'deezer', providerTrackId: '101' })
      }),
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'same-title', type: 'song', provider: 'deezer', providerTrackId: '202' })
      }),
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'same-title', type: 'song' })
      }),
      fetch(`${baseUrl}/api/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
        body: JSON.stringify({ name: 'Same Title', type: 'song' })
      }),
    ]);
    const songBlacklist = db.getBlacklist(testUserId);
    const sameTitleEntries = songBlacklist.filter(item => item.canonicalKey === 'same title');
    const genericSameTitle = sameTitleEntries.find(item => !item.provider);
    const scopedSameTitle = sameTitleEntries.find(item =>
      item.provider === 'deezer' && item.providerTrackId === '101'
    );
    assert(
      [firstSameTitleSong, secondSameTitleSong, genericSong, genericSongVariant].every(response => response.status === 200) &&
      songBlacklist.filter(item => item.provider === 'deezer' &&
        ['101', '202'].includes(item.providerTrackId)).length === 2 &&
      sameTitleEntries.length === 3 && genericSameTitle && scopedSameTitle &&
      blacklistMatchesTrack([genericSameTitle], {
        provider: 'deezer', providerTrackId: '303', title: 'Same Title', artist: 'Artist Three'
      }) &&
      blacklistMatchesTrack([scopedSameTitle], {
        provider: 'deezer', providerTrackId: '101', title: 'Same Title', artist: 'Artist One'
      }) &&
      !blacklistMatchesTrack([scopedSameTitle], {
        provider: 'deezer', providerTrackId: '202', title: 'Same Title', artist: 'Artist Two'
      }),
      'Generic and provider-scoped songs coexist with exact scoped matching'
    );

    const mockTracks = ['ALPHA', 'PHASE', 'SHAPE', 'HEART', 'EARTH', 'TEARS', 'STARE', 'RATES'].map((title, index) => ({
      id: `deezer:${index}`,
      provider: 'deezer',
      providerTrackId: String(index),
      providerArtistId: String(index),
      title,
      artist: index === 0 ? '21 pilots' : `Artist ${index}`,
      album: 'Mock Album',
      albumArt: '',
      audioUrl: `https://cdn.example.test/${index}.mp3`,
      providerUrl: `https://www.deezer.com/track/${index}`,
      rank: 500000,
      fans: 900000,
      selection: { source: 'deezer', rank: 500000, artistFans: 900000 },
    }));
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });
    const filteredPool = await getRandomSongPool({
      count: 5,
      blacklist: [{ type: 'artist', name: 'artist 1' }],
      recentIds: ['deezer:2', 'hit-3']
    });
    assert(
      filteredPool.length === 5 &&
      filteredPool.every(song => song.id !== 'deezer:2' && song.id !== 'deezer:3' && song.providerArtistId !== '1') &&
      filteredPool.some(song => song.artist === '21 pilots'),
      'Provider pool honors recent Deezer and legacy hit IDs without changing artist displays'
    );
    const tierPool = await getRandomSongPool({ count: 7, blacklist: [{ type: 'artist', name: 'artist 1' }], recentIds: ['deezer:2', 'hit-3', 'hit-3'] });
    const tierIds = tierPool.map(song => song.id);
    assert(
      tierPool.length === 7 && tierIds.indexOf('deezer:2') === 5 && tierIds.indexOf('deezer:3') === 6,
      'Recency tiers fill in order: fresh songs first, then once-played, then twice-played, until the pool is full'
    );

    const duplicateAnswerTracks = [
      { ...mockTracks[0], id: 'deezer:duplicate-1', providerTrackId: 'duplicate-1', title: 'Neon', artist: 'Artist One' },
      { ...mockTracks[1], id: 'deezer:duplicate-2', providerTrackId: 'duplicate-2', title: 'Neon', artist: 'Artist Two' },
    ];
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => duplicateAnswerTracks });
    const uniqueAnswerPool = await getRandomSongPool({ count: 2 });
    assert(
      uniqueAnswerPool.length === 1 && uniqueAnswerPool[0].answer === 'NEON',
      'Provider pool excludes tracks that would duplicate a crossword answer'
    );

    // Test deterministic seed hashing & variety mode
    const determinismCatalog = [
      { id: 'deezer:101', providerTrackId: '101', title: 'Solar', artist: 'Band A', fans: 500000, rank: 500000 },
      { id: 'deezer:102', providerTrackId: '102', title: 'Lunar', artist: 'Band B', fans: 500000, rank: 500000 },
      { id: 'deezer:103', providerTrackId: '103', title: 'Cosmic', artist: 'Band A', fans: 500000, rank: 500000 },
      { id: 'deezer:104', providerTrackId: '104', title: 'Astral', artist: 'Band C', fans: 500000, rank: 500000 },
    ];
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => determinismCatalog });
    const seedRun1 = await getRandomSongPool({ seed: 'test-seed-xyz', count: 4 });
    const seedRun2 = await getRandomSongPool({ seed: 'test-seed-xyz', count: 4 });
    assert(
      seedRun1.length === seedRun2.length &&
      seedRun1.every((t, i) => t.id === seedRun2[i].id),
      'Deterministic seed produces identical song selection and ordering'
    );

    // Variety mode check: Band A has 2 songs (Solar, Cosmic), only 1 should be selected
    const bandACount = seedRun1.filter(t => t.artist === 'Band A').length;
    assert(bandACount === 1, 'Variety mode enforces max 1 track per artist by default');

    // Steered artist check: when artist is steered, multiple tracks by that artist are permitted
    const steeredBandARun = await getRandomSongPool({ artist: 'Band A', count: 4 });
    assert(steeredBandARun.filter(t => t.artist === 'Band A').length === 2, 'Steering single artist permits multiple tracks by that artist');

    // Single artist prompt check: verify prompt parsing, multi-track allowance, and 0% artist clue policy
    const singleArtistCatalog = [
      { id: 'deezer:201', providerTrackId: '201', title: 'One More Time', artist: 'Daft Punk', fans: 500000, rank: 500000 },
      { id: 'deezer:202', providerTrackId: '202', title: 'Harder Better Faster', artist: 'Daft Punk', fans: 500000, rank: 500000 },
      { id: 'deezer:203', providerTrackId: '203', title: 'Get Lucky', artist: 'Daft Punk', fans: 500000, rank: 500000 },
      { id: 'deezer:204', providerTrackId: '204', title: 'Around The World', artist: 'Daft Punk', fans: 500000, rank: 500000 },
    ];
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => singleArtistCatalog });
    const singleArtistPool = await getRandomSongPool({ prompt: 'songs by Daft Punk', count: 4 });
    assert(
      singleArtistPool.length === 4 &&
      singleArtistPool.every(t => t.artist === 'Daft Punk'),
      'Single artist prompt "songs by Daft Punk" selects multiple tracks by target artist'
    );
    assert(
      singleArtistPool.every(t => t.clueType !== 'Artist name'),
      'Single artist crossword enforces 0% "Artist name" clues'
    );
    assert(
      singleArtistPool.every(t => t.clueType === 'Song title' || t.clueType === 'Song title keyword'),
      'Single artist crossword produces 100% Song title or Keyword clues'
    );

    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });

    // Clue variance check: ensure the pool produces diverse clue types across questions
    const diversePool = await getRandomSongPool({ count: 6 });
    const clueTypes = new Set(diversePool.map(s => s.clueType));
    assert(clueTypes.size > 1, 'Song pool yields diverse clue types across questions');

    const invalidLive = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ targetWords: 'not-a-number' })
    });
    assert(invalidLive.status === 400, 'POST /api/puzzles/live validates request data');

    const livePuzzle = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ genre: 'all', targetWords: 6, recentIds: [] })
    });
    const livePuzzleData = await livePuzzle.json();
    assert(
      livePuzzle.status === 200 && livePuzzleData.selection?.provider === 'deezer' &&
      typeof livePuzzleData.livePuzzleToken === 'string' &&
      livePuzzleData.puzzle?.clues?.every(clue => clue.song.provider === 'deezer' && clue.song.selection?.source === 'deezer'),
      'POST /api/puzzles/live returns a complete Deezer puzzle payload'
    );

    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => { throw new Error('provider offline'); } });
    const unavailableLive = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
      body: JSON.stringify({ genre: 'all', targetWords: 6 })
    });
    assert(unavailableLive.status === 503, 'Live provider failure returns an error without static fallback');
    setMusicProviderForTesting();

    // WebSocket Room Creation & Messaging
    await new Promise((resolve, reject) => {
      const hostWs = new WebSocket(wsUrl);
      let guestWs = null;
      let roomCode = null;
      let hostGotStart = false;
      let guestGotStart = false;
      let guestGotCellUpdate = false;
      let hostGotRaceProgress = false;

      const timeout = setTimeout(() => {
        hostWs.close();
        if (guestWs) guestWs.close();
        reject(new Error('WebSocket connection timed out'));
      }, 7000);

      hostWs.on('open', () => {
        hostWs.send(JSON.stringify({
          action: 'create_room',
          playerId: testUserId,
          playerName: 'HostTester',
          mode: 'coop',
          livePuzzleToken: livePuzzleData.livePuzzleToken
        }));
      });

      hostWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'room_created') {
            assert(msg.room && msg.room.code, 'WebSocket creates room with code');
            roomCode = msg.room.code;

            // Connect second player (Guest)
            guestWs = new WebSocket(wsUrl);
            guestWs.on('open', () => {
              guestWs.send(JSON.stringify({
                action: 'join_room',
                roomCode,
                playerId: `${testUserId}_guest`,
                playerName: 'GuestTester'
              }));
            });

            guestWs.on('message', (rawGuest) => {
              const guestMsg = JSON.parse(rawGuest.toString());
              if (guestMsg.type === 'room_joined') {
                assert(guestMsg.room && guestMsg.room.players?.length === 2, 'Player 2 successfully joins room');
                // Host starts the game (must send playerId to prove they are the room host)
                hostWs.send(JSON.stringify({
                  action: 'start_game',
                  roomCode,
                  playerId: testUserId
                }));
              }

              if (guestMsg.type === 'game_started') {
                guestGotStart = true;
                if (hostGotStart) checkSyncAfterStart();
              }

              if (guestMsg.type === 'coop_cell_update') {
                if (guestMsg.row === 1 && guestMsg.col === 2 && (guestMsg.char === 'Z' || guestMsg.value === 'Z')) {
                  guestGotCellUpdate = true;
                  assert(true, 'Player 2 receives real-time coop cell update from Player 1');
                  // Guest sends race progress update back to Host
                  guestWs.send(JSON.stringify({
                    action: 'race_progress_update',
                    roomCode,
                    progress: 80,
                    playerId: `${testUserId}_guest`
                  }));
                }
              }
            });

            guestWs.on('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          }

          if (msg.type === 'game_started') {
            hostGotStart = true;
            assert(true, 'Host receives game_started event');
            if (guestGotStart) checkSyncAfterStart();
          }

          if (msg.type === 'race_progress_update') {
            if (msg.progress === 80) {
              hostGotRaceProgress = true;
              assert(true, 'Host receives real-time race progress update from Player 2');
              finishWsTest();
            }
          }
        } catch (e) {
          clearTimeout(timeout);
          hostWs.close();
          if (guestWs) guestWs.close();
          reject(e);
        }
      });

      function checkSyncAfterStart() {
        assert(true, 'Both players receive synchronized game_started event');
        // Host sends cell update
        hostWs.send(JSON.stringify({
          action: 'coop_cell_update',
          roomCode,
          row: 1,
          col: 2,
          char: 'Z',
          value: 'Z',
          playerId: testUserId,
          senderId: testUserId
        }));
      }

      function finishWsTest() {
        if (guestGotCellUpdate && hostGotRaceProgress) {
          clearTimeout(timeout);
          hostWs.close();
          if (guestWs) guestWs.close();
          resolve();
        }
      }

      hostWs.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  } finally {
    // Flush DB and close server
    db.flushSync();
    await new Promise((resolve) => testServer.close(resolve));
  }
}

async function runSqliteCatalogTests() {
  console.log('\n--- 6. Testing SQLite Music Catalog, Authenticity Filter & Rate Limiter ---');

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
  console.log('\n--- 6b. Testing Catalog Schema v2 & Admission Policy ---');
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
}

async function runMusicMoveArrAndLazyResolverTests() {
  console.log('\n--- 7. Testing MusicMoveArr Streaming Ingestor & Lazy Preview Hydration ---');

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

  // 7. SQLite Catalog: insertSample & allowSampleless Candidate Selection
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

  // Test that allowSampleless=false ignores this track
  const sampleOnlyPool = memCatalog.getRandomPlayableTracks({ allowSampleless: false });
  assert(sampleOnlyPool.length === 0, 'allowSampleless=false returns 0 tracks when samples are missing');

  // Test that allowSampleless=true retrieves this track for JIT hydration
  const lazyPool = memCatalog.getRandomPlayableTracks({ allowSampleless: true });
  assert(lazyPool.length === 1, 'allowSampleless=true returns track for JIT hydration');
  assert(lazyPool[0].title === 'Lazy Sampleless Song', 'Candidate title matches');
  assert(lazyPool[0].deezer_id === '999888', 'Resolves deezer_id from track_providers');

  // Test insertSample: Simulate JIT Lazy Hydration persisting to SQLite
  const sampleSaved = memCatalog.insertSample(lazyPool[0].id, {
    provider: 'deezer',
    providerTrackId: '999888',
    sampleUrl: 'https://cdnt-preview.dzcdn.net/lazy-hydrated.mp3',
    audioCodec: 'mp3',
    sampleDurationSec: 30,
    httpStatus: 200,
  });
  assert(sampleSaved === true, 'insertSample successfully persists lazily resolved preview');

  // Test that subsequent allowSampleless=false queries now hit this track immediately!
  const hydratedPool = memCatalog.getRandomPlayableTracks({ allowSampleless: false });
  assert(hydratedPool.length === 1, 'Subsequent queries return track as a zero-latency cache hit');
  assert(hydratedPool[0].sample_url === 'https://cdnt-preview.dzcdn.net/lazy-hydrated.mp3', 'Cached sample_url is preserved');

  memCatalog.close();
}

async function runCrosswordJudgeAndCulturalGuardsTests() {
  console.log('\n--- 8. Testing Crossword Judge, Cultural Guards & Benchmark Heuristics ---');

  // 1. isAnimeTrack Tests
  assert(
    isAnimeTrack({ artist: 'FLOW', title: 'Colors (Code Geass Opening Theme)', album: 'FLOW THE BEST' }) === true,
    'isAnimeTrack accepts authentic anime opening theme'
  );
  assert(
    isAnimeTrack({ artist: 'Linked Horizon', title: 'Guren no Yumiya', album: 'Attack on Titan OST' }) === true,
    'isAnimeTrack accepts anime franchise soundtrack'
  );
  assert(
    isAnimeTrack({ artist: 'Tatsuro Yamashita', title: 'Plastic Love', album: 'Big Wave' }) === false,
    'isAnimeTrack rejects pure Japanese City Pop / non-anime track'
  );
  assert(
    isAnimeTrack({ artist: 'DJ AniMe', title: 'Hardcore Attack', album: 'Single' }) === false,
    'isAnimeTrack rejects western artist named DJ AniMe'
  );
  assert(
    isAnimeTrack({ artist: 'Ben Mazué', title: 'Le coeur nous anime', album: 'Paradis' }) === false,
    'isAnimeTrack rejects French track with animer conjugation'
  );
  assert(
    isAnimeTrack({ artist: 'Animal Collective', title: 'My Girls', album: 'Merriweather' }) === false,
    'isAnimeTrack rejects English band with animal stem'
  );
  assert(
    isAnimeTrack({ artist: 'LISA', title: 'Rockstar', album: 'Alter Ego' }) === false,
    'isAnimeTrack rejects Western rap single by LISA'
  );

  // 2. isJapaneseTrack Tests
  assert(
    isJapaneseTrack({ artist: 'Tatsuro Yamashita', title: 'Ride On Time', language: 'ja' }) === true,
    'isJapaneseTrack accepts authentic Japanese City Pop artist'
  );
  assert(
    isJapaneseTrack({ artist: 'Miki Matsubara', title: 'Stay With Me', album: 'Pocket Park' }) === true,
    'isJapaneseTrack accepts recognized Japanese artist roster'
  );
  assert(
    isJapaneseTrack({ artist: 'The Japanese House', title: 'Saw You In A Dream', language: 'en' }) === false,
    'isJapaneseTrack rejects UK indie band The Japanese House'
  );
  assert(
    isJapaneseTrack({ artist: 'Aneka', title: 'Japanese Boy', language: 'en' }) === false,
    'isJapaneseTrack rejects 80s novelty pop track Japanese Boy'
  );

  // 3. isAuthenticTrack Tests
  assert(
    isAuthenticTrack({ artist: 'Fonzi M', title: 'Yumetourou [Guitar Version]' }) === false,
    'isAuthenticTrack rejects YouTube instrumental/guitar versions'
  );
  assert(
    isAuthenticTrack({ artist: 'Various Artists', title: 'Bohemian Rhapsody (Karaoke Version)' }) === false,
    'isAuthenticTrack rejects karaoke tracks'
  );
  assert(
    isAuthenticTrack({ artist: 'Workout Crew', title: 'Levitating (130 BPM Workout Mix)' }) === false,
    'isAuthenticTrack rejects workout mix audio utilities'
  );
  assert(
    isAuthenticTrack({ artist: 'Queen', title: 'Bohemian Rhapsody', album: 'A Night At The Opera' }) === true,
    'isAuthenticTrack permits authentic original rock masterpiece'
  );

  // 4. judgePuzzle Evaluation Logic
  const mockCleanPuzzle = {
    cols: 12,
    rows: 12,
    clues: [
      { answer: 'QUEEN', length: 5, clueType: 'Track keyword', crossings: 2, song: { artist: 'Queen', title: 'Killer Queen', language: 'en', popularity: 85, release_year: 1974 } },
      { answer: 'RADIO', length: 5, clueType: 'Track keyword', crossings: 1, song: { artist: 'Queen', title: 'Radio Ga Ga', language: 'en', popularity: 88, release_year: 1984 } },
      { answer: 'CHAMPIONS', length: 9, clueType: 'Track keyword', crossings: 2, song: { artist: 'Queen', title: 'We Are The Champions', language: 'en', popularity: 92, release_year: 1977 } },
      { answer: 'RHAPSODY', length: 8, clueType: 'Track keyword', crossings: 3, song: { artist: 'Queen', title: 'Bohemian Rhapsody', language: 'en', popularity: 95, release_year: 1975 } },
      { answer: 'WILL', length: 4, clueType: 'Track keyword', crossings: 1, song: { artist: 'Queen', title: 'We Will Rock You', language: 'en', popularity: 91, release_year: 1977 } },
      { answer: 'DUST', length: 4, clueType: 'Track keyword', crossings: 2, song: { artist: 'Queen', title: 'Another One Bites The Dust', language: 'en', popularity: 94, release_year: 1980 } },
    ],
  };

  const cleanJudgment = judgePuzzle(mockCleanPuzzle, {
    prompt: 'songs by Queen',
    archetype: 'standard',
    parsed: { artist: 'Queen' },
    expectedLanguage: 'en',
    targetWords: 6,
  });

  assert(cleanJudgment.passed === true, 'judgePuzzle passes clean thematic single-artist puzzle');
  assert(cleanJudgment.metrics.wordLengths.shortCount === 4, 'judgePuzzle counts 4 short words (<=5 chars)');
  assert(cleanJudgment.metrics.wordLengths.shortRatio === 0.67, 'judgePuzzle short word ratio is 67%');

  // Test violation detection: Leaked artist clue & foreign language
  const mockViolatingPuzzle = {
    cols: 10,
    rows: 10,
    clues: [
      { answer: 'QUEEN', length: 5, clueType: 'Artist name', crossings: 1, song: { artist: 'Queen', title: 'Killer Queen', language: 'es' } },
      { answer: 'DESPACITO', length: 9, clueType: 'Song title', crossings: 1, song: { artist: 'Luis Fonsi', title: 'Despacito', language: 'es' } },
    ],
  };
  const violatingJudgment = judgePuzzle(mockViolatingPuzzle, {
    prompt: 'songs by Queen',
    archetype: 'standard',
    parsed: { artist: 'Queen' },
    expectedLanguage: 'en',
    targetWords: 6,
  });
  assert(violatingJudgment.passed === false, 'judgePuzzle fails puzzle with foreign tracks and leaked artist clues');
  assert(violatingJudgment.violations.length >= 2, 'Detects multiple violations for artist mismatch and language');

  // 5. judgeMultiGenerationSuite Aggregation
  const multiJudge = judgeMultiGenerationSuite('songs by Queen', [mockCleanPuzzle, mockCleanPuzzle], {
    archetype: 'standard',
    parsed: { artist: 'Queen' },
  });
  assert(multiJudge.generationsCount === 2, 'Aggregates 2 generations');
  assert(multiJudge.repetitiveness.totalPlacedTracks === 12, 'Tallies 12 total placed tracks');
  assert(multiJudge.repetitiveness.distinctTracksCount === 6, 'Identifies 6 unique tracks when identical puzzles passed');
  assert(multiJudge.repetitiveness.uniqueTrackRatio === 0.5, 'Computes 0.5 uniqueness ratio');
  assert(multiJudge.repetitiveness.avgJaccard === 1, 'Computes Jaccard 1.0 for completely identical generations');
}

async function runCatalogValidatorTests() {
  console.log('\n--- 9. Testing Database Validation Engine, Dupe Detection & Diagnostics ---');

  const memCatalog = new SqliteCatalog(':memory:');
  const validator = new CatalogValidator(memCatalog.db);

  // 1. Pragmas check
  const pragmas = validator.checkPragmas();
  assert(pragmas.integrityOk === true, 'In-memory catalog passes integrity check');
  assert(pragmas.foreignKeysOk === true, 'In-memory catalog has zero foreign key violations');

  // 2. Populate test data with duplicates and anomalies
  // Track 1
  memCatalog.upsertTrack({
    title: 'Starboy',
    artist: 'The Weeknd',
    isrc: 'USUM71607007',
    album: 'Starboy',
    durationMs: 230000,
    popularity: 950000,
    provider: 'deezer',
    providerTrackId: '138597793',
    sampleUrl: 'https://cdns-preview.deezer.com/preview-1.mp3',
    releaseYear: 2016,
    artistMetadata: { genres: ['Pop', 'R&B'] },
  });

  // Track 2: Soft duplicate of Track 1 (same artist, same canonical title, duration delta = 1000ms)
  memCatalog.db.prepare(`
    INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, release_date, country_code, language, popularity, is_explicit)
    VALUES ('USUM71607008', 'starboy', 'Starboy', 1, 'Starboy (Deluxe)', 231000, 2016, '2016-11-25', 'US', 'en', 900000, 1)
  `).run();

  // Legacy junk from before the admission policy existed (upsertTrack now refuses these rows)
  const insertLegacyTrack = ({ title, artist, canonicalArtist, isrc, album, durationMs, providerTrackId, sampleUrl, genres = null }) => {
    memCatalog.db.prepare('INSERT OR IGNORE INTO artists (canonical_name, display_name, genres_json) VALUES (?, ?, ?)')
      .run(canonicalArtist, artist, genres ? JSON.stringify(genres) : null);
    const artistId = memCatalog.db.prepare('SELECT id FROM artists WHERE canonical_name = ?').get(canonicalArtist).id;
    const trackId = Number(memCatalog.db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, language, popularity)
      VALUES (?, ?, ?, ?, ?, ?, 'de', 41)
    `).run(isrc, normalizeDedupeTitle(title), title, artistId, album, durationMs).lastInsertRowid);
    memCatalog.insertSample(trackId, { provider: 'deezer', providerTrackId, sampleUrl });
    memCatalog.db.prepare("INSERT INTO track_providers (track_id, provider, provider_track_id) VALUES (?, 'deezer', ?)").run(trackId, providerTrackId);
  };

  // Track 3: Contaminated audiobook track
  insertLegacyTrack({
    title: 'Kapitel 1 - Das Schloss',
    artist: 'Gruselkabinett',
    canonicalArtist: 'gruselkabinett',
    isrc: 'DEUM71600001',
    album: 'Folge 01',
    durationMs: 120000,
    providerTrackId: '999999',
    sampleUrl: 'https://cdns-preview.deezer.com/preview-audiobook.mp3',
    genres: ['Spoken Word'],
  });

  // Track 4: Short duration anomaly (< 15s)
  insertLegacyTrack({
    title: 'Intro SFX',
    artist: 'Sound Effects FX',
    canonicalArtist: 'sound effects fx',
    isrc: 'USFX71600001',
    album: 'Effects',
    durationMs: 8000,
    providerTrackId: '888888',
    sampleUrl: 'https://cdns-preview.deezer.com/preview-sfx.mp3',
  });

  // 3. Test findDuplicates
  const dupes = validator.findDuplicates();
  assert(dupes.softDuplicateClustersCount === 1, 'Detects exactly 1 soft duplicate cluster');
  assert(dupes.softDuplicatesSample[0].artist === 'The Weeknd', 'Identifies duplicate artist as The Weeknd');

  // 4. Test findDataAnomalies
  const anomalies = validator.findDataAnomalies();
  assert(anomalies.durationAnomalies.tooShortCount === 1, 'Detects track under 15 seconds');
  assert(anomalies.contamination.audiobooksCount === 1, 'Detects Gruselkabinett audiobook contamination');
  assert(anomalies.contamination.totalContaminatedCount === 1, 'Tallies total contaminated tracks');

  // 5. Test generateStatistics
  const stats = validator.generateStatistics();
  assert(stats.overview.totalTracks === 4, 'Counts 4 total tracks in test database');
  assert(stats.overview.totalArtists === 3, 'Counts 3 distinct artists in test database');
  assert(stats.overview.sampleCoveragePct === 75, 'Computes 75% audio sample coverage (3/4 tracks with samples)');
  assert(stats.popularity.normalizedAvgPop > 0, 'Computes normalized average popularity');

  // 6. Cleanup dry run changes nothing
  const dryCleanup = runCatalogCleanup(memCatalog.db);
  assert(dryCleanup.applied === false && validator.generateStatistics().overview.totalTracks === 4, 'Cleanup dry run rolls back');

  // 7. Cleanup merges the duplicate and deletes the audiobook and the 8-second clip
  const cleanup = runCatalogCleanup(memCatalog.db, { apply: true });
  assert(cleanup.steps.find(s => s.name === 'duplicates').removed === 1, 'Cleanup merges the duplicate Starboy row');
  assert(cleanup.steps.find(s => s.name === 'policy').deleted === 2, 'Cleanup deletes the audiobook and the too-short clip');

  // 8. Verify post-cleanup state
  const postStats = validator.generateStatistics();
  assert(postStats.overview.totalTracks === 1, '1 canonical track remains after cleanup');
  const postDupes = validator.findDuplicates();
  assert(postDupes.softDuplicateClustersCount === 0, 'Zero duplicate groups remain after cleanup');

  // 9. Test Report Generation
  const reportMd = validator.generateMarkdownReport({
    pragmas,
    orphans: validator.findOrphans(),
    duplicates: postDupes,
    anomalies: validator.findDataAnomalies(),
    stats: postStats,
    cleanup,
    gate: evaluateCatalogGate(memCatalog.db, { minYearCoverage: 0, minIsrcCoverage: 0 }),
  });
  assert(typeof reportMd === 'string' && reportMd.includes('# SpotySpice Database Validation') && reportMd.includes('## 8. Validation Gate'), 'Generates valid markdown report string');
}

async function runAnimeCatalogAndIsolationTests() {
  console.log('\n--- 10. Testing Dedicated Anime OP/ED Catalog, Variations & Sourcing Isolation ---');

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
}

async function runClueSystemAndZeroLeakTests() {
  console.log('\n--- 11. Testing Zero-Spoiler Clue System & Audio Proxy Configuration ---');

  // 1. Vite config proxy check
  const viteConfigContent = fs.readFileSync('vite.config.ts', 'utf-8');
  assert(viteConfigContent.includes("'/audio':"), 'Vite configuration includes /audio proxy rule');
  assert(viteConfigContent.includes('target: `http://127.0.0.1:${serverPort}`'), 'Vite /audio proxy targets Express serverPort');

  // 2. containsAnswerLeak unit assertions
  assert(
    containsAnswerLeak('[Anime] ED1 of "Mahou Sensei Negima!" by Yuu Kobayashi', 'YUUKOBAYASHI', ['Yuu Kobayashi']) === true,
    'containsAnswerLeak detects exact concatenated artist answer in clue'
  );
  assert(
    containsAnswerLeak('[Anime] ED1 of "Mahou Sensei Negima!" by Yuu Kobayashi', 'KOBAYASHI') === true,
    'containsAnswerLeak detects individual artist surname token'
  );
  assert(
    containsAnswerLeak('Performer behind the hit "Blinding Lights"', 'THEWEEKND') === false,
    'containsAnswerLeak permits clean non-leaking clue'
  );
  assert(
    containsAnswerLeak('Track by Bad Company', 'BADCOMPANY') === true,
    'containsAnswerLeak detects self-titled artist leak'
  );

  // 2b. sanitizeClue fallback assertions
  assert(
    sanitizeClue('Track by Bad Company', 'BADCOMPANY', 'Fallback clue') === 'Fallback clue',
    'sanitizeClue replaces leaked clue with fallback template'
  );
  assert(
    sanitizeClue('Performer behind the hit "Blinding Lights"', 'THEWEEKND', 'Fallback clue') === 'Performer behind the hit "Blinding Lights"',
    'sanitizeClue retains clean clue when no leak is detected'
  );

  // 3. Anime Clue Formatting & Zero Leak Guarantee
  const sampleAnimeTrack = {
    title: 'Kagayaku Kimi e',
    song_title: 'Kagayaku Kimi e',
    artist: 'Yuu Kobayashi',
    artist_name: 'Yuu Kobayashi',
    animeTitle: 'Mahou Sensei Negima!',
    themeType: 'ED',
    themeSlug: 'ED1',
    releaseYear: 2005,
    isAnimeOped: true,
  };

  // 3a. Artist clue for anime track
  const artistClue = formatCrosswordClue(sampleAnimeTrack, {
    answer: 'YUUKOBAYASHI',
    clueType: 'Artist name',
    artistName: 'Yuu Kobayashi',
  });
  assert(!artistClue.toLowerCase().includes('yuu'), 'Anime artist clue NEVER contains artist first name');
  assert(!artistClue.toLowerCase().includes('kobayashi'), 'Anime artist clue NEVER contains artist surname');
  assert(artistClue.includes('Mahou Sensei Negima!'), 'Anime artist clue specifies anime franchise');
  assert(artistClue.includes('ED1'), 'Anime artist clue specifies theme slug');
  assert(!containsAnswerLeak(artistClue, 'YUUKOBAYASHI'), 'containsAnswerLeak confirms 0 leak for anime artist clue');

  // 3b. Song title clue for anime track
  const titleClue = formatCrosswordClue(sampleAnimeTrack, {
    answer: 'KAGAYAKUKIMIE',
    clueType: 'Song title',
  });
  assert(!titleClue.toLowerCase().includes('kagayaku'), 'Anime title clue NEVER contains song title');
  assert(!titleClue.includes('Yuu Kobayashi'), 'Anime title clue does NOT involve artist name');
  assert(titleClue.includes('ED1'), 'Anime title clue mentions theme slug ED1');
  assert(!containsAnswerLeak(titleClue, 'KAGAYAKUKIMIE'), 'containsAnswerLeak confirms 0 leak for anime title clue');

  // 3c. Title keyword clue for anime track
  const keywordClue = formatCrosswordClue(sampleAnimeTrack, {
    answer: 'KAGAYAKU',
    clueType: 'Song title keyword',
  });
  assert(!keywordClue.toLowerCase().includes('kagayaku'), 'Anime keyword clue NEVER contains the keyword answer');
  assert(!containsAnswerLeak(keywordClue, 'KAGAYAKU'), 'containsAnswerLeak confirms 0 leak for anime keyword clue');

  // 4. General Music Clue Formatting & Zero Leak Guarantee
  const generalTrack = {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    releaseYear: 2020,
    isAnimeOped: false,
  };

  const generalArtistClue = formatCrosswordClue(generalTrack, {
    answer: 'THEWEEKND',
    clueType: 'Artist name',
    artistName: 'The Weeknd',
  });
  assert(!generalArtistClue.toLowerCase().includes('weeknd'), 'General artist clue NEVER contains artist name');
  assert(generalArtistClue.includes('Blinding Lights'), 'General artist clue identifies hit track');
  assert(!containsAnswerLeak(generalArtistClue, 'THEWEEKND'), 'containsAnswerLeak confirms 0 leak for general artist clue');

  const generalTitleClue = formatCrosswordClue(generalTrack, {
    answer: 'BLINDINGLIGHTS',
    clueType: 'Song title',
  });
  assert(!generalTitleClue.toLowerCase().includes('blinding'), 'General title clue NEVER contains title tokens');
  assert(generalTitleClue.includes('The Weeknd'), 'General title clue identifies artist');
  assert(!containsAnswerLeak(generalTitleClue, 'BLINDINGLIGHTS'), 'containsAnswerLeak confirms 0 leak for general title clue');

  // 5. Self-Titled Edge Case Protection
  const selfTitledTrack = {
    title: 'Iron Maiden',
    artist: 'Iron Maiden',
    releaseYear: 1980,
    isAnimeOped: false,
  };
  const selfTitledArtistClue = formatCrosswordClue(selfTitledTrack, {
    answer: 'IRONMAIDEN',
    clueType: 'Artist name',
    artistName: 'Iron Maiden',
  });
  assert(!selfTitledArtistClue.toLowerCase().includes('maiden'), 'Self-titled track suppresses title in artist clue to avoid spoiler');
  assert(!containsAnswerLeak(selfTitledArtistClue, 'IRONMAIDEN'), 'Zero leak on self-titled artist clue');

  // 6. High-Volume Randomized Stress Test (500 iterations)
  const franchises = ['Naruto', 'One Piece', 'Bleach', 'Attack on Titan', 'Demon Slayer', 'Jujutsu Kaisen', 'Fullmetal Alchemist'];
  const artists = ['KANA-BOON', 'Ado', 'LiSA', 'Asian Kung-Fu Generation', 'Linked Horizon', 'EVE', 'RADWIMPS'];
  const titles = ['Silhouette', 'Shin Jidai', 'Gurenge', 'Haruka Kanata', 'Shinzou wo Sasageyo', 'Kaikai Kitan', 'Sparkle'];

  for (let i = 0; i < 500; i++) {
    const f = franchises[i % franchises.length];
    const a = artists[i % artists.length];
    const t = titles[i % titles.length];
    const track = {
      title: t,
      song_title: t,
      artist: a,
      artist_name: a,
      animeTitle: f,
      themeType: i % 2 === 0 ? 'OP' : 'ED',
      themeSlug: `${i % 2 === 0 ? 'OP' : 'ED'}${1 + (i % 5)}`,
      releaseYear: 2000 + (i % 24),
      isAnimeOped: true,
    };

    const preferredType = ['anime', 'title', 'artist', 'keyword'][i % 4];
    const keyword = extractAnswerKeyword(t, a, { preferredType, allowArtist: true, animeTitle: f });
    if (!keyword) continue;

    const clue = formatCrosswordClue(track, keyword);

    const leak = containsAnswerLeak(clue, keyword.answer);
    if (leak) {
      throw new Error(`Leak detected in stress test! Clue: "${clue}", Answer: "${keyword.answer}"`);
    }
  }
  assert(true, 'Zero answer leaks across 500 randomized stress test generations (including Anime title)');
}

async function runAnimeArtAndKeyphraseClueDisciplineTests() {
  console.log('\n--- 12. Testing Anime Art Resolution, Keyphrase Duplication & Clue Discipline ---');

  // 1. Anime Keyphrase Extraction
  assert(extractAnimeKeyphrase('anime gundam') === 'gundam', 'extractAnimeKeyphrase extracts "gundam" from "anime gundam"');
  assert(extractAnimeKeyphrase('anime openings naruto') === 'naruto', 'extractAnimeKeyphrase extracts "naruto" from "anime openings naruto"');
  assert(extractAnimeKeyphrase('bleach anime ost') === 'bleach', 'extractAnimeKeyphrase extracts "bleach" from "bleach anime ost"');
  assert(extractAnimeKeyphrase('anime') === '', 'extractAnimeKeyphrase returns empty string for generic "anime"');
  assert(extractAnimeKeyphrase('anime from the 90s') === '', 'extractAnimeKeyphrase returns empty string for temporal "anime from the 90s"');

  // 2. Query Plan carries targetAnimeKeyphrase
  const gundamPlan = buildQueryPlan({ prompt: 'anime gundam' });
  assert(gundamPlan.targetAnimeKeyphrase === 'gundam', 'buildQueryPlan attaches targetAnimeKeyphrase="gundam"');
  const genericPlan = buildQueryPlan({ prompt: 'anime' });
  assert(genericPlan.targetAnimeKeyphrase === null, 'buildQueryPlan leaves targetAnimeKeyphrase null for generic prompt');

  // 3. Clue & Answer Discipline: Target Keyphrases blocked from grid solutions
  const seenGundamAnswers = new Set();
  const animeKeyphrase = 'gundam';
  animeKeyphrase.split(/[^a-zA-Z0-9]+/).forEach(tok => {
    if (tok.length >= 3) seenGundamAnswers.add(tok.toUpperCase());
  });
  assert(seenGundamAnswers.has('GUNDAM'), 'seenAnswers blacklists target anime keyphrase GUNDAM from grid solution');

  const seenArtistAnswers = new Set();
  const targetArtist = 'Dolly Parton';
  targetArtist.split(/[^a-zA-Z0-9]+/).forEach(tok => {
    if (tok.length >= 3) seenArtistAnswers.add(tok.toUpperCase());
  });
  assert(seenArtistAnswers.has('DOLLY'), 'seenAnswers blacklists first artist name token DOLLY');
  assert(seenArtistAnswers.has('PARTON'), 'seenAnswers blacklists second artist name token PARTON');

  // 4. Anime Crossword 3-Way Entity Variation & Zero-Leak Discipline
  const solaTrack = {
    title: 'Colorless wind',
    song_title: 'Colorless wind',
    artist: 'Aira Yuuki',
    artist_name: 'Aira Yuuki',
    animeTitle: 'Sola',
    themeType: 'OP',
    themeSlug: 'OP2',
    releaseYear: 2007,
    isAnimeOped: true,
  };

  // 4a. Candidate extraction supports Anime title, Song title, and Artist name
  const solaCandidates = extractAllAnswerCandidates(solaTrack.title, solaTrack.artist, { animeTitle: solaTrack.animeTitle });
  assert(solaCandidates.anime?.answer === 'SOLA', 'extractAllAnswerCandidates extracts anime answer SOLA');
  assert(solaCandidates.title?.answer === 'COLORLESSWIND', 'extractAllAnswerCandidates extracts title COLORLESSWIND');
  assert(solaCandidates.artist?.answer === 'AIRAYUUKI', 'extractAllAnswerCandidates extracts artist AIRAYUUKI');

  // 4b. When asking for Anime title: Anime title is strictly NOT in the clue
  const animeKw = extractAnswerKeyword(solaTrack.title, solaTrack.artist, { preferredType: 'anime', animeTitle: solaTrack.animeTitle });
  assert(animeKw.clueType === 'Anime title', 'Anime preferred type returns Anime title clue');
  assert(animeKw.answer === 'SOLA', 'Anime answer is SOLA');
  const animeClue = formatCrosswordClue(solaTrack, animeKw);
  assert(!animeClue.toLowerCase().includes('sola'), 'Anime title clue NEVER mentions anime title "Sola"');
  assert(!containsAnswerLeak(animeClue, animeKw.answer), 'containsAnswerLeak confirms 0 leak for Anime title clue');

  // 4c. When asking for Artist name: Artist name is strictly NOT in the clue
  const artistKw = extractAnswerKeyword(solaTrack.title, solaTrack.artist, { preferredType: 'artist', animeTitle: solaTrack.animeTitle, allowArtist: true });
  assert(artistKw.clueType === 'Artist name', 'Artist preferred type returns Artist name clue');
  assert(artistKw.answer === 'AIRAYUUKI', 'Artist answer is AIRAYUUKI');
  const artistClue = formatCrosswordClue(solaTrack, artistKw);
  assert(!artistClue.toLowerCase().includes('aira') && !artistClue.toLowerCase().includes('yuuki'), 'Artist clue NEVER mentions artist "Aira Yuuki"');
  assert(artistClue.includes('Sola'), 'Artist clue mentions anime title context');
  assert(!containsAnswerLeak(artistClue, artistKw.answer), 'containsAnswerLeak confirms 0 leak for Artist clue');

  // 4d. When asking for Song title: Song title is NOT in the clue, and NO gratuitous artist inclusion
  const titleKw = extractAnswerKeyword(solaTrack.title, solaTrack.artist, { preferredType: 'title', animeTitle: solaTrack.animeTitle });
  assert(titleKw.clueType === 'Song title', 'Title preferred type returns Song title clue');
  const titleClue = formatCrosswordClue(solaTrack, titleKw);
  assert(!titleClue.toLowerCase().includes('colorless') && !titleClue.toLowerCase().includes('wind'), 'Title clue NEVER mentions song title');
  assert(!titleClue.toLowerCase().includes('aira yuuki'), 'Title clue does NOT involve artist name');
  assert(!containsAnswerLeak(titleClue, titleKw.answer), 'containsAnswerLeak confirms 0 leak for Title clue');

  // 4e. When asking for Song title keyword: Keyword is NOT in the clue, and NO artist inclusion
  const kwKw = extractAnswerKeyword(solaTrack.title, solaTrack.artist, { preferredType: 'keyword', animeTitle: solaTrack.animeTitle });
  assert(kwKw.clueType === 'Song title keyword', 'Keyword preferred type returns Song title keyword clue');
  const keywordClue = formatCrosswordClue(solaTrack, kwKw);
  assert(!keywordClue.toLowerCase().includes(kwKw.answer.toLowerCase()), 'Keyword clue NEVER mentions keyword answer');
  assert(!keywordClue.toLowerCase().includes('aira yuuki'), 'Keyword clue does NOT involve artist name');
  assert(!containsAnswerLeak(keywordClue, kwKw.answer), 'containsAnswerLeak confirms 0 leak for Keyword clue');

  // 5. Victory Screen Image Persistence & Caching
  const { AnimeCatalog } = await import('../server/db/animeCatalog.js');
  const testAnimeDb = new AnimeCatalog(':memory:');

  const trackId = testAnimeDb.upsertAnimeTrack({
    animeTitle: 'Mobile Suit Gundam Wing',
    songTitle: 'Just Communication',
    artistName: 'TWO-MIX',
    themeType: 'OP',
    themeNumber: 1,
    year: 1995,
    originalFilePath: '/test/gundam_op1.webm',
  });

  testAnimeDb.insertSample({
    animeTrackId: trackId,
    sampleIndex: 1,
    samplePath: '/test/samples/gundam_1.mp3',
    sampleUrl: '/audio/anime/gundam_1.mp3',
    offsetSeconds: 10,
  });

  // Initially has no image
  const initialTracks = testAnimeDb.getRandomAnimeTracks({ count: 5 });
  assert(initialTracks.length === 1, 'Returns upserted test track');
  assert(initialTracks[0].albumArt === '', 'Track initially has empty albumArt');

  // Update track image directly
  const updateSuccess = testAnimeDb.updateTrackImageUrl(trackId, 'https://s4.anilist.co/file/gundam_wing.jpg');
  assert(updateSuccess === true, 'updateTrackImageUrl returns true on success');

  const hydratedTracks = testAnimeDb.getRandomAnimeTracks({ count: 5 });
  assert(hydratedTracks[0].albumArt === 'https://s4.anilist.co/file/gundam_wing.jpg', 'getRandomAnimeTracks returns updated albumArt');
  assert(hydratedTracks[0].imageUrl === 'https://s4.anilist.co/file/gundam_wing.jpg', 'getRandomAnimeTracks returns updated imageUrl');

  // Update by series title
  const bulkUpdated = testAnimeDb.updateAnimeCoverByTitle('Mobile Suit Gundam Wing', 'https://s4.anilist.co/file/gundam_series.jpg');
  assert(bulkUpdated === 1, 'updateAnimeCoverByTitle updates 1 track matching series');

  const seriesHydrated = testAnimeDb.getRandomAnimeTracks({ count: 5 });
  assert(seriesHydrated[0].albumArt === 'https://s4.anilist.co/file/gundam_series.jpg', 'Bulk series update populates albumArt');

  // 6. resolveAnimeCoverImages service handles existing albumArt gracefully
  const mockAnimeTracks = [
    { id: 'anime_1', animeTitle: 'Mobile Suit Gundam Wing', albumArt: 'https://s4.anilist.co/existing.jpg', isAnimeOped: true },
    { id: 'anime_2', animeTitle: 'Non-anime', albumArt: 'https://example.com/cover.jpg', isAnimeOped: false },
  ];
  const resolvedResult = await resolveAnimeCoverImages(mockAnimeTracks, { animeDb: testAnimeDb });
  assert(resolvedResult[0].albumArt === 'https://s4.anilist.co/existing.jpg', 'resolveAnimeCoverImages preserves pre-existing artwork');

  testAnimeDb.close();
}

function mockJsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function wsTestClient(url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const idx = waiters.findIndex(w => w.pred(msg));
    if (idx >= 0) {
      const [waiter] = waiters.splice(idx, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    } else {
      queue.push(msg);
    }
  });
  return {
    ws,
    open: new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    }),
    send: (payload) => ws.send(JSON.stringify(payload)),
    next(pred, timeoutMs = 3000) {
      const queued = queue.findIndex(pred);
      if (queued >= 0) return Promise.resolve(queue.splice(queued, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { pred, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const k = waiters.indexOf(waiter);
          if (k >= 0) waiters.splice(k, 1);
          reject(new Error('Timed out waiting for WebSocket message'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close: () => ws.close(),
  };
}

async function runPhase1HardeningTests() {
  console.log('\n--- 5b. Testing Stable Previews, HTTP Hardening & Multiplayer Authorization ---');

  // 1. Signed preview expiry parsing
  const nowSec = Math.floor(Date.now() / 1000);
  const signed = (expSec) => `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=exp=${expSec}~acl=/api/1/1/a/b/c/0/abc.mp3*~data=user_id=0,application_id=42~hmac=deadbeef`;
  assert(parsePreviewExpiry(signed(1789817437)) === 1789817437000, 'Parses Deezer hdnea expiry into epoch milliseconds');
  assert(parsePreviewExpiry('https://audio-ssl.itunes.apple.com/preview.m4a') === null, 'Unsigned iTunes preview has no expiry');
  assert(isPreviewUrlFresh(signed(nowSec - 60)) === false, 'Expired signed Deezer URL is not fresh');
  assert(isPreviewUrlFresh(signed(nowSec + 30)) === false, 'Signed URL inside the safety margin is treated as stale');
  assert(isPreviewUrlFresh(signed(nowSec + 600)) === true, 'Signed URL valid for 10 minutes is fresh');
  assert(isPreviewUrlFresh('https://audio-ssl.itunes.apple.com/preview.m4a') === true, 'Unsigned https URL is fresh');
  assert(isPreviewUrlFresh('/audio/anime/op.ogg') === false, 'Relative paths are not remote preview URLs');

  // 2. Stable preview references
  assert(parsePreviewRef('deezer:3135556')?.ref === 'deezer:3135556', 'Parses deezer preview ref');
  assert(parsePreviewRef('spotify:1') === null && parsePreviewRef('deezer:12a') === null, 'Rejects unknown providers and non-numeric ids');
  assert(validatePreviewRef('itunes:42') === 'itunes:42' && validatePreviewRef('../etc/passwd') === null, 'Validator only accepts provider:id refs');
  assert(previewRefForTrack({ id: 'sqlite:5', provider: 'deezer', providerTrackId: '5', deezer_id: '77' }) === 'deezer:77', 'Catalog track prefers its cross-referenced Deezer id');
  assert(previewRefForTrack({ id: 'sqlite:5', itunes_id: '88' }) === 'itunes:88', 'Catalog track falls back to its iTunes id');
  assert(previewRefForTrack({ id: 'sqlite:5' }) === 'catalog:5', 'Catalog track without provider ids uses catalog ref');
  assert(previewRefForTrack({ id: 'deezer:9', provider: 'deezer', providerTrackId: '9' }) === 'deezer:9', 'Live Deezer track keeps provider ref');
  assert(previewRefForTrack({ id: 'x', provider: 'spotify', providerTrackId: '1' }) === null, 'Unsupported provider yields no ref');

  // 3. Resolver ignores expired URLs and re-mints via Deezer
  clearPreviewCacheForTesting();
  const freshUrl = signed(nowSec + 900);
  const fetchedUrls = [];
  setPreviewFetchForTesting(async (url) => {
    fetchedUrls.push(url);
    if (url.endsWith('/track/555') || url.endsWith('/track/777')) return mockJsonResponse({ id: 555, preview: freshUrl, title: 'Song', artist: { name: 'Band' } });
    if (url.endsWith('/track/556')) return mockJsonResponse({ id: 556, preview: '', title: 'Rare Song', artist: { name: 'Rare Band' } });
    if (url.endsWith('/track/999')) return mockJsonResponse({ error: { type: 'DataException', message: 'no data' } });
    if (url.includes('api.deezer.com/search')) return mockJsonResponse({ data: [{ id: 1557, preview: freshUrl, title: 'Rare Song (Live)', artist: { name: 'Other Band' } }, { id: 1556, preview: freshUrl, title: 'Rare Song', artist: { name: 'Rare Band' } }] });
    return mockJsonResponse({ results: [] });
  });

  const reminted = await resolveTrackPreview({ id: 'x-1', title: 'Song', artist: 'Band', deezer_id: '555', sample_url: signed(nowSec - 3600) });
  assert(reminted?.url === freshUrl && reminted.source === 'deezer_fast_path', 'Expired stored sample is re-minted through the Deezer track API');

  clearPreviewCacheForTesting();
  fetchedUrls.length = 0;
  assert(await resolvePreviewRef('deezer:555') === freshUrl, 'resolvePreviewRef returns a fresh Deezer URL');
  assert(await resolvePreviewRef('deezer:555') === freshUrl && fetchedUrls.length === 1, 'resolvePreviewRef caches until the signed URL nears expiry');
  assert(await resolvePreviewRef('deezer:556') === freshUrl, 'Deezer track without preview falls back to search');
  assert(await resolvePreviewRef('deezer:999') === null, 'Unknown Deezer track resolves to null');
  const fakeCatalog = { getPreviewLookup: (id) => (id === 7 ? { id: 7, title: 'Song', artist: 'Band', isrc: null, deezer_id: '777' } : null) };
  assert(await resolvePreviewRef('catalog:7', { catalog: fakeCatalog }) === freshUrl, 'Catalog ref resolves through its Deezer id');
  assert(await resolvePreviewRef('catalog:8', { catalog: fakeCatalog }) === null, 'Missing catalog row resolves to null');

  // 4. Proxy trust helpers
  assert(parseTrustProxy(undefined) === false && parseTrustProxy('false') === false, 'TRUST_PROXY unset disables proxy trust');
  assert(parseTrustProxy('1') === 1 && parseTrustProxy('true') === true && parseTrustProxy('loopback') === 'loopback', 'TRUST_PROXY parses hop counts, booleans and names');
  const upgradeReq = { socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } };
  assert(clientIpFromUpgrade(upgradeReq, false) === '10.0.0.5', 'WS client IP ignores X-Forwarded-For without trusted proxy');
  assert(clientIpFromUpgrade(upgradeReq, 1) === '203.0.113.9', 'WS client IP takes the entry appended by one trusted hop');

  // 5. HTTP hardening on an ephemeral server
  const testServer = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = testServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients = [];

  try {
    const badRef = await fetch(`${baseUrl}/api/preview/not-a-ref`);
    assert(badRef.status === 400, 'GET /api/preview rejects malformed refs with 400');

    const redirect = await fetch(`${baseUrl}/api/preview/deezer:555`, { redirect: 'manual' });
    assert(redirect.status === 302 && redirect.headers.get('location') === freshUrl, 'GET /api/preview redirects to a fresh signed URL');

    const missing = await fetch(`${baseUrl}/api/preview/deezer:999`, { redirect: 'manual' });
    assert(missing.status === 404, 'GET /api/preview returns 404 when no preview exists');

    const health = await fetch(`${baseUrl}/api/health`);
    assert(health.headers.get('x-content-type-options') === 'nosniff' && !health.headers.get('x-powered-by'), 'Security headers set and X-Powered-By removed');

    const corsBlocked = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } });
    const corsBody = await corsBlocked.json().catch(() => null);
    assert(corsBlocked.status === 403 && corsBody?.error, 'Disallowed CORS origin gets a 403 JSON error instead of a 500');

    const readOnlyUser = `probe-${Date.now()}`;
    const progressRead = await fetch(`${baseUrl}/api/progress`, { headers: { 'X-User-Id': readOnlyUser } });
    assert(progressRead.status === 200 && db.findUser(readOnlyUser) === null, 'Read-only requests do not create users in the store');

    const blUser = `bl-${Date.now()}`;
    const blHeaders = { 'Content-Type': 'application/json', 'X-User-Id': blUser };
    const added = await (await fetch(`${baseUrl}/api/blacklist`, { method: 'POST', headers: blHeaders, body: JSON.stringify({ name: 'Nickelback', type: 'artist' }) })).json();
    const itemId = added.blacklist?.[0]?.id;
    const byName = await (await fetch(`${baseUrl}/api/blacklist/nickelback`, { method: 'DELETE', headers: blHeaders })).json();
    assert(byName.blacklist?.length === 1, 'Blacklist DELETE does not remove items by matching name');
    const byId = await (await fetch(`${baseUrl}/api/blacklist/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: blHeaders })).json();
    assert(byId.blacklist?.length === 0, 'Blacklist DELETE removes the item by id');

    // 6. Multiplayer authorization
    const mockTracks = ['ALPHA', 'PHASE', 'SHAPE', 'HEART', 'EARTH', 'TEARS', 'STARE', 'RATES'].map((title, index) => ({
      id: `deezer:${index}`,
      provider: 'deezer',
      providerTrackId: String(index),
      providerArtistId: String(index),
      title,
      artist: `Artist ${index}`,
      album: 'Mock Album',
      albumArt: '',
      audioUrl: `https://cdn.example.test/${index}.mp3`,
      selection: { source: 'deezer', rank: 500000, artistFans: 900000 },
    }));
    setMusicProviderForTesting({ name: 'deezer', getCandidateTracks: async () => mockTracks });
    const hostId = `host-${Date.now()}`;
    const liveRes = await fetch(`${baseUrl}/api/puzzles/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': hostId },
      body: JSON.stringify({ genre: 'all', targetWords: 6 }),
    });
    const live = await liveRes.json();
    setMusicProviderForTesting();

    const host = wsTestClient(wsUrl);
    clients.push(host);
    await host.open;
    host.send({ action: 'create_room', playerId: hostId, playerName: 'Host', mode: 'coop', livePuzzleToken: live.livePuzzleToken });
    const created = await host.next(m => m.type === 'room_created');
    const roomCode = created.room.code;
    assert(/^[A-Z]+-\d{4}$/.test(roomCode) && /^[a-f0-9]{32}$/.test(created.resumeToken), 'Room uses a 4-digit code and issues a resume token');

    const intruder = wsTestClient(wsUrl);
    clients.push(intruder);
    await intruder.open;
    intruder.send({ action: 'coop_cell_update', roomCode, row: 0, col: 0, char: 'X', playerId: hostId });
    const intruderErr = await intruder.next(m => m.type === 'error');
    assert(/not a member/i.test(intruderErr.message), 'Non-members cannot write cells into a room');

    const guest = wsTestClient(wsUrl);
    clients.push(guest);
    await guest.open;
    guest.send({ action: 'join_room', roomCode, playerId: `${hostId}-guest`, playerName: 'Guest' });
    await guest.next(m => m.type === 'room_joined');
    guest.send({ action: 'start_game', roomCode, playerId: hostId });
    const spoofErr = await guest.next(m => m.type === 'error');
    assert(/only the host/i.test(spoofErr.message), 'Guest cannot start the game by spoofing the host playerId');

    const hijacker = wsTestClient(wsUrl);
    clients.push(hijacker);
    await hijacker.open;
    hijacker.send({ action: 'join_room', roomCode, playerId: hostId, playerName: 'Mallory' });
    const hijackErr = await hijacker.next(m => m.type === 'error');
    assert(/already in this room/i.test(hijackErr.message), 'Joining with another player id without its resume token is rejected');

    const resumed = wsTestClient(wsUrl);
    clients.push(resumed);
    await resumed.open;
    resumed.send({ action: 'join_room', roomCode, playerId: hostId, playerName: 'Host', resumeToken: created.resumeToken });
    const resumedJoin = await resumed.next(m => m.type === 'room_joined');
    assert(resumedJoin.resumed === true && resumedJoin.room.players.length === 2, 'Host resumes its seat with the resume token');

    await new Promise(resolve => setTimeout(resolve, 100));
    resumed.send({ action: 'start_game', roomCode });
    const started = await guest.next(m => m.type === 'game_started');
    assert(started.room.hostId === hostId && started.room.players.length === 2, 'Replaced socket closing does not evict the resumed host');

    resumed.send({ action: 'coop_cell_update', roomCode, row: 0, col: 1, char: 'Q', playerId: 'someone-else', playerColor: '#000000' });
    const cell = await guest.next(m => m.type === 'coop_cell_update');
    assert(cell.playerId === hostId && cell.playerColor === '#1db954', 'Cell updates carry the server-bound identity and color');
  } catch (err) {
    assert(false, `Phase 1 hardening flow failed: ${err.message}`);
  } finally {
    for (const client of clients) client.close();
    setPreviewFetchForTesting();
    clearPreviewCacheForTesting();
    setMusicProviderForTesting();
    db.flushSync();
    await new Promise(resolve => testServer.close(resolve));
  }
}

function routedFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) {
        const out = typeof handler === 'function' ? handler(url) : handler;
        if (out && out.__status) return { ok: out.__status < 400, status: out.__status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => out };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

async function runPhase3CrawlerTests() {
  console.log('\n--- 6c. Testing Language Classifier, Authenticity Rules, Harvester & Enrichment ---');

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
}

async function runPhase4CleanupTests() {
  console.log('\n--- 9b. Testing Catalog Cleanup, Validation Gate & Album Enrichment ---');

  // 1. Classifier guards against deleting English songs
  const lang = (title, artist, artistLanguage = null) => resolveTrackLanguage({ title, artist, artistLanguage });
  assert(lang("Sweet Child O' Mine", "Guns N' Roses", 'en') === 'en' && lang('Moth To A Flame', 'The Weeknd', 'en') === 'en', 'Short English titles that edge out English in ELD stay English');
  assert(lang('Cutie Pie', 'One Way') === 'en' && lang('Teenage Dirtbag', 'Wheatus') === 'en', 'Two-word titles only turn foreign for major languages with a clear margin');
  assert(lang('Mi Gente', 'J Balvin') === 'es' && lang('Te Quería Ver', 'Alemán') === 'es', 'Clear Spanish titles are still detected without an artist vote');
  assert(lang("Pour que tu m'aimes encore", 'Céline Dion', 'en') === 'fr', 'A long, clearly French title overrules an English artist vote');
  assert(scriptLanguage('KoЯn') === null && scriptLanguage('DISCIPLΞS') === null && scriptLanguage('Кино') === 'ru', 'A stylized letter does not make a name Russian or Greek');
  assert(lang('Freak On a Leash', 'KoЯn') === 'en' && lang('P.I.M.P.', '50 Cent', 'en') === 'en', 'Stylized names and dotted acronyms stay English');
  assert(classifyArtistLanguage({ titles: ['Brown Sugar', 'The Door', 'Playa Playa'] }).language === 'en', 'A few short English titles do not vote an artist foreign');
  assert(classifyArtistLanguage({ titles: ['Por Esos Ojos', 'La Sala de Espera', 'Mi Corazón Contigo'] }).language === 'es', 'A Spanish catalog still votes es');

  // 1b. Selection policy and sampling (Phase 5)
  assert(isLanguagePermitted({ title: 'Viva La Vida', artist: 'Coldplay', language: 'en' }, 'pop') === true, 'Catalog language is trusted over stopword heuristics ("Viva La Vida")');
  assert(isLanguagePermitted({ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'pop') === false && isLanguagePermitted({ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'all', 'japanese city pop') === true, 'Japanese catalog tracks only appear in Japanese themes');
  assert(allowedLanguagesForContext('kpop').join() === 'ko,en' && allowedLanguagesForContext('all', 'anime openings').join() === 'ja,en' && allowedLanguagesForContext('rock').join() === 'en', 'Theme languages map to the en/ja/ko catalog');
  const unmutated = { title: 'Dreams (2004 Remaster)', releaseDate: '2018-01-01' };
  assert(isTemporalPermitted(unmutated, { start: 2000, end: 2009 }) === true && unmutated.releaseYear === undefined && resolveReleaseYear(unmutated) === 2004, 'isTemporalPermitted is pure; the vintage year comes from resolveReleaseYear');
  assert(isTemporalPermitted({ title: 'No Year' }, null) === true && isTemporalPermitted({ title: 'No Year' }, { start: 1980, end: 1989 }) === false, 'Unknown years pass without a year window and fail with one');
  const rngA = createRng('seed-1');
  const rngB = createRng('seed-1');
  assert([1, 2, 3].every(() => rngA() === rngB()) && createRng('seed-2')() !== createRng('seed-1')(), 'Seeded RNG is reproducible and seed-dependent');
  const weightRng = createRng('weights');
  let heavyFirst = 0;
  for (let i = 0; i < 400; i++) {
    if (weightedOrder([{ id: 'light', w: 1 }, { id: 'heavy', w: 9 }], item => item.w, weightRng)[0].id === 'heavy') heavyFirst++;
  }
  assert(heavyFirst > 320 && heavyFirst < 400, 'Weighted order puts a 9x heavier item first about 90% of the time');

  const sampleCat = new SqliteCatalog(':memory:');
  for (let i = 0; i < 30; i++) {
    sampleCat.upsertTrack({ title: `Sample Song ${i}`, artist: `Sample Artist ${i % 10}`, durationMs: 200000, provider: 'deezer', providerTrackId: String(500 + i), deezerRank: 100000 + i * 20000, releaseYear: 1980 + (i % 20), sampleUrl: `https://cdn.test/${i}.mp3` });
    sampleCat.insertSample(i + 1, { provider: 'itunes', providerTrackId: `it${i}`, sampleUrl: `https://it.test/${i}.m4a` });
  }
  const windowRows = sampleCat.sampleCatalogTracks({ languages: ['en'], poolSize: 50, start: 0.5 });
  assert(windowRows.length === 30 && new Set(windowRows.map(r => r.id)).size === 30, 'Catalog window wraps around and returns one row per track (no duplicate per sample)');
  assert(windowRows.every(r => r.sample_url.startsWith('https://cdn.test/')), 'The Deezer sample is preferred when a track has several');
  const windowAgain = sampleCat.sampleCatalogTracks({ languages: ['en'], poolSize: 10, start: 0.25 });
  assert(windowAgain.map(r => r.id).join() === sampleCat.sampleCatalogTracks({ languages: ['en'], poolSize: 10, start: 0.25 }).map(r => r.id).join(), 'The same window start returns the same rows');
  const eighties = sampleCat.sampleCatalogTracks({ yearRange: { start: 1980, end: 1989 }, poolSize: 50 });
  assert(eighties.length === 20 && eighties.every(r => r.release_year >= 1980 && r.release_year <= 1989), 'Year windows filter in SQL');
  assert(sampleCat.sampleCatalogTracks({ artist: 'Sample Artist 3', poolSize: 50 }).length === 3 && sampleCat.sampleCatalogTracks({ ftsQuery: '"Song 1"', poolSize: 50 }).length >= 1, 'Artist and text filters narrow the window');
  sampleCat.close();

  // 1c. SQLite user store with a one-time import of the old JSON store
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotyspice-users-'));
  const legacyPath = path.join(storeDir, 'store.json');
  fs.writeFileSync(`${legacyPath}.bak`, JSON.stringify({ users: {
    alice: {
      userId: 'alice', createdAt: 1000, lastActive: 2000,
      activeProgress: { puzzleId: 'p2', userLetters: [['A']] },
      solvedHistory: [{ puzzleId: 'p1', solvedAt: 1500 }, { puzzleId: 'p1', solvedAt: 1600 }],
      blacklist: [
        { id: 'b1', name: 'Daft Punk', type: 'artist', dateAdded: 1100 },
        { id: 'b2', name: 'daft  punk', type: 'artist', dateAdded: 1200 },
        { id: 'b3', name: 'Same Title', type: 'song', provider: 'deezer', providerTrackId: '101', dateAdded: 1300 },
        { id: 'bad', name: 'Nope', type: 'album' },
      ],
    },
  } }));
  fs.writeFileSync(legacyPath, '{ broken json');
  const users = new UserStore(path.join(storeDir, 'users.sqlite'), { legacyStorePath: legacyPath });
  assert(users.findUser('alice')?.createdAt === 1000 && users.getProgress('alice')?.puzzleId === 'p2', 'Legacy store is imported from the .bak copy when store.json is corrupt');
  assert(users.getSolvedHistory('alice').length === 1 && users.getBlacklist('alice').map(b => b.id).join() === 'b1,b3', 'Import drops duplicate history, duplicate blacklist names and invalid types');
  assert(users.importLegacyStore(legacyPath).imported === false, 'The import runs only once');
  users.recordSolvedPuzzle('alice', { puzzleId: 'p2', title: 'Two' });
  assert(users.getProgress('alice') === null && users.getSolvedHistory('alice').map(h => h.puzzleId).join() === 'p1,p2', 'Solving a puzzle clears its progress and appends to history in order');
  users.addBlacklistItem('alice', { name: 'Same Title', type: 'song' });
  users.addBlacklistItem('alice', { name: 'DAFT PUNK', type: 'artist' });
  assert(users.getBlacklist('alice').length === 3 && users.removeBlacklistItem('alice', 'b1').length === 2, 'Generic and provider-scoped entries coexist; duplicates are ignored; removal by id');
  assert(users.findUser('nobody') === null && users.getBlacklist('nobody').length === 0 && users.findUser('nobody') === null, 'Reads never create users');
  users.close();
  const reopened = new UserStore(path.join(storeDir, 'users.sqlite'), { legacyStorePath: legacyPath });
  assert(reopened.getSolvedHistory('alice').length === 2 && reopened.getBlacklist('alice').length === 2, 'User state persists across restarts without re-importing');
  reopened.close();
  fs.rmSync(storeDir, { recursive: true, force: true });

  // 2. Text and version normalization
  assert(cleanDisplayText('I&#039;m Not The Only One') === "I'm Not The Only One" && cleanDisplayText('Rock &amp;amp; Roll') === 'Rock & Roll', 'HTML entities are decoded, including double encoding');
  const zwsp = String.fromCharCode(0x200b);
  assert(cleanDisplayText(`  Equator - ${zwsp} Eastern  `) === 'Equator - Eastern' && cleanDisplayText(cleanDisplayText('A &amp; B')) === 'A & B', 'Invisible characters and whitespace are cleaned idempotently');
  assert(['Mayonaka no Door (Single ver.)', 'Nuit de folie (Version originale 1988)', 'So Far Away (Full Version)'].every(t => classifyVersion(t) === 'original'), 'Tags naming the original release are original');
  assert(classifyVersion('Sparkle - movie ver.') === 'alternate' && classifyVersion('Dreams (2004 Remaster)') === 'remaster', 'Movie versions stay alternate; remasters are accepted');

  // 3. Cleanup on a legacy catalog (rows inserted directly: upsertTrack would refuse them)
  const cat = new SqliteCatalog(':memory:');
  const db = cat.db;
  const artistId = (name) => {
    const key = canonicalArtistKey(name) || name;
    db.prepare('INSERT OR IGNORE INTO artists (canonical_name, display_name) VALUES (?, ?)').run(key, name);
    return db.prepare('SELECT id FROM artists WHERE canonical_name = ?').get(key).id;
  };
  const legacy = ({ title, artist, album = 'Album', language = 'en', durationMs = 200000, isrc = null, popularity = 50, year = null, deezerId = null, sampleId = deezerId, provider = true }) => {
    const id = Number(db.prepare(`
      INSERT INTO tracks (isrc, canonical_title, display_title, artist_id, album_name, duration_ms, release_year, language, popularity, version_type, rand_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.5)
    `).run(isrc, baseTitleKey(title), title, artistId(artist), album, durationMs, year, language, popularity, classifyVersion(title, album)).lastInsertRowid);
    if (provider && deezerId) db.prepare("INSERT INTO track_providers (track_id, provider, provider_track_id) VALUES (?, 'deezer', ?)").run(id, String(deezerId));
    if (sampleId) db.prepare("INSERT INTO track_samples (track_id, provider, provider_track_id, sample_url) VALUES (?, 'deezer', ?, ?)").run(id, String(sampleId), `https://cdn.test/${sampleId}.mp3`);
    return id;
  };

  const levitating = legacy({ title: 'Levitating', artist: 'Dua Lipa', isrc: 'GBAHT2000942', year: 2020, popularity: 80, deezerId: 1 });
  legacy({ title: 'Levitating (Live at the BRITs)', artist: 'Dua Lipa', popularity: 90, deezerId: 2 });
  legacy({ title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia (Deluxe)', year: 2019, popularity: 60, deezerId: 3 });
  const gaga = legacy({ title: 'Die With A Smile', artist: 'Lady Gaga', popularity: 95, deezerId: 10 });
  legacy({ title: 'Die With A Smile', artist: 'Bruno Mars', popularity: 95, sampleId: 10, provider: false });
  for (const [i, title] of ['Por Esos Ojos', 'La Sala de Espera', 'Mi Corazón Contigo'].entries()) {
    legacy({ title, artist: 'Grupo Norteño', language: 'en', deezerId: 20 + i });
  }
  legacy({ title: 'I&#039;m Not The Only One', artist: 'Sam Smith', deezerId: 30, popularity: 70 });
  legacy({ title: "I'm Not The Only One", artist: 'Sam Smith', deezerId: 31, popularity: 40 });
  legacy({ title: 'The Riddle', artist: 'Gigi D&#039;Agostino', deezerId: 40 });
  legacy({ title: 'Bla Bla Bla', artist: "Gigi D'Agostino", deezerId: 41 });
  legacy({ title: 'Rain Sounds For Sleep', artist: 'Sleep Sounds', deezerId: 50 });
  legacy({ title: 'Intro', artist: 'Some Band', durationMs: 8000, deezerId: 51 });
  legacy({ title: 'Lost Song', artist: 'Some Band', deezerId: null, sampleId: null });
  const idol = legacy({ title: 'アイドル', artist: 'YOASOBI', language: 'ja', isrc: 'jpu902300400', deezerId: 60, popularity: 900000 });
  legacy({ title: '봄날', artist: 'BTS', language: 'ko', deezerId: 61 });

  const dirtyGate = evaluateCatalogGate(db, { minYearCoverage: 0, minIsrcCoverage: 0 });
  const failing = new Set(dirtyGate.checks.filter(c => !c.ok).map(c => c.id));
  assert(!dirtyGate.ok && ['duplicates', 'version', 'text', 'duration', 'unlinked', 'inauthentic'].every(id => failing.has(id)), 'Gate flags duplicates, versions, entities, durations, unlinked and inauthentic rows');

  const trackCount = () => db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;
  const before = trackCount();
  const dry = runCatalogCleanup(db);
  assert(dry.applied === false && trackCount() === before && dry.after.tracks < before, 'Dry run reports the changes and rolls them back');

  const applied = runCatalogCleanup(db, { apply: true });
  const step = (name) => applied.steps.find(s => s.name === name);
  assert(step('recordings').removed === 1 && !db.prepare("SELECT 1 FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.display_name = 'Bruno Mars'").get(), 'A collaboration stored under a second artist is folded into the provider owner');
  assert(db.prepare('SELECT COUNT(*) AS c FROM tracks WHERE id = ?').get(gaga).c === 1, 'The provider owner keeps the song');
  const policy = step('policy');
  assert(policy.reasons.version === 1 && policy.reasons.language === 3 && policy.reasons.inauthentic === 1 && policy.reasons.duration === 1 && policy.reasons.unlinked === 1, 'Policy deletes live, Spanish, utility, too-short and unlinked rows');
  const lev = db.prepare('SELECT release_year, isrc FROM tracks WHERE id = ?').get(levitating);
  const levProviders = db.prepare('SELECT COUNT(*) AS c FROM track_providers WHERE track_id = ?').get(levitating).c;
  assert(lev.release_year === 2019 && lev.isrc === 'GBAHT2000942' && levProviders === 2, 'Duplicate releases merge into one row with the earliest year and all provider links');
  assert(db.prepare("SELECT COUNT(*) AS c FROM tracks WHERE display_title = 'I''m Not The Only One'").get().c === 1, 'Entity-decoded titles merge with their clean duplicate');
  const gigi = db.prepare("SELECT COUNT(DISTINCT artist_id) AS artists, COUNT(*) AS tracks FROM tracks WHERE display_title IN ('The Riddle', 'Bla Bla Bla')").get();
  assert(gigi.artists === 1 && gigi.tracks === 2 && step('text').artistsMerged === 1, 'Artists whose names only differed by HTML entities are merged');
  const idolRow = db.prepare('SELECT language, isrc, country_code, popularity FROM tracks WHERE id = ?').get(idol);
  assert(idolRow.language === 'ja' && idolRow.isrc === 'JPU902300400' && idolRow.country_code === 'JP' && idolRow.popularity === deezerRankToScore(900000), 'Japanese rows survive with normalized ISRC, registrant and 0-100 popularity');
  assert(db.prepare("SELECT language FROM tracks WHERE display_title = '봄날'").get()?.language === 'ko', 'Korean rows survive');
  assert(db.prepare('SELECT COUNT(*) AS c FROM artists WHERE id NOT IN (SELECT artist_id FROM tracks)').get().c === 0, 'Artists left without tracks are deleted');

  const again = runCatalogCleanup(db, { apply: true });
  const changed = again.steps
    .filter(s => s.name !== 'fts' && s.name !== 'languages')
    .flatMap(s => Object.entries(s).filter(([k, v]) => typeof v === 'number' && !['ms', 'rounds'].includes(k) && v !== 0));
  assert(changed.length === 0 && again.after.tracks === again.before.tracks, 'A second cleanup run changes nothing (idempotent)');

  const gate = evaluateCatalogGate(db, { minYearCoverage: 0, minIsrcCoverage: 0 });
  assert(gate.ok, 'Cleaned catalog passes every gate check');
  const strictGate = evaluateCatalogGate(db);
  assert(!strictGate.ok && strictGate.checks.find(c => c.id === 'year_coverage').ok === false, 'Default thresholds still require 95% release-year coverage');
  const ftsHit = db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH '"Levitating"'`).all().map(r => r.rowid);
  assert(ftsHit.length === 1 && ftsHit[0] === levitating, 'FTS index is rebuilt to match the cleaned rows');
  const fresh = cat.upsertTrack({ title: 'Houdini', artist: 'Dua Lipa', durationMs: 185000, provider: 'deezer', providerTrackId: '70', deezerRank: 500000 });
  assert(db.prepare(`SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH '"Houdini"'`).get()?.rowid === fresh.trackId, 'FTS triggers are restored after cleanup');

  // 4. Album enrichment dates every catalog track on the album
  const albumCat = new SqliteCatalog(':memory:');
  const seed = (title, deezerId, albumId) => albumCat.upsertTrack({ title, artist: 'Album Artist', durationMs: 200000, album: 'X', provider: 'deezer', providerTrackId: String(deezerId), deezerRank: 1000, rawMetadata: albumId ? { albumId } : null }).trackId;
  const a1 = seed('First Song', 31, 700);
  const a2 = seed('Second Song', 32, 700);
  const a3 = seed('Third Song', 33, null);
  const gone = seed('Gone Song', 34, 701);
  const albumFetch = routedFetch([
    [/api\.deezer\.com\/album\/700$/, { id: 700, release_date: '2011-05-02', tracks: { data: [{ id: 31 }, { id: 32 }, { id: 33 }] } }],
    [/api\.deezer\.com\/album\/701$/, { error: { type: 'DataException', code: 800 } }],
  ]);
  const albumEnricher = new CatalogEnricher(albumCat, { fetchImpl: albumFetch });
  const albumStats = await albumEnricher.enrichAlbums({ limit: 10 });
  const year = (id) => albumCat.db.prepare('SELECT release_year, release_date, album_checked_at FROM tracks WHERE id = ?').get(id);
  assert(albumStats.checked === 2 && albumStats.yearFilled === 3 && [a1, a2, a3].every(id => year(id).release_year === 2011 && year(id).release_date === '2011-05-02'), 'One album request dates every catalog track on the album');
  assert(year(gone).release_year === null && year(gone).album_checked_at !== null && albumStats.missing === 1, 'Unknown albums are stamped and not retried');
  assert((await albumEnricher.enrichAlbums({ limit: 10 })).checked === 0, 'A second album run has nothing left to do');

  // 5. CLI: --ci exit codes and --fix with a backup
  const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotyspice-cli-'));
  const cliPath = path.join(cliDir, 'catalog.sqlite');
  const cliCat = new SqliteCatalog(cliPath);
  cliCat.upsertTrack({ title: 'Levitating', artist: 'Dua Lipa', durationMs: 203000, provider: 'deezer', providerTrackId: '1', isrc: 'GBAHT2000942', releaseYear: 2020, deezerRank: 900000 });
  cliCat.db.prepare("INSERT INTO tracks (canonical_title, display_title, artist_id, album_name, duration_ms, language, popularity, version_type) VALUES ('levitating', 'Levitating (Live)', 1, 'A', 200000, 'en', 10, 'live')").run();
  cliCat.close();
  const cli = (...cliArgs) => spawnSync(process.execPath, ['scripts/validate_and_sanitize_db.js', `--db=${cliPath}`, '--no-report', ...cliArgs], { encoding: 'utf8' });
  const ciDirty = cli('--ci', '--min-year-coverage=0', '--min-isrc-coverage=0');
  assert(ciDirty.status === 1 && /Validation gate: FAIL/.test(ciDirty.stdout), '--ci exits 1 on a catalog that fails the gate');
  const fixed = cli('--fix', '--no-vacuum');
  const backups = fs.readdirSync(cliDir).filter(f => f.startsWith('catalog.backup-cleanup-'));
  assert(fixed.status === 0 && backups.length === 1, '--fix writes a VACUUM INTO backup before changing anything');
  const ciClean = cli('--ci', '--min-year-coverage=0', '--min-isrc-coverage=0');
  assert(ciClean.status === 0 && /Validation gate: PASS/.test(ciClean.stdout), '--ci exits 0 once the catalog is clean');
  fs.rmSync(cliDir, { recursive: true, force: true });

  cat.close();
  albumCat.close();
}

async function main() {
  console.log('🚀 Starting SpotySpice CI-Friendly Automated Test Suite...');
  const startTime = Date.now();

  try {
    await runUnitTests();
    await runIntegrationTests();
    await runPhase1HardeningTests();
    await runSqliteCatalogTests();
    await runPhase3CrawlerTests();
    await runMusicMoveArrAndLazyResolverTests();
    await runCrosswordJudgeAndCulturalGuardsTests();
    await runCatalogValidatorTests();
    await runPhase4CleanupTests();
    await runAnimeCatalogAndIsolationTests();
    await runClueSystemAndZeroLeakTests();
    await runAnimeArtAndKeyphraseClueDisciplineTests();
  } catch (err) {
    console.error('Fatal test execution error:', err);
    failedCount++;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n========================================');
  console.log(`Summary: ${passedCount} passed, ${failedCount} failed (${duration}s)`);
  console.log('========================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

main();
