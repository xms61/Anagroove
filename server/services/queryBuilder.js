/**
 * Parses user prompts and settings into actionable multi-provider query plans.
 * Follows KISS and DRY principles: pure functions, transparent regexes, zero external dependencies.
 * Strictly avoids predetermined lists (artists, songs, seed words) to ensure dynamic, non-repetitive exploration.
 */

/**
 * Generates a dynamic, non-predetermined alphanumeric search seed for open exploration.
 * Uses uniform random letter or bigram sampling across the entire alphabet.
 */
function generateDynamicSeed() {
  const char1 = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  const char2 = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return `${char1}${char2}`;
}

/**
 * Parses a free-text prompt into structured steering parameters.
 * e.g. "obscure 80s japanese city pop by tatsuro yamashita"
 */
export function parsePrompt(prompt = '') {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {};
  }

  let text = prompt.trim();
  const options = {};

  // 1. Quoted artist or album: "Daft Punk"
  const quoteMatch = text.match(/"([^"]+)"/);
  if (quoteMatch) {
    options.artist = quoteMatch[1].trim();
    text = text.replace(quoteMatch[0], ' ');
  }

  // 2. Artist directive: "by <Artist>" or "from <Artist>"
  const byArtistMatch = text.match(/\b(?:by|from)\s+([a-zA-Z0-9\s&'-]+?)(?:\s+(?:in|during|from album|album)|$)/i);
  if (byArtistMatch && !options.artist) {
    options.artist = byArtistMatch[1].trim();
    text = text.replace(byArtistMatch[0], ' ');
  }

  // 3. Album directive: "album <Album>"
  const albumMatch = text.match(/\b(?:album)\s+([a-zA-Z0-9\s&'-]+?)(?:\s+(?:by|from)|$)/i);
  if (albumMatch && !options.album) {
    options.album = albumMatch[1].trim();
    text = text.replace(albumMatch[0], ' ');
  }

  // 4. Decade / Era: "80s", "1990s", "70s", "2000s"
  const decadeMatch = text.match(/\b(19[5-9]0|[5-9]0|20[0-2]0)s?\b/i);
  if (decadeMatch) {
    let decade = decadeMatch[1];
    if (decade.length === 2) {
      decade = Number(decade) >= 50 ? `19${decade}` : `20${decade}`;
    }
    options.decade = `${decade}s`;
    text = text.replace(decadeMatch[0], ' ');
  }

  // 5. Popularity modifiers
  if (/\b(obscure|underground|niche|underrated|hidden gems?)\b/i.test(text)) {
    options.popularity = 'obscure';
    text = text.replace(/\b(obscure|underground|niche|underrated|hidden gems?)\b/gi, ' ');
  } else if (/\b(hits?|famous|top|billboard|classics?|mainstream)\b/i.test(text)) {
    options.popularity = 'mainstream';
    text = text.replace(/\b(hits?|famous|top|billboard|classics?|mainstream)\b/gi, ' ');
  } else if (/\b(pure|any|anything|random)\b/i.test(text)) {
    options.popularity = 'pure';
    text = text.replace(/\b(pure|any|anything|random)\b/gi, ' ');
  }

  // Remaining cleaned text is treated as custom genre / theme keywords
  const cleanedGenre = text
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanedGenre) {
    options.genre = cleanedGenre;
  }

  return options;
}

/**
 * Generates complementary search variations for any theme or genre.
 * Universally applicable to any query prompt (e.g. "Japanese City Pop", "90s Grunge Rock", "French House").
 */
export function generateThemeVariations(genre = '', decade = '') {
  const variations = new Set();
  const trimmed = typeof genre === 'string' ? genre.trim() : '';
  if (!trimmed) return [];

  variations.add(trimmed);

  if (decade) {
    variations.add(`${trimmed} ${decade}`);
  }

  // De-spaced compound variants (e.g. "city pop" -> "citypop", "synth wave" -> "synthwave", "hip hop" -> "hiphop")
  const compact = trimmed.replace(/\b(city\s+pop|synth\s+wave|chill\s+wave|vapor\s+wave|hip\s+hop|lo\s+fi|post\s+punk|neo\s+soul)\b/gi, match => match.replace(/\s+/g, ''));
  if (compact !== trimmed) {
    variations.add(compact);
    if (decade) {
      variations.add(`${compact} ${decade}`);
    }
  }

  // If there's a cultural/language prefix (e.g. "Japanese", "French", "Korean"), retain it
  const words = trimmed.split(/\s+/);
  const isCultural = /^(japanese|korean|french|german|spanish|italian|brazilian|latin|african|chinese|swedish|anime)\b/i.test(words[0]);

  if (words.length >= 3) {
    if (isCultural) {
      // Keep cultural prefix + last word (e.g. "Japanese Pop")
      variations.add(`${words[0]} ${words[words.length - 1]}`);
    } else {
      // For non-cultural phrases (e.g. "alternative indie rock" -> "indie rock")
      const coreSubGenre = words.slice(-2).join(' ');
      variations.add(coreSubGenre);
      if (decade) {
        variations.add(`${coreSubGenre} ${decade}`);
      }
    }
  }

  return Array.from(variations).slice(0, 4);
}

/**
 * Builds a query plan with search terms and filtering thresholds for Deezer and iTunes.
 */
export function buildQueryPlan(userOptions = {}) {
  // Parse prompt-extracted options
  const promptOptions = parsePrompt(userOptions.prompt);

  // If user provided a prompt that identified a genre/theme, and userOptions.genre was left at default 'all'
  let effectiveGenre = '';
  if (promptOptions.genre) {
    if (userOptions.genre && userOptions.genre !== 'all') {
      effectiveGenre = `${userOptions.genre} ${promptOptions.genre}`.trim();
    } else {
      effectiveGenre = promptOptions.genre;
    }
  } else if (userOptions.genre && userOptions.genre !== 'all') {
    effectiveGenre = userOptions.genre;
  }

  // Merge options with resolved genre taking precedence over 'all'
  const options = {
    ...promptOptions,
    ...userOptions,
    genre: effectiveGenre || 'all',
  };

  const popularity = options.popularity || (options.genre === 'all' && !options.artist ? 'pure' : 'balanced');
  const artist = typeof options.artist === 'string' ? options.artist.trim() : '';
  const album = typeof options.album === 'string' ? options.album.trim() : '';
  const genre = effectiveGenre.trim();
  const decade = typeof options.decade === 'string' ? options.decade.trim() : '';
  const prompt = typeof userOptions.prompt === 'string' ? userOptions.prompt.trim() : '';

  // Popularity thresholds for Deezer candidate filtering
  let minFans = 0;
  let maxFans = Infinity;
  let minRank = 0;
  let maxRank = Infinity;

  if (popularity === 'obscure') {
    maxFans = 75000;
    maxRank = 400000;
  } else if (popularity === 'mainstream') {
    minFans = 100000;
    minRank = 350000;
  } else if (popularity === 'balanced') {
    minFans = 25000;
    minRank = 200000;
  } else if (popularity === 'pure') {
    // Pure: no popularity filtering
    minFans = 0;
    minRank = 0;
  }

  // If user explicitly provided minFans, honor it
  if (Number.isFinite(Number(userOptions.minFans))) {
    minFans = Number(userOptions.minFans);
  }

  // Build targeted Deezer & iTunes searches
  const deezerSearches = [];
  const itunesSearches = [];

  if (artist) {
    deezerSearches.push(`artist:"${artist}"`);
    itunesSearches.push(artist);
  }

  if (album) {
    deezerSearches.push(`album:"${album}"`);
    itunesSearches.push(album);
  }

  if (genre) {
    const variations = generateThemeVariations(genre, decade);
    for (const term of variations) {
      deezerSearches.push(term);
      itunesSearches.push(term);
    }
  } else if (decade) {
    const yearBase = parseInt(decade);
    if (!isNaN(yearBase)) {
      deezerSearches.push(`release_date:"${yearBase}"`);
      itunesSearches.push(decade);
    }
  }

  // Fallback: If searches are empty but user entered a prompt, search by the cleaned prompt terms
  if (deezerSearches.length === 0 && prompt) {
    const cleanPrompt = prompt.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanPrompt) {
      deezerSearches.push(cleanPrompt);
      itunesSearches.push(cleanPrompt);
    }
  }

  // STRICT GUARDRAIL: ONLY when completely open (no artist, album, genre, decade, OR prompt specified),
  // inject dynamic random alphanumeric exploration (never hardcoded dictionary words)
  const hasThematicCriteria = Boolean(artist || album || genre || decade || prompt);
  if (deezerSearches.length === 0 && !hasThematicCriteria) {
    const dynamicSeed = generateDynamicSeed();
    deezerSearches.push(dynamicSeed);
    itunesSearches.push(dynamicSeed);
  }

  // Dynamic sorting order to explore varied catalog depths on repeated calls
  const SORT_ORDERS = ['RANKING', 'TRACK_ASC', 'RATING_ASC', 'DURATION_ASC'];
  const randomOrder = SORT_ORDERS[Math.floor(Math.random() * SORT_ORDERS.length)];

  return {
    popularity,
    artist,
    album,
    genre: genre || 'all',
    decade,
    prompt,
    minFans,
    maxFans,
    minRank,
    maxRank,
    deezerSearches,
    itunesSearches,
    randomOffset: genre ? Math.floor(Math.random() * 25) : Math.floor(Math.random() * 150),
    sortOrder: randomOrder,
  };
}
