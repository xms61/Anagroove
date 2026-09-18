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
 * Builds a query plan with search terms and filtering thresholds for Deezer and iTunes.
 */
export function buildQueryPlan(userOptions = {}) {
  // Merge prompt-extracted options with explicit options (explicit options take precedence)
  const promptOptions = parsePrompt(userOptions.prompt);
  const options = { ...promptOptions, ...userOptions };

  const popularity = options.popularity || (options.genre === 'all' && !options.artist ? 'pure' : 'balanced');
  const artist = typeof options.artist === 'string' ? options.artist.trim() : '';
  const album = typeof options.album === 'string' ? options.album.trim() : '';
  const genre = typeof options.genre === 'string' && options.genre.trim() && options.genre !== 'all'
    ? options.genre.trim()
    : '';
  const decade = typeof options.decade === 'string' ? options.decade.trim() : '';

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

  // Build targeted Deezer searches
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
    deezerSearches.push(genre);
    itunesSearches.push(genre);
  }

  if (decade) {
    const yearBase = parseInt(decade);
    if (!isNaN(yearBase)) {
      deezerSearches.push(`release_date:"${yearBase}"`);
      itunesSearches.push(decade);
    }
  }

  // ONLY when completely open (no artist, album, genre, or decade specified),
  // inject dynamic random alphanumeric exploration (never hardcoded dictionary words)
  if (deezerSearches.length === 0) {
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
    minFans,
    maxFans,
    minRank,
    maxRank,
    deezerSearches,
    itunesSearches,
    randomOffset: Math.floor(Math.random() * 150),
    sortOrder: randomOrder,
  };
}
