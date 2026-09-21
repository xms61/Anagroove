import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { parsePrompt, toFtsQuery } from './queryBuilder.js';
import { extractAnswerKeyword } from '../../shared/musicKeywords.js';
import { canonicalArtistKey, canonicalTrackKey, toCrosswordAnswer } from '../../shared/musicIdentity.js';
import { generateLiveCrossword } from '../../shared/liveCrossword.js';
import {
  isLanguagePermitted,
  isAuthenticTrack,
  isTemporalPermitted,
  isAnimeTrack,
  isJapaneseTrack,
} from './musicService.js';
import { shuffleArray } from '../../shared/shuffle.js';

const PREFERRED_ROTATION = ['title', 'artist', 'keyword', 'title', 'artist', 'keyword'];
const LENGTH_ROTATION = ['short', 'medium', 'short', 'long', 'medium', 'short', 'medium', 'long'];

/**
 * Turns raw SQLite track records into crossword-ready song items with clean answers & clues.
 * Ensures a healthy variety of answer lengths (including 3-5 letter words).
 */
export function prepareCandidateSongs(tracks = [], options = {}) {
  const isSingleArtist = Boolean(options.artist);
  const targetWords = options.targetWords || 10;
  const maxAnswerLength = options.maxAnswerLength || 16;
  const minAnswerLength = options.minAnswerLength || 2;
  const fixedTargetLengthBucket = options.targetLengthBucket || null;
  const seenAnswers = new Set();
  const seenTracks = new Set();
  const artistTrackCounts = new Map();
  const seenArtistClues = new Set();
  const songs = [];
  let clueIndex = 0;

  const distinctArtists = new Set(tracks.map(t => canonicalArtistKey(t.artist))).size;
  const maxPerArtist = isSingleArtist ? 999 : (distinctArtists < targetWords ? 3 : 1);

  for (const track of tracks) {
    const trackKey = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
    if (seenTracks.has(trackKey)) continue;

    const artistKey = canonicalArtistKey(track.artist);
    const count = artistTrackCounts.get(artistKey) || 0;
    if (!isSingleArtist && count >= maxPerArtist) {
      continue;
    }

    if (isSingleArtist) {
      const targetNorm = options.artist.toLowerCase().replace(/[^a-z0-9]/g, '');
      const songArtistNorm = (track.artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isArtistMatch = songArtistNorm === targetNorm ||
        songArtistNorm.startsWith(`${targetNorm}feat`) ||
        songArtistNorm.startsWith(`${targetNorm}with`) ||
        songArtistNorm.startsWith(`${targetNorm}and`) ||
        songArtistNorm.startsWith(`${targetNorm}&`);
      if (!isArtistMatch) {
        continue;
      }
    }

    let preferred = isSingleArtist
      ? (clueIndex % 2 === 0 ? 'title' : 'keyword')
      : PREFERRED_ROTATION[clueIndex % PREFERRED_ROTATION.length];

    const allowArtistForThisTrack = !isSingleArtist && !seenArtistClues.has(artistKey);
    if (preferred === 'artist' && !allowArtistForThisTrack) {
      preferred = clueIndex % 2 === 0 ? 'title' : 'keyword';
    }

    // Rotate target length bucket to guarantee balanced distribution of short (3-5), medium (6-8), and long (9-14) words
    const effectiveBucket = fixedTargetLengthBucket || LENGTH_ROTATION[clueIndex % LENGTH_ROTATION.length];

    let answerCandidate = extractAnswerKeyword(track.title, track.artist, {
      preferredType: preferred,
      allowArtist: allowArtistForThisTrack,
      targetLengthBucket: effectiveBucket,
    });
    if (!answerCandidate || !answerCandidate.answer) continue;

    let cleanAnswer = toCrosswordAnswer(answerCandidate.answer);
    if (!cleanAnswer) continue;

    if (cleanAnswer.length > maxAnswerLength || cleanAnswer.length < minAnswerLength) {
      const shortKw = extractAnswerKeyword(track.title, track.artist, {
        preferredType: 'keyword',
        targetLengthBucket: 'short',
        allowArtist: false,
      });
      if (shortKw && shortKw.answer) {
        const altAnswer = toCrosswordAnswer(shortKw.answer);
        if (altAnswer && altAnswer.length >= minAnswerLength && altAnswer.length <= maxAnswerLength) {
          cleanAnswer = altAnswer;
          answerCandidate = shortKw;
        } else {
          continue;
        }
      } else {
        continue;
      }
    }

    // Single-artist strict enforcement: never allow artist name clues
    if (isSingleArtist && (answerCandidate.clueType === 'Artist name' || cleanAnswer === toCrosswordAnswer(track.artist))) {
      continue;
    }

    if (seenAnswers.has(cleanAnswer)) continue;

    seenTracks.add(trackKey);
    artistTrackCounts.set(artistKey, count + 1);
    if (answerCandidate.clueType === 'Artist name') {
      seenArtistClues.add(artistKey);
    }
    seenAnswers.add(cleanAnswer);
    clueIndex++;

    songs.push({
      id: track.id ? (String(track.id).startsWith('sqlite:') ? track.id : `sqlite:${track.id}`) : `cand-${clueIndex}`,
      provider: track.provider || 'deezer',
      providerTrackId: String(track.provider_track_id || track.deezer_id || track.id || clueIndex),
      providerArtistId: String(track.artist_id || ''),
      title: track.title,
      artist: track.artist,
      album: track.album || 'Single',
      albumArt: track.album_art || track.albumArt || '',
      audioUrl: track.sample_url || track.audioUrl || '',
      providerUrl: '',
      selection: {
        source: 'queryFactory',
        rank: track.popularity || 50,
        artistFans: 100000,
      },
      answer: cleanAnswer,
      clueType: answerCandidate.clueType,
      clueText: answerCandidate.clueText,
      language: track.language,
      popularity: track.popularity,
      release_year: track.release_year,
    });
  }

  return songs;
}

/**
 * Maps natural language prompts and genres into verified SQLite genre clusters.
 */
export function mapPromptToGenres(genre = '', prompt = '') {
  const g = `${genre} ${prompt}`.toLowerCase();
  const matched = new Set();
  if (g.includes('grunge')) matched.add('Grunge');
  if (g.includes('classic rock')) matched.add('Classic Rock');
  if (g.includes('punk')) matched.add('Punk');
  if (g.includes('rock') && !g.includes('classic rock')) matched.add('Rock');
  if (g.includes('synthpop') || g.includes('synth pop')) {
    matched.add('Electronic');
    matched.add('Pop');
  }
  if (g.includes('city pop') || g.includes('citypop')) matched.add('City Pop');
  if (g.includes('french house') || g.includes('french touch')) matched.add('French House');
  if (g.includes('motown')) matched.add('Motown');
  if (g.includes('soul') && !g.includes('motown')) matched.add('Soul');
  if (g.includes('funk')) matched.add('Funk');
  if (g.includes('disco')) matched.add('Disco');
  if (g.includes('hip hop') || g.includes('hiphop') || g.includes('rap')) matched.add('Hip Hop');
  if (g.includes('r&b') || g.includes('rnb')) matched.add('R&B');
  if (g.includes('edm') || g.includes('dance') || g.includes('electronic')) matched.add('Electronic');
  if (g.includes('k-pop') || g.includes('kpop')) matched.add('K-Pop');
  if (g.includes('reggae') || g.includes('ska')) matched.add('Reggae');
  if (g.includes('bossa nova')) matched.add('Bossa Nova');
  if (g.includes('latin')) matched.add('Latin');
  if (g.includes('pop') && !g.includes('city pop') && !g.includes('k-pop')) matched.add('Pop');
  if (g.includes('anime')) matched.add('Anime');
  if (g.includes('japanese') && !g.includes('anime')) matched.add('Japanese');
  return Array.from(matched);
}

/**
 * Builds and executes a targeted crossword query against the SQLite catalog,
 * then generates a high-performance crossword puzzle tuned to the requested archetype.
 */
export async function buildCrosswordFromCatalog({
  prompt = '',
  archetype = 'standard', // 'dense' | 'small' | 'themed' | 'custom'
  catalog = sqliteCatalog,
  targetWords,
  title,
  trials,
} = {}) {
  const startTime = Date.now();
  const parsed = parsePrompt(prompt);
  const lowerPrompt = prompt.toLowerCase();

  // Cultural and linguistic detection
  const queryGenres = parsed.artist ? [] : mapPromptToGenres(parsed.genre, prompt);
  const isAnime = queryGenres.includes('Anime') || /\banime\b/i.test(lowerPrompt);
  const isJapanese = !isAnime && (queryGenres.includes('City Pop') || queryGenres.includes('Japanese') || /\b(japanese|city\s*pop|j-pop|j-rock)\b/i.test(lowerPrompt));
  const isKpop = queryGenres.includes('K-Pop') || /\b(k-?pop|korean)\b/i.test(lowerPrompt);
  const isLatin = queryGenres.includes('Latin') || queryGenres.includes('Bossa Nova') || /\b(latin|reggaeton|bossa\s*nova)\b/i.test(lowerPrompt);
  const isFrench = queryGenres.includes('French House') || /\bfrench\b/i.test(lowerPrompt);
  const isEnglishStrict = !isAnime && !isJapanese && !isKpop && !isLatin && !isFrench;

  // Configure constraints per archetype
  let answerLength = null;
  let layoutArchetype = 'standard';
  let defaultTargetWords = 10;
  let maxSmallBounds = 9;

  if (archetype === 'small') {
    layoutArchetype = 'small';
    answerLength = null;
    defaultTargetWords = 6;
    maxSmallBounds = 9;
  } else if (archetype === 'dense') {
    layoutArchetype = 'dense';
    answerLength = { min: 3, max: 12 };
    defaultTargetWords = 10;
  }

  const effectiveWords = targetWords || defaultTargetWords;
  const effectiveTitle = title || (prompt ? `⚡ ${prompt}` : '⚡ Live Crossword');

  let rawTracks;

  if (isAnime) {
    // 1. Anime Specialist Query: Anime genre artists + anime opening/ending/soundtrack tokens
    const animeGenreTracks = catalog.queryCatalogForCrossword({
      genres: ['Anime'],
      variety: true,
      minPopularity: 0,
      limit: 120,
    });
    const animeTokenTracks = catalog.queryCatalogForCrossword({
      text: 'Anime',
      variety: true,
      minPopularity: 0,
      limit: 80,
    });
    const animeOpeningTracks = catalog.queryCatalogForCrossword({
      text: 'Anime Opening',
      variety: true,
      minPopularity: 0,
      limit: 60,
    });
    const ostTokenTracks = catalog.queryCatalogForCrossword({
      text: 'Opening Theme',
      variety: true,
      minPopularity: 0,
      limit: 60,
    });
    rawTracks = Array.from(new Set([...(animeGenreTracks || []), ...(animeTokenTracks || []), ...(animeOpeningTracks || []), ...(ostTokenTracks || [])]));
  } else {
    // Use FTS5-powered theme search as primary query path for non-anime prompts
    const ftsQuery = toFtsQuery(prompt, { artist: parsed.artist });
    const catalogLanguage = isEnglishStrict ? 'en' : (isKpop ? ['ko', 'en'] : (isJapanese ? ['ja', 'en'] : null));

    rawTracks = catalog.searchCatalogByTheme({
      ftsQuery,
      genres: queryGenres,
      artist: parsed.artist || '',
      language: catalogLanguage,
      yearRange: parsed.yearRange || null,
      minPopularity: parsed.popularity === 'obscure' ? 0 : 25,
      allowSampleless: true,
      limit: 140,
    });
  }

  // If query returned < 15, try relaxed popularity
  if ((!rawTracks || rawTracks.length < 15) && queryGenres.length > 0) {
    const genreOnly = catalog.queryCatalogForCrossword({
      genres: queryGenres,
      language: isEnglishStrict ? 'en' : null,
      yearRange: parsed.yearRange || null,
      minPopularity: 0,
      answerLength,
      variety: true,
      limit: 140,
    });
    rawTracks = Array.from(new Set([...(rawTracks || []), ...(genreOnly || [])]));
  }

  // Heritage genre relaxation (City Pop, Motown) if remastered album years exceed temporal bounds
  const isHeritageGenre = queryGenres.includes('City Pop') || queryGenres.includes('Motown');
  if ((!rawTracks || rawTracks.length < 15) && isHeritageGenre) {
    const heritageTracks = catalog.queryCatalogForCrossword({
      genres: queryGenres,
      minPopularity: 0,
      variety: true,
      answerLength,
      limit: 140,
    });
    rawTracks = Array.from(new Set([...(rawTracks || []), ...(heritageTracks || [])]));
  }

  // If still < 15, try matching prompt tokens in artist or title
  if (!rawTracks || rawTracks.length < 15) {
    const tokens = prompt.split(/\s+/).filter(w => w.length > 3 && !/^(songs|hits|beats|crossword|music|classic|classics|anthems|essentials)$/i.test(w));
    for (const tok of tokens) {
      const tokTracks = catalog.queryCatalogForCrossword({
        text: tok,
        language: isEnglishStrict ? 'en' : null,
        yearRange: isHeritageGenre ? null : (parsed.yearRange || null),
        minPopularity: 0,
        answerLength,
        variety: true,
        limit: 80,
      });
      if (tokTracks && tokTracks.length > 0) {
        rawTracks = Array.from(new Set([...(rawTracks || []), ...tokTracks]));
      }
    }
  }

  // If still low for custom/temporal/dense/small, fallback to broader catalog query with temporal constraint
  if (!rawTracks || rawTracks.length < 15) {
    const broadCatalog = catalog.queryCatalogForCrossword({
      artist: parsed.artist || '',
      language: isEnglishStrict ? 'en' : null,
      yearRange: isHeritageGenre ? null : (parsed.yearRange || null),
      answerLength,
      minPopularity: 0,
      variety: true,
      limit: 120,
    });
    rawTracks = Array.from(new Set([...(rawTracks || []), ...(broadCatalog || [])]));
  }

  // Apply authentic, language, and cultural guardrails
  let filteredTracks = (rawTracks || []).filter(t => {
    // 1. Authenticity: reject covers, instrumentals, karaoke, audio modifications
    if (!isAuthenticTrack(t)) return false;

    // 2. Language & Cultural Separation
    if (isAnime) {
      // Anime prompt: ONLY authentic anime openings/endings/OSTs
      if (!isAnimeTrack(t)) return false;
    } else if (isJapanese) {
      // Japanese prompt: authentic Japanese artists, no western homonyms, no anime takeover for City Pop
      if (!isJapaneseTrack(t)) return false;
      if (/city\s*pop/i.test(lowerPrompt) && isAnimeTrack(t) && !/\b(city\s*pop|198\d)\b/i.test(t.album || '')) {
        return false;
      }
    } else if (isEnglishStrict) {
      // English prompt: strictly English language, no foreign leaks
      if (t.language && t.language !== 'en') return false;
      if (!isLanguagePermitted(t, parsed.genre, prompt)) return false;
    }

    if (!isHeritageGenre && parsed.yearRange && !isTemporalPermitted(t, parsed.yearRange)) return false;
    return true;
  });

  // Shuffle candidate pool to ensure popularity variety and low repetitiveness across iterations
  filteredTracks = shuffleArray([...filteredTracks]);

  // Prepare candidate song objects with length rotation (short, medium, long)
  const candidateSongs = prepareCandidateSongs(filteredTracks, {
    artist: parsed.artist,
    targetWords: effectiveWords,
    maxAnswerLength: archetype === 'small' ? 7 : 14,
    minAnswerLength: 3,
    targetLengthBucket: archetype === 'small' ? 'short' : null,
  });

  // Generate crossword layout with increased placement trials (150-300 trials)
  const defaultTrials = archetype === 'dense' ? 300 : 150;
  const puzzle = generateLiveCrossword(candidateSongs, effectiveTitle, effectiveWords, {
    archetype: layoutArchetype,
    maxSmallBounds,
    trials: trials || defaultTrials,
  });

  const durationMs = Date.now() - startTime;

  // Compute diagnostics
  const stats = {
    archetype,
    prompt,
    durationMs,
    candidatesFound: filteredTracks.length,
    eligibleSongs: candidateSongs.length,
    wordsPlaced: puzzle ? puzzle.clues.length : 0,
    targetWords: effectiveWords,
    success: Boolean(puzzle && puzzle.clues.length >= (archetype === 'small' ? 5 : 6)),
    rows: puzzle ? puzzle.rows : 0,
    cols: puzzle ? puzzle.cols : 0,
    boundingArea: puzzle ? puzzle.rows * puzzle.cols : 0,
    fillDensity: 0,
    crossingStats: { 1: 0, 2: 0, 3: 0, over3: 0 },
    clueTypes: { title: 0, artist: 0, keyword: 0 },
    hasAudioSamples: 0,
    answers: [],
  };

  if (puzzle) {
    const totalLetters = puzzle.clues.reduce((sum, c) => sum + c.length, 0);
    stats.fillDensity = parseFloat((totalLetters / stats.boundingArea).toFixed(3));
    for (const c of puzzle.clues) {
      const x = c.crossings || 0;
      if (x === 1) stats.crossingStats[1]++;
      else if (x === 2) stats.crossingStats[2]++;
      else if (x === 3) stats.crossingStats[3]++;
      else if (x > 3) stats.crossingStats.over3++;

      const type = c.clueType?.toLowerCase() || 'keyword';
      if (type.includes('keyword')) stats.clueTypes.keyword++;
      else if (type.includes('artist')) stats.clueTypes.artist++;
      else if (type.includes('title')) stats.clueTypes.title++;
      else stats.clueTypes.keyword++;

      if (c.song?.audioUrl) stats.hasAudioSamples++;
      stats.answers.push({ word: c.answer, length: c.length, clueType: c.clueType });
    }
  }

  return { puzzle, stats, parsed };
}
