import { isAnimeTrack, isJapaneseTrack, isAuthenticTrack, isTemporalPermitted } from '../policy/selectionPolicy.js';

export function normalizePop(p) {
  const num = Number(p) || 0;
  return num > 100 ? Math.min(100, Math.round(num / 10000)) : Math.min(100, Math.round(num));
}

/**
 * Evaluates a single crossword puzzle against quality, language, thematic, authenticity, and grid rules.
 *
 * @param {Object} puzzle Generated crossword puzzle object.
 * @param {Object} context Context containing prompt, archetype, parsed options, and expectedLanguage.
 * @returns {Object} Comprehensive evaluation judgment.
 */
export function judgePuzzle(puzzle, context = {}) {
  const prompt = context.prompt || '';
  const parsed = context.parsed || {};
  const archetype = context.archetype || 'standard';
  const expectedLanguage = context.expectedLanguage || 'en';

  const clues = puzzle?.clues || [];
  const placedSongs = clues.map(c => ({
    ...(c.song || {}),
    answer: c.answer,
    clueType: c.clueType,
    clueText: c.clueText,
    crossings: c.crossings,
  }));
  const wordsPlaced = clues.length;
  const targetWords = context.targetWords || puzzle?.metadata?.targetWords || (archetype === 'small' ? 6 : 10);
  const width = puzzle?.cols || puzzle?.width || 0;
  const height = puzzle?.rows || puzzle?.height || 0;
  const boundingArea = width * height;
  const totalLetters = clues.reduce((sum, c) => sum + (c.length || c.answer?.length || 0), 0);
  const fillDensity = boundingArea > 0 ? Number((totalLetters / boundingArea).toFixed(3)) : 0;

  const crossingCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of clues) {
    const x = c.crossings || 0;
    if (x === 0) crossingCounts[0]++;
    else if (x === 1) crossingCounts[1]++;
    else if (x === 2) crossingCounts[2]++;
    else crossingCounts[3]++;
  }

  const violations = [];
  const warnings = [];

  // 1. Grid & Placement Integrity
  const placedRatio = targetWords > 0 ? (wordsPlaced / targetWords) : 0;
  if (wordsPlaced === 0) {
    violations.push('Zero words were placed on the crossword grid.');
  } else if (placedRatio < 0.6) {
    violations.push(`Poor word placement ratio: placed ${wordsPlaced}/${targetWords} (${Math.round(placedRatio * 100)}%).`);
  }

  // 2. Language Compliance
  const isKpop = /\b(k-?pop|korean)\b/i.test(prompt) || (parsed.genre && /k-?pop/i.test(parsed.genre));
  const isAnime = /\banime\b/i.test(prompt) || (parsed.genre && /anime/i.test(parsed.genre));
  const isJapaneseGenre = !isAnime && (/\b(japanese|city\s*pop|j-pop|j-rock)\b/i.test(prompt) || (parsed.genre && /city\s*pop|japanese/i.test(parsed.genre)));
  const isLatin = /\b(latin|reggaeton)\b/i.test(prompt) || (parsed.genre && /latin|reggaeton/i.test(parsed.genre));
  const isBossaNova = /\b(bossa\s*nova|samba|brazil|mpb)\b/i.test(prompt) || (parsed.genre && /bossa|samba|mpb/i.test(parsed.genre));
  const isFrench = /\b(french\s*house|french\s*touch|french|chanson)\b/i.test(prompt) || (parsed.genre && /french/i.test(parsed.genre));

  const nonEnglishViolations = [];
  const foreignCharactersInEnglish = [];

  for (const song of placedSongs) {
    const title = song.title || '';
    const artist = song.artist || '';
    const lang = song.language;

    if (isKpop) {
      if (lang && !['ko', 'en'].includes(lang)) {
        nonEnglishViolations.push(`K-Pop prompt has non-Korean/English track: ${artist} - "${title}" [${lang}]`);
      }
    } else if (isAnime) {
      // If verified as authentic anime track (e.g. +Plus - "Fiesta" [Fairy Tail OP6]), permit it
      if (!isAnimeTrack(song) && lang && !['ja', 'en'].includes(lang)) {
        nonEnglishViolations.push(`Japanese/Anime prompt has foreign track: ${artist} - "${title}" [${lang}]`);
      }
    } else if (isJapaneseGenre) {
      if (lang && !['ja', 'en'].includes(lang)) {
        nonEnglishViolations.push(`Japanese prompt has foreign track: ${artist} - "${title}" [${lang}]`);
      }
    } else if (isLatin) {
      if (lang && !['es', 'en', 'pt'].includes(lang)) {
        nonEnglishViolations.push(`Latin prompt has non-Spanish/Portuguese track: ${artist} - "${title}" [${lang}]`);
      }
    } else if (isBossaNova) {
      // Brazilian Bossa Nova / Tropicália catalogs frequently encompass Portuguese, Spanish, and English
      if (lang && !['pt', 'es', 'en'].includes(lang)) {
        nonEnglishViolations.push(`Bossa Nova prompt has non-Portuguese/Spanish/English track: ${artist} - "${title}" [${lang}]`);
      }
    } else if (isFrench) {
      if (lang && !['fr', 'en'].includes(lang)) {
        nonEnglishViolations.push(`French prompt has non-French/English track: ${artist} - "${title}" [${lang}]`);
      }
    } else if (expectedLanguage === 'en') {
      if (lang && lang !== 'en') {
        nonEnglishViolations.push(`${artist} - "${title}" [language: ${lang}]`);
      }
      // Check for CJK or Cyrillic characters in strictly English prompts
      if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff]/.test(`${title} ${artist}`)) {
        foreignCharactersInEnglish.push(`${artist} - "${title}" contains non-Latin/non-English script`);
      }
      // Check for explicit foreign dubbed versions
      if (/\b(?:version\s+fran[cç]aise|french\s+version|spanish\s+version|versi[oó]n\s+(?:en\s+espa[ñn]ol|latina|castellana|ac[uú]stica)|versi[ó]n|deutsche\s+version|versione\s+italiana)\b/i.test(title)) {
        nonEnglishViolations.push(`${artist} - "${title}" is a foreign dubbed version`);
      }
    }
  }

  if (nonEnglishViolations.length > 0) {
    violations.push(`Language compliance failure (${nonEnglishViolations.length} tracks): ${nonEnglishViolations.join('; ')}`);
  }
  if (foreignCharactersInEnglish.length > 0) {
    violations.push(`Foreign script in English crossword (${foreignCharactersInEnglish.length} tracks): ${foreignCharactersInEnglish.join('; ')}`);
  }

  // 3. Anime vs. Japanese Genre Separation
  const animeViolations = [];
  const japaneseGenreViolations = [];

  for (const song of placedSongs) {
    if (isAnime) {
      if (!isAnimeTrack(song)) {
        animeViolations.push(`${song.artist} - "${song.title}" is NOT an authentic anime theme/OST/anisong`);
      }
    } else if (isJapaneseGenre) {
      if (!isJapaneseTrack(song)) {
        japaneseGenreViolations.push(`${song.artist} - "${song.title}" is not an authentic Japanese artist`);
      }
      if (/city\s*pop/i.test(prompt) && isAnimeTrack(song) && !/\b(city\s*pop|198\d)\b/i.test(song.album || '')) {
        japaneseGenreViolations.push(`${song.artist} - "${song.title}" appears to be an anime track leaking into pure City Pop`);
      }
    }
  }

  if (animeViolations.length > 0) {
    violations.push(`Anime purity failure (${animeViolations.length} tracks): ${animeViolations.join('; ')}`);
  }
  if (japaneseGenreViolations.length > 0) {
    violations.push(`Japanese genre purity failure (${japaneseGenreViolations.length} tracks): ${japaneseGenreViolations.join('; ')}`);
  }

  // 4. Authenticity: Covers, Instrumentals, Weird Modifications
  const authenticityViolations = [];
  for (const song of placedSongs) {
    if (!isAuthenticTrack(song)) {
      authenticityViolations.push(`${song.artist} - "${song.title}" failed authenticity check`);
    }
    const t = (song.title || '').toLowerCase();
    const alb = (song.album || '').toLowerCase();

    if (/\b(?:covers?|acoustic\s+cover|metal\s+cover|piano\s+cover|tribute|karaoke)\b/i.test(t) || /\b(?:covers?|tribute|karaoke)\b/i.test(alb)) {
      authenticityViolations.push(`Cover/Karaoke detected: ${song.artist} - "${song.title}"`);
    }
    if (/\b(?:instrumental(?:\s+version)?|backing\s+track)\b/i.test(t)) {
      authenticityViolations.push(`Instrumental track detected: ${song.artist} - "${song.title}"`);
    }
    if (/\b(?:slowed(?:\s*\+?\s*reverb)?|sped\s+up|speed\s+up|nightcore|8-?bit|music\s*box|lullaby|workout\s+mix)\b/i.test(t)) {
      authenticityViolations.push(`Modified/Utility audio detected: ${song.artist} - "${song.title}"`);
    }
  }

  if (authenticityViolations.length > 0) {
    violations.push(`Authenticity failure (${authenticityViolations.length} tracks): ${authenticityViolations.join('; ')}`);
  }

  // 5. Word Length Variety
  const answers = placedSongs.map(s => s.answer || '').filter(Boolean);
  const lengths = answers.map(a => a.length);
  const minLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;
  const avgLength = lengths.length > 0 ? Number((lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1)) : 0;

  const shortAnswers = answers.filter(a => a.length <= 5);
  const mediumAnswers = answers.filter(a => a.length >= 6 && a.length <= 8);
  const longAnswers = answers.filter(a => a.length >= 9);

  const shortRatio = answers.length > 0 ? shortAnswers.length / answers.length : 0;
  const mediumRatio = answers.length > 0 ? mediumAnswers.length / answers.length : 0;
  const longRatio = answers.length > 0 ? longAnswers.length / answers.length : 0;

  // In standard or dense crosswords with >= 6 words, short words should be represented
  if (wordsPlaced >= 6 && archetype !== 'small' && shortAnswers.length === 0) {
    warnings.push(`Lesser letter words missing: 0 short words (<=5 chars) among ${wordsPlaced} answers.`);
  }

  // 6. Thematic Fidelity & Clue Policy
  if (parsed.artist) {
    const targetNorm = parsed.artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const song of placedSongs) {
      const songArtistNorm = (song.artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isArtistMatch = songArtistNorm === targetNorm ||
        songArtistNorm.startsWith(`${targetNorm}feat`) ||
        songArtistNorm.startsWith(`${targetNorm}with`) ||
        songArtistNorm.startsWith(`${targetNorm}and`) ||
        songArtistNorm.startsWith(`${targetNorm}&`);
      if (!isArtistMatch) {
        violations.push(`Artist mismatch: track ${song.artist} - "${song.title}" does not match target artist "${parsed.artist}".`);
      }
      if (song.clueType === 'Artist name') {
        violations.push(`Clue policy violation: single-artist crossword leaked "Artist name" clue for "${song.artist}".`);
      }
    }
  }

  if (parsed.yearRange) {
    for (const song of placedSongs) {
      if (!isTemporalPermitted(song, parsed.yearRange)) {
        violations.push(`Temporal mismatch: track ${song.artist} - "${song.title}" (year: ${song.release_year}) outside range ${parsed.yearRange.start || 0}-${parsed.yearRange.end || 'now'}.`);
      }
    }
  }

  // 7. Popularity Metrics
  const popularities = placedSongs.map(s => normalizePop(s.popularity));
  const minPop = popularities.length > 0 ? Math.min(...popularities) : 0;
  const maxPop = popularities.length > 0 ? Math.max(...popularities) : 0;
  const avgPop = popularities.length > 0 ? Math.round(popularities.reduce((a, b) => a + b, 0) / popularities.length) : 0;

  // Scoring
  let score = 100;
  score -= violations.length * 20;
  score -= warnings.length * 5;
  if (placedRatio < 0.8) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const passed = violations.length === 0;
  const grade = violations.length === 0 ? (warnings.length === 0 ? 'PASS' : 'WARN') : 'FAIL';

  return {
    passed,
    grade,
    score,
    violations,
    warnings,
    metrics: {
      wordsPlaced,
      targetWords,
      placedRatio,
      dimensions: `${width}x${height}`,
      fillDensity,
      crossingCounts,
      wordLengths: {
        min: minLength,
        max: maxLength,
        avg: avgLength,
        shortCount: shortAnswers.length,
        shortRatio: Number(shortRatio.toFixed(2)),
        mediumCount: mediumAnswers.length,
        mediumRatio: Number(mediumRatio.toFixed(2)),
        longCount: longAnswers.length,
        longRatio: Number(longRatio.toFixed(2)),
        shortWords: shortAnswers,
      },
      popularity: {
        min: minPop,
        max: maxPop,
        avg: avgPop,
      },
    },
  };
}

/**
 * Aggregates evaluations across multiple generations of the same prompt
 * to calculate repetitiveness (Jaccard similarity / unique track ratio) and popularity spread.
 *
 * @param {string} prompt Benchmark query prompt.
 * @param {Array} puzzles Array of generated puzzle objects for this prompt.
 * @param {Object} context Shared benchmark options.
 * @returns {Object} Multi-generation aggregated judgment.
 */
export function judgeMultiGenerationSuite(prompt, puzzles = [], context = {}) {
  const generationsCount = puzzles.length;
  if (generationsCount === 0) {
    return {
      prompt,
      generationsCount: 0,
      passed: false,
      grade: 'FAIL',
      score: 0,
      avgScore: 0,
      repetitiveness: { uniqueTrackRatio: 0, uniqueAnswerRatio: 0, avgJaccard: 1 },
      popularity: { min: 0, max: 0, avg: 0, spreadStdDev: 0 },
      lengthVariety: { shortShare: 0, mediumShare: 0, longShare: 0 },
      allViolations: ['No successful puzzles were generated for this prompt.'],
      allWarnings: [],
    };
  }

  const puzzleJudgments = puzzles.map((p, idx) => judgePuzzle(p, { ...context, prompt, generationIndex: idx }));

  // Collect placed tracks across generations
  const trackSetsPerGen = [];
  const answerSetsPerGen = [];
  const allTracks = [];
  const allAnswers = [];
  const allPopularities = [];

  for (const puzzle of puzzles) {
    const clues = puzzle?.clues || [];
    const placed = clues.map(c => ({ ...(c.song || {}), answer: c.answer }));
    const tSet = new Set(placed.map(s => `${s.artist}:::${s.title}`.toLowerCase()));
    const aSet = new Set(placed.map(s => (s.answer || '').toUpperCase()));

    trackSetsPerGen.push(tSet);
    answerSetsPerGen.push(aSet);

    for (const s of placed) {
      allTracks.push(`${s.artist}:::${s.title}`.toLowerCase());
      if (s.answer) allAnswers.push(s.answer.toUpperCase());
      if (s.popularity !== undefined && s.popularity !== null) {
        allPopularities.push(normalizePop(s.popularity));
      }
    }
  }

  // 1. Repetitiveness Analysis
  const distinctTracks = new Set(allTracks);
  const distinctAnswers = new Set(allAnswers);
  const uniqueTrackRatio = allTracks.length > 0 ? Number((distinctTracks.size / allTracks.length).toFixed(2)) : 1;
  const uniqueAnswerRatio = allAnswers.length > 0 ? Number((distinctAnswers.size / allAnswers.length).toFixed(2)) : 1;

  // Pairwise Jaccard overlap between generations
  const jaccardValues = [];
  for (let i = 0; i < trackSetsPerGen.length; i++) {
    for (let j = i + 1; j < trackSetsPerGen.length; j++) {
      const setA = trackSetsPerGen[i];
      const setB = trackSetsPerGen[j];
      let intersection = 0;
      for (const item of setA) {
        if (setB.has(item)) intersection++;
      }
      const union = setA.size + setB.size - intersection;
      const jaccard = union > 0 ? intersection / union : 0;
      jaccardValues.push(jaccard);
    }
  }
  const avgJaccard = jaccardValues.length > 0
    ? Number((jaccardValues.reduce((a, b) => a + b, 0) / jaccardValues.length).toFixed(2))
    : 0;

  // 2. Popularity Spread & Standard Deviation
  const minPop = allPopularities.length > 0 ? Math.min(...allPopularities) : 0;
  const maxPop = allPopularities.length > 0 ? Math.max(...allPopularities) : 0;
  const avgPop = allPopularities.length > 0 ? Math.round(allPopularities.reduce((a, b) => a + b, 0) / allPopularities.length) : 0;

  let variance = 0;
  if (allPopularities.length > 1) {
    variance = allPopularities.reduce((acc, val) => acc + Math.pow(val - avgPop, 2), 0) / allPopularities.length;
  }
  const popStdDev = Number(Math.sqrt(variance).toFixed(1));

  // Tiers: High (>70), Mid (40-70), Catalog (<40)
  const highTier = allPopularities.filter(p => p >= 70).length;
  const midTier = allPopularities.filter(p => p >= 40 && p < 70).length;
  const catalogTier = allPopularities.filter(p => p < 40).length;

  // 3. Length Variety across all generations
  const shortCount = allAnswers.filter(a => a.length <= 5).length;
  const mediumCount = allAnswers.filter(a => a.length >= 6 && a.length <= 8).length;
  const longCount = allAnswers.filter(a => a.length >= 9).length;
  const totalAnswers = allAnswers.length;

  const shortShare = totalAnswers > 0 ? Number((shortCount / totalAnswers).toFixed(2)) : 0;
  const mediumShare = totalAnswers > 0 ? Number((mediumCount / totalAnswers).toFixed(2)) : 0;
  const longShare = totalAnswers > 0 ? Number((longCount / totalAnswers).toFixed(2)) : 0;

  const allViolations = [];
  for (const j of puzzleJudgments) {
    allViolations.push(...j.violations);
  }

  const passedAll = puzzleJudgments.every(j => j.passed);
  const avgScore = Math.round(puzzleJudgments.reduce((a, b) => a + b.score, 0) / generationsCount);

  return {
    prompt,
    generationsCount,
    passed: passedAll && allViolations.length === 0,
    grade: passedAll && allViolations.length === 0 ? 'PASS' : 'FAIL',
    avgScore,
    allViolations,
    repetitiveness: {
      totalPlacedTracks: allTracks.length,
      distinctTracksCount: distinctTracks.size,
      uniqueTrackRatio,
      distinctAnswersCount: distinctAnswers.size,
      uniqueAnswerRatio,
      avgJaccard,
    },
    popularity: {
      min: minPop,
      max: maxPop,
      avg: avgPop,
      popStdDev,
      tierDistribution: {
        highTierPercent: totalAnswers > 0 ? Math.round((highTier / allPopularities.length) * 100) : 0,
        midTierPercent: totalAnswers > 0 ? Math.round((midTier / allPopularities.length) * 100) : 0,
        catalogTierPercent: totalAnswers > 0 ? Math.round((catalogTier / allPopularities.length) * 100) : 0,
      },
    },
    lengthVariety: {
      totalAnswers,
      shortShare,
      mediumShare,
      longShare,
      shortCount,
      mediumCount,
      longCount,
    },
    puzzleJudgments,
  };
}
