import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Preload recognized artists for standalone artist prompt recognition (e.g. "Queen", "Daft Punk")
let recognizedArtistsSet = new Set();
try {
  const artistsPath = path.resolve(__dirname, '../data/recognized_artists.json');
  if (fs.existsSync(artistsPath)) {
    const raw = JSON.parse(fs.readFileSync(artistsPath, 'utf-8'));
    if (Array.isArray(raw)) {
      for (const a of raw) {
        if (a?.name) {
          recognizedArtistsSet.add(a.name.toLowerCase().trim());
        }
      }
    }
  }
} catch {
  // Graceful fallback if file is missing in certain test harnesses
}

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
 * Handles single artists, compound genres, popularity modifiers, and temporal bounds/ranges.
 * e.g. "anime from the years 2020-2026", "songs by Daft Punk", "Queen", "rock before 1990"
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

  // 2. Temporal Extraction (RANGES, BOUNDS, YEARS, DECADES)
  // MUST RUN BEFORE ARTIST EXTRACTION so "from the years 2020-2026" or "from 1980" does not trigger "from <Artist>"

  // 2a. Year Ranges: e.g. "from the years 2020-2026", "between 1970 and 1976", "2020 - 2026", "from 1980 to 1985"
  const rangeMatch = text.match(/(?:\b(?:from|between|in)\s+)?(?:the\s+years?\s+)?\b(19\d{2}|20\d{2})\b\s*(?:-|–|—|to|until|through|and)\s*(?:the\s+year\s+)?\b(19\d{2}|20\d{2})\b/i);
  if (rangeMatch) {
    const y1 = parseInt(rangeMatch[1], 10);
    const y2 = parseInt(rangeMatch[2], 10);
    options.yearRange = {
      start: Math.min(y1, y2),
      end: Math.max(y1, y2),
    };
    text = text.replace(rangeMatch[0], ' ');
  }

  // 2b. Upper Bounds (Before): e.g. "before 1994", "prior to 1990", "earlier than 1985", "up to 1995", "until 2000", "pre-2000"
  const beforeMatch = text.match(/\b(?:before|prior\s+to|earlier\s+than|up\s+to|until|pre-?)\s*(?:the\s+year\s+)?\b(19\d{2}|20\d{2})\b/i);
  if (beforeMatch && !options.yearRange) {
    const endYear = parseInt(beforeMatch[1], 10) - 1;
    options.yearRange = { end: endYear };
    text = text.replace(beforeMatch[0], ' ');
  }

  // 2c. Lower Bounds (After): e.g. "after 2018", "since 2020", "post-2010", "from 2015 onwards", "from 2020 and later"
  const afterMatch = text.match(/\b(?:after|since|post-?|from\s+(?:the\s+year\s+)?\b(19\d{2}|20\d{2})\b\s*(?:onwards?|and\s+later))\s*(?:the\s+year\s+)?\b(19\d{2}|20\d{2})?\b/i);
  if (afterMatch && !options.yearRange) {
    const startYear = parseInt(afterMatch[1] || afterMatch[2], 10) + (afterMatch[0].toLowerCase().includes('after') ? 1 : 0);
    options.yearRange = { start: startYear };
    text = text.replace(afterMatch[0], ' ');
  }

  // 2d. Single Specific Year: e.g. "in 1999", "during 2004", "released in 2022", "year 2015"
  const singleYearMatch = text.match(/\b(?:in|during|year|released\s+in)\s*\b(19\d{2}|20\d{2})\b/i);
  if (singleYearMatch && !options.yearRange) {
    const yr = parseInt(singleYearMatch[1], 10);
    options.yearRange = { start: yr, end: yr };
    text = text.replace(singleYearMatch[0], ' ');
  }

  // 2e. Decades: e.g. "80s", "1990s", "70s", "2000s"
  const decadeMatch = text.match(/\b(19[5-9]0|[5-9]0|20[0-2]0)s?\b/i);
  if (decadeMatch) {
    let decade = decadeMatch[1];
    if (decade.length === 2) {
      decade = Number(decade) >= 50 ? `19${decade}` : `20${decade}`;
    }
    options.decade = `${decade}s`;
    if (!options.yearRange) {
      const start = parseInt(decade, 10);
      options.yearRange = { start, end: start + 9 };
    }
    text = text.replace(decadeMatch[0], ' ');
  }

  // 3. Artist Directive: e.g. "by <Artist>", "from <Artist>", "artist: <Artist>", "feat <Artist>"
  const byArtistMatch = text.match(/\b(?:by|from|artist:\s*|feat\.?\s+|featuring\s+)([a-zA-Z0-9\s&'.-]+?)(?:\s+(?:in|during|from album|album|with)|$)/i);
  if (byArtistMatch && !options.artist) {
    const candidateArtist = byArtistMatch[1].trim();
    if (!/^\d+$/.test(candidateArtist)) {
      options.artist = candidateArtist;
      text = text.replace(byArtistMatch[0], ' ');
    }
  }

  // 4. Album Directive: "album <Album>"
  const albumMatch = text.match(/\b(?:album)\s+([a-zA-Z0-9\s&'.-]+?)(?:\s+(?:by|from)|$)/i);
  if (albumMatch && !options.album) {
    options.album = albumMatch[1].trim();
    text = text.replace(albumMatch[0], ' ');
  }

  // 5. Popularity Modifiers
  // Note: "classic rock", "classic soul", etc. are musical genres, not popularity filters
  const hasClassicGenre = /\bclassic(al)?\s+(rock|soul|jazz|country|hip\s*hop|r&b|disco|metal|pop|blues|funk)\b/i.test(text);

  if (/\b(obscure|underground|niche|underrated|hidden gems?)\b/i.test(text)) {
    options.popularity = 'obscure';
    text = text.replace(/\b(obscure|underground|niche|underrated|hidden gems?)\b/gi, ' ');
  } else if (!hasClassicGenre && /\b(hits?|famous|top|billboard|classics?|mainstream)\b/i.test(text)) {
    options.popularity = 'mainstream';
    text = text.replace(/\b(hits?|famous|top|billboard|classics?|mainstream)\b/gi, ' ');
  } else if (hasClassicGenre && /\b(hits?|famous|top|billboard|mainstream)\b/i.test(text)) {
    options.popularity = 'mainstream';
    text = text.replace(/\b(hits?|famous|top|billboard|mainstream)\b/gi, ' ');
  } else if (/\b(pure|any|anything|random)\b/i.test(text)) {
    options.popularity = 'pure';
    text = text.replace(/\b(pure|any|anything|random)\b/gi, ' ');
  }

  // 6. Noise / Filler Word Scrubbing (words like "songs", "tracks", "music", "discography")
  text = text.replace(/\b(songs?|tracks?|music|discography|singles?|recordings?|tunes?)\b/gi, ' ');

  // 7. Remaining cleaned text
  const cleanedGenre = text
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 8. Standalone Artist Detection vs Residual Genre
  if (cleanedGenre) {
    if (!options.artist && recognizedArtistsSet.has(cleanedGenre.toLowerCase())) {
      options.artist = cleanedGenre;
    } else if (!options.artist && recognizedArtistsSet.has(prompt.trim().toLowerCase())) {
      options.artist = prompt.trim();
    } else {
      options.genre = cleanedGenre;
    }
  } else if (!options.artist && recognizedArtistsSet.has(prompt.trim().toLowerCase())) {
    options.artist = prompt.trim();
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

  // If there's a cultural/language prefix (e.g. "Japanese", "French", "Korean"), retain core compound genre
  const words = trimmed.split(/\s+/);
  const isCultural = /^(japanese|korean|french|german|spanish|italian|brazilian|latin|african|chinese|swedish|anime)\b/i.test(words[0]);

  if (words.length >= 3) {
    if (isCultural) {
      // Retain core atomic subgenre without cultural prefix for native storefront querying (e.g. "City Pop")
      const coreGenre = words.slice(1).join(' ');
      variations.add(coreGenre);
      if (decade) {
        variations.add(`${coreGenre} ${decade}`);
      }
    } else {
      // For non-cultural phrases (e.g. "alternative indie rock" -> "indie rock")
      const coreSubGenre = words.slice(-2).join(' ');
      variations.add(coreSubGenre);
      if (decade) {
        variations.add(`${coreSubGenre} ${decade}`);
      }
    }
  }

  // De-spaced compound variants (e.g. "city pop" -> "citypop", "synth wave" -> "synthwave", "hip hop" -> "hiphop")
  const compact = trimmed.replace(/\b(city\s+pop|synth\s+wave|chill\s+wave|vapor\s+wave|hip\s+hop|lo\s+fi|post\s+punk|neo\s+soul)\b/gi, match => match.replace(/\s+/g, ''));
  if (compact !== trimmed) {
    variations.add(compact);
    if (decade) {
      variations.add(`${compact} ${decade}`);
    }
  }

  if (decade) {
    variations.add(`${trimmed} ${decade}`);
  }

  // Add recognized subgenre synonyms
  const lower = trimmed.toLowerCase();
  if (lower.includes('french house')) variations.add('french touch');
  if (lower.includes('krautrock')) variations.add('kosmische musik');
  if (lower.includes('city pop') || lower.includes('citypop')) variations.add('japanese city pop');
  if (lower.includes('bossa nova')) variations.add('bossa nova brasil');
  if (lower.includes('grunge')) variations.add('grunge rock');
  if (lower.includes('reggae')) variations.add('roots reggae');
  if (lower.includes('k-pop') || lower.includes('kpop')) {
    variations.add('kpop');
    variations.add('korean pop');
  }

  return Array.from(variations).slice(0, 6);
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

  // Merge options with promptOptions taking precedence when userOptions fields are empty
  const options = {
    ...promptOptions,
    ...userOptions,
    artist: userOptions.artist || promptOptions.artist || '',
    album: userOptions.album || promptOptions.album || '',
    decade: userOptions.decade || promptOptions.decade || '',
    popularity: userOptions.popularity || promptOptions.popularity,
    genre: effectiveGenre || 'all',
  };
  if (promptOptions.yearRange) {
    options.yearRange = promptOptions.yearRange;
  }

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
    const yearBase = parseInt(decade, 10);
    if (!isNaN(yearBase)) {
      deezerSearches.push(`release_date:"${yearBase}"`);
      itunesSearches.push(decade);
    }
  }

  // Targeted year queries when a temporal filter is present
  if (options.yearRange) {
    const { start, end } = options.yearRange;
    const baseSubject = genre || artist || '';
    if (baseSubject) {
      if (start !== undefined && end !== undefined) {
        if (start === end) {
          deezerSearches.push(`${baseSubject} ${start}`);
          itunesSearches.push(`${baseSubject} ${start}`);
        } else {
          deezerSearches.push(`${baseSubject} ${start}`);
          deezerSearches.push(`${baseSubject} ${end}`);
          itunesSearches.push(`${baseSubject} ${start}`);
          itunesSearches.push(`${baseSubject} ${end}`);
          const mid = Math.floor((start + end) / 2);
          if (mid !== start && mid !== end) {
            itunesSearches.push(`${baseSubject} ${mid}`);
          }
        }
      } else if (start !== undefined) {
        deezerSearches.push(`${baseSubject} ${start}`);
        itunesSearches.push(`${baseSubject} ${start}`);
      } else if (end !== undefined) {
        deezerSearches.push(`${baseSubject} ${end}`);
        itunesSearches.push(`${baseSubject} ${end}`);
      }
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
  const randomOffset = genre ? Math.floor(Math.random() * 25) : Math.floor(Math.random() * 150);

  return {
    genre: genre || 'all',
    popularity,
    artist,
    album,
    decade,
    yearRange: options.yearRange,
    prompt,
    minFans,
    maxFans,
    minRank,
    maxRank,
    deezerSearches: Array.from(new Set(deezerSearches)),
    itunesSearches: Array.from(new Set(itunesSearches)),
    randomOffset,
    sortOrder: randomOrder,
  };
}
