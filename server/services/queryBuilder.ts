import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ALLOWED_LANGUAGES } from '../db/trackNormalization.ts';
import type { YearRange } from '../types.ts';

/** What a prompt says about the songs it wants. */
export interface PromptOptions {
  artist?: string;
  album?: string;
  genre?: string;
  decade?: string;
  popularity?: string;
  yearRange?: YearRange;
  generation?: string;
}

/** Options from the API: a theme, a free-text prompt and explicit filters. */
export interface QueryOptions extends PromptOptions {
  prompt?: string;
  [option: string]: unknown;
}

/** Everything song selection needs to know about a request. */
export interface QueryPlan {
  genre: string;
  popularity: string;
  artist: string;
  album: string;
  decade: string;
  yearRange?: YearRange;
  targetAnimeKeyphrase: string | null;
  prompt: string;
  /**
   * Song languages when the theme doesn't decide: every admitted language for a named artist
   * (BTS or YOASOBI sing in their own), replaced by the API's language filter when one is set.
   */
  languages?: string[] | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Preload recognized artists for standalone artist prompt recognition (e.g. "Queen", "Daft Punk")
const recognizedArtistsSet = new Set<string>();
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
 * Parses a free-text prompt into structured steering parameters.
 * Handles single artists, compound genres, popularity modifiers, and temporal bounds/ranges.
 * e.g. "anime from the years 2020-2026", "songs by Daft Punk", "Queen", "rock before 1990"
 */
export function parsePrompt(prompt: unknown = ''): PromptOptions {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {};
  }

  let text = prompt.trim();
  const options: PromptOptions = {};

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

  // 2f. Generation Eras: e.g. "new gen", "4th gen", "5th gen", "3rd gen", "2nd gen", "1st gen"
  // Particularly critical for K-Pop, Hip-Hop, and contemporary pop generations
  const newGenMatch = text.match(/\b(new|4th|5th|next|current|modern|contemporary)\s*gen(?:eration)?\b/i);
  if (newGenMatch) {
    options.generation = 'new';
    if (!options.yearRange) {
      options.yearRange = { start: 2020, end: 2026 };
    }
    text = text.replace(newGenMatch[0], ' ');
  } else {
    const gen3Match = text.match(/\b3rd\s*gen(?:eration)?\b/i);
    if (gen3Match) {
      options.generation = '3rd';
      if (!options.yearRange) {
        options.yearRange = { start: 2012, end: 2019 };
      }
      text = text.replace(gen3Match[0], ' ');
    } else {
      const gen2Match = text.match(/\b2nd\s*gen(?:eration)?\b/i);
      if (gen2Match) {
        options.generation = '2nd';
        if (!options.yearRange) {
          options.yearRange = { start: 2003, end: 2011 };
        }
        text = text.replace(gen2Match[0], ' ');
      } else {
        const gen1Match = text.match(/\b1st\s*gen(?:eration)?\b/i);
        if (gen1Match) {
          options.generation = '1st';
          if (!options.yearRange) {
            options.yearRange = { start: 1990, end: 2002 };
          }
          text = text.replace(gen1Match[0], ' ');
        }
      }
    }
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
 * Extracts a specific anime franchise or series keyphrase from a prompt/genre,
 * stripping out generic anime category and soundtrack filler words (anime, openings, endings, themes, ost, etc.).
 *
 * e.g.:
 *   "anime gundam" -> "gundam"
 *   "anime openings naruto" -> "naruto"
 *   "gundam anime ost" -> "gundam"
 *   "anime" -> ""
 */
export function extractAnimeKeyphrase(prompt = '', genre = '') {
  const source = (prompt && typeof prompt === 'string' && prompt.trim())
    ? prompt
    : (genre && typeof genre === 'string' && genre !== 'all' ? genre : '');
  if (!source) return '';

  // Remove generic anime category words, soundtrack descriptors, and common prepositions
  const cleaned = source
    .replace(/\b(anime|animes|openings?|endings?|themes?|ost|soundtracks?|songs?|tracks?|music|series|op\d*|ed\d*)\b/gi, ' ')
    .replace(/\b(from the|in the|of the|from|in|of|the|best|popular)\b/gi, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If after stripping, nothing is left or only temporal/decade words remain, return empty
  if (!cleaned || /^\d{2,4}s?$/.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * Builds the query plan for song selection from the API options and the prompt.
 */
export function buildQueryPlan(userOptions: QueryOptions = {}): QueryPlan {
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
  const options: QueryOptions & { targetAnimeKeyphrase?: string } = {
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

  const animeKeyphrase = extractAnimeKeyphrase(userOptions.prompt, effectiveGenre);
  if (animeKeyphrase) {
    options.targetAnimeKeyphrase = animeKeyphrase;
  }

  const popularity = options.popularity || 'balanced';
  const artist = typeof options.artist === 'string' ? options.artist.trim() : '';
  const album = typeof options.album === 'string' ? options.album.trim() : '';
  const genre = effectiveGenre.trim();
  const decade = typeof options.decade === 'string' ? options.decade.trim() : '';
  const prompt = typeof userOptions.prompt === 'string' ? userOptions.prompt.trim() : '';

  return {
    genre: genre || 'all',
    popularity,
    artist,
    album,
    decade,
    yearRange: options.yearRange,
    targetAnimeKeyphrase: options.targetAnimeKeyphrase || null,
    prompt,
    languages: artist ? [...ALLOWED_LANGUAGES] : null,
  };
}

/**
 * Converts parsed prompt options into a safe FTS5 search query string for use
 * with sqliteCatalog.sampleCatalogTracks(). Strips noise words, already-extracted
 * directives (artist, decade, year, popularity), and FTS5 special characters.
 *
 * Returns an empty string when the prompt contains only directives (e.g. "songs by Queen")
 * so the caller can skip the FTS path and rely on genre/artist filters instead.
 *
 * Examples:
 *   parsePrompt("90s grunge rock") + toFtsQuery → '"grunge" OR "rock"'
 *   parsePrompt("songs by Daft Punk") + toFtsQuery → '' (artist handled by filter)
 *   parsePrompt("French house classics") + toFtsQuery → '"house"'
 */
export function toFtsQuery(prompt = '', parsedOptions: { artist?: string } = {}): string {
  if (!prompt || typeof prompt !== 'string') return '';

  const NOISE_WORDS = new Set([
    'songs', 'song', 'tracks', 'track', 'music', 'discography', 'singles', 'single',
    'recordings', 'recording', 'tunes', 'tune', 'hits', 'hit', 'classic', 'classics',
    'anthems', 'anthem', 'essentials', 'essential', 'best', 'top', 'famous',
    'by', 'from', 'in', 'of', 'the', 'a', 'an', 'with', 'for',
    'obscure', 'underground', 'niche', 'underrated', 'hidden', 'gems', 'gem',
    'mainstream', 'pure', 'any', 'anything', 'random', 'new', 'old',
    'anime', 'openings', 'opening', 'endings', 'ending', 'ost', 'themes', 'theme',
    'gen', 'generation', 'kpop', 'jpop', 'jrock', 'rnb', 'edm',
  ]);

  let text = prompt.toLowerCase();

  // Strip year ranges (e.g. "2010-2020", "from 1990 to 2000")
  text = text.replace(/\b(from\s+)?\d{4}(\s*(to|-)\s*\d{4})?\b/g, ' ');

  // Strip decade references (e.g. "80s", "1990s")
  text = text.replace(/\b(?:19|20)?\d0s\b/g, ' ');

  // Strip artist directive if already parsed
  if (parsedOptions.artist) {
    const artistNorm = parsedOptions.artist.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    text = text.replace(new RegExp(artistNorm.split(' ').join('\\s+'), 'i'), ' ');
    text = text.replace(/\b(by|from|artist:\s*|feat\.?\s+|featuring\s+)/gi, ' ');
  }

  // Tokenize and filter
  const tokens = text
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !NOISE_WORDS.has(t) && !/^\d+$/.test(t));

  if (tokens.length === 0) return '';

  // Deduplicate and build FTS5 OR query with quoted tokens for phrase safety
  const unique = [...new Set(tokens)];
  return unique.map(t => `"${t}"`).join(' OR ');
}
