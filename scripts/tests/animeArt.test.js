import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractAnswerKeyword,
  extractAllAnswerCandidates,
  formatCrosswordClue,
  containsAnswerLeak,
} from '../../shared/musicKeywords.js';
import { buildQueryPlan, extractAnimeKeyphrase } from '../../server/services/queryBuilder.js';
import { resolveAnimeCoverImages } from '../../server/services/animeImageService.js';
import { AnimeCatalog } from '../../server/db/animeCatalog.js';

test('Anime Art Resolution, Keyphrase Duplication & Clue Discipline', async () => {
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
});
