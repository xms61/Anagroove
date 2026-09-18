/**
 * Extracts candidate crossword answers (Song title, Artist name, or Title keyword),
 * capped at 14 characters, supporting variable clue distributions.
 *
 * @param {string} title - Track title
 * @param {string} artist - Artist or band name
 * @param {{ preferredType?: 'title' | 'artist' | 'keyword', allowArtist?: boolean, seenAnswers?: Set<string>, artistIndex?: number } | string} [options]
 * @returns {{ answer: string, clueType: string, clueText: string } | null}
 */
import { toCrosswordAnswer } from './musicIdentity.js';

const SINGLE_ENTITY_AND_PATTERNS = [
  // 1. Groups with "... & The [Noun]" / "... and the [Noun]" / "... & His ..." / "... & Her ..." / "... & Their ..."
  /(?:^|\s)(?:&|\band\b|\+)\s+(the|his|her|their)\s+/i,
  // 2. Groups with "... & Sons" / "... & Daughters" / "... & Brothers" / "... & Bros" / "... & Co" / "... & Company"
  /(?:^|\s)(?:&|\band\b|\+)\s+(sons|daughters|brothers|bros\.?|co\.?|company)\b/i,
  // 3. Known collective nouns or band indicators following &
  /(?:^|\s)(?:&|\band\b|\+)\s+.*?\b(band|orchestra|ensemble|quartet|trio|choir|experience|players|syndicate|chorus)\b/i,
];

const KNOWN_SINGLE_ENTITY_NAMES = new Set([
  'above & beyond',
  'above and beyond',
  'earth, wind & fire',
  'earth wind & fire',
  'earth wind and fire',
  'blood, sweat & tears',
  'blood sweat & tears',
  'blood sweat and tears',
  'simon & garfunkel',
  'simon and garfunkel',
  'hall & oates',
  'hall and oates',
  'daryl hall & john oates',
  'daryl hall and john oates',
  'brooks & dunn',
  'brooks and dunn',
  'of mice & men',
  'of mice and men',
  'iron & wine',
  'iron and wine',
  'me & my',
  'me and my',
  'tegan and sara',
  'tegan & sara',
  'angus & julia stone',
  'angus and julia stone',
  'peaches & herb',
  'peaches and herb',
  'sam & dave',
  'sam and dave',
  'ike & tina turner',
  'ike and tina turner',
  'chas & dave',
  'chas and dave',
  'sonny & cher',
  'sonny and cher',
  'captain & tennille',
  'captain and tennille',
  'loggins & messina',
  'loggins and messina',
  'ashford & simpson',
  'ashford and simpson',
  'seals & crofts',
  'seals and crofts',
  'boyce & hart',
  'boyce and hart',
  'crosby, stills, nash & young',
  'crosby stills nash & young',
  'crosby stills nash and young',
  'arms and sleepers',
  'arms & sleepers',
  'stars and rabbit',
  'stars & rabbit',
  'fish & chips',
  'fish and chips',
  'flight of the conchords',
  'king gizzard & the lizard wizard',
  'king gizzard and the lizard wizard',
  'bonnie & clyde',
  'bonnie and clyde',
  'belle and sebastian',
  'belle & sebastian',
]);

/**
 * Checks whether an artist name containing '&' or 'and' represents a single,
 * unitary band or artistic entity (e.g. "Above & Beyond", "Mumford & Sons", "Simon & Garfunkel"),
 * rather than multiple collaborating artists (e.g. "Ski Aggu & Sira", "Drake & 21 Savage").
 */
export function isSingleEntityArtist(artistName) {
  if (!artistName) return false;
  const clean = String(artistName).trim().toLowerCase();
  if (KNOWN_SINGLE_ENTITY_NAMES.has(clean)) return true;
  return SINGLE_ENTITY_AND_PATTERNS.some(pattern => pattern.test(clean));
}

/**
 * Splits an artist string into distinct collaborating artists when multiple performers
 * are present (e.g. "Ski Aggu & Sira" -> ["Ski Aggu", "Sira"]), while preserving
 * single-entity group names (e.g. "Above & Beyond" -> ["Above & Beyond"]).
 */
export function splitArtistNames(artistName) {
  if (!artistName) return [];
  const raw = String(artistName).trim();
  if (!raw) return [];

  if (isSingleEntityArtist(raw)) {
    return [raw];
  }

  // Collaboration delimiters:
  // e.g. " & ", " and ", " feat. ", " ft. ", " featuring ", " with ", " x ", " X ", " / ", " vs. ", " vs ", ", "
  const parts = raw
    .split(/\s+(?:feat\.?|ft\.?|featuring|with|x|vs\.?|\/)\s+|\s*,\s*|\s+(?:&|and)\s+/i)
    .map(p => p.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [raw];
}

export function extractAllAnswerCandidates(title, artist) {
  if (!title || !artist) return null;

  // Thoroughly strip featured artists and parenthetical annotations from song title
  // e.g. "APT. (feat. Bruno Mars)" -> "APT."
  // or "APT. feat. Bruno Mars" -> "APT."
  const cleanTitle = String(title)
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s+[^)\]]+[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .trim();

  // Combined full song title (2 to 14 letters)
  // e.g. "Go" -> "GO" (2), "Your Love" -> "YOURLOVE" (8), "Blinding Lights" -> "BLINDINGLIGHTS" (14)
  const combinedTitle = toCrosswordAnswer(cleanTitle, { minLength: 2, maxLength: 14 });
  const titleCandidate = combinedTitle ? {
    answer: combinedTitle,
    clueType: 'Song title',
    clueText: `Iconic track title (${combinedTitle.length} letters)`
  } : null;

  // Split artist names so multiple collaborating performers are NEVER concatenated together.
  // e.g. "ROSÉ & Bruno Mars" -> ["ROSÉ", "Bruno Mars"] -> individual candidates "ROSE" (4) and "BRUNOMARS" (9)
  // whereas single-entity groups with '&' ("Above & Beyond", "Mumford & Sons") remain unitary
  // and expand '&' to 'AND' ("ABOVEANDBEYOND", "MUMFORDANDSONS").
  const artistNames = splitArtistNames(artist);
  const artistCandidates = [];

  for (let i = 0; i < artistNames.length; i++) {
    const name = artistNames[i];
    const answer = toCrosswordAnswer(name, { minLength: 2, maxLength: 14 });
    if (answer) {
      artistCandidates.push({
        answer,
        clueType: 'Artist name',
        clueText: artistNames.length > 1
          ? (i === 0 ? `Performer of this track (${answer.length} letters)` : `Co-performer of this track (${answer.length} letters)`)
          : `Celebrated performer of this track (${answer.length} letters)`,
        artistName: name,
        isCollaboration: artistNames.length > 1,
      });
    }
  }

  const primaryArtistCandidate = artistCandidates[0] || null;

  // Single keywords from multi-word title (2 to 10 letters)
  // Provides shorter 2-5 letter options and 6-8 letter options for rich length variety
  const normalizedWords = cleanTitle
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => toCrosswordAnswer(w, { minLength: 2, maxLength: 10 }))
    .filter(Boolean);

  let keywordCandidate = null;
  let shortKeywordCandidate = null;
  if (normalizedWords.length > 0) {
    const sorted = [...normalizedWords].sort((a, b) => b.length - a.length);
    const candidate = sorted[0];
    if (candidate) {
      keywordCandidate = {
        answer: candidate,
        clueType: 'Song title keyword',
        clueText: `Key word in this track title (${candidate.length} letters)`
      };
    }
    // Find a shorter keyword candidate (2 to 5 letters) if available
    const shortWord = normalizedWords.find(w => w.length >= 2 && w.length <= 5);
    if (shortWord && (!candidate || shortWord !== candidate)) {
      shortKeywordCandidate = {
        answer: shortWord,
        clueType: 'Song title keyword',
        clueText: `Key word in this track title (${shortWord.length} letters)`
      };
    }
  }

  return {
    title: titleCandidate,
    artist: primaryArtistCandidate,
    artistCandidates,
    keyword: keywordCandidate,
    shortKeyword: shortKeywordCandidate,
  };
}

export function extractAnswerKeyword(title, artist, options = {}) {
  const candidates = extractAllAnswerCandidates(title, artist);
  if (!candidates) return null;

  const preferred = typeof options === 'string' ? options : options?.preferredType;
  const allowArtist = options?.allowArtist !== false;
  const seenAnswers = options?.seenAnswers;
  const targetBucket = options?.targetLengthBucket; // 'short' (2-5), 'medium' (6-8), 'long' (9-14)
  const artistIndex = typeof options?.artistIndex === 'number' ? options.artistIndex : null;

  function getBestArtistCandidate() {
    const list = candidates.artistCandidates || [];
    if (list.length === 0) return candidates.artist;
    if (artistIndex !== null && list[artistIndex]) {
      return list[artistIndex];
    }
    if (seenAnswers) {
      const unseen = list.find(c => !seenAnswers.has(c.answer));
      if (unseen) return unseen;
    }
    return list[0] || candidates.artist;
  }

  const allAvailable = [];
  if (candidates.title) allAvailable.push(candidates.title);
  if (candidates.keyword) allAvailable.push(candidates.keyword);
  if (candidates.shortKeyword) allAvailable.push(candidates.shortKeyword);
  if (allowArtist && candidates.artistCandidates) {
    allAvailable.push(...candidates.artistCandidates);
  }

  // Helper to test if a candidate matches the requested length bucket
  function inLengthBucket(candidate, bucket) {
    if (!candidate || !candidate.answer) return false;
    const len = candidate.answer.length;
    if (bucket === 'short') return len >= 2 && len <= 5;
    if (bucket === 'medium') return len >= 6 && len <= 8;
    if (bucket === 'long') return len >= 9 && len <= 14;
    return true;
  }

  // If a specific target length bucket was requested, check if any eligible candidate matches it
  if (targetBucket) {
    const bucketMatches = allAvailable.filter(c => (!seenAnswers || !seenAnswers.has(c.answer)) && inLengthBucket(c, targetBucket));
    if (bucketMatches.length > 0) {
      // If preferred type matches within bucket, take it
      if (preferred === 'artist' && allowArtist) {
        const art = bucketMatches.find(c => c.clueType === 'Artist name');
        if (art) return art;
      } else if (preferred === 'title') {
        const ttl = bucketMatches.find(c => c.clueType === 'Song title');
        if (ttl) return ttl;
      } else if (preferred === 'keyword') {
        const kw = bucketMatches.find(c => c.clueType === 'Song title keyword');
        if (kw) return kw;
      }
      return bucketMatches[0];
    }
  }

  if (preferred === 'artist') {
    if (allowArtist) {
      const bestArtist = getBestArtistCandidate();
      if (bestArtist && (!seenAnswers || !seenAnswers.has(bestArtist.answer))) return bestArtist;
    }
  } else if (preferred === 'title' && candidates.title) {
    if (!seenAnswers || !seenAnswers.has(candidates.title.answer)) return candidates.title;
  } else if (preferred === 'keyword' && (candidates.keyword || candidates.shortKeyword)) {
    const kw = candidates.keyword && (!seenAnswers || !seenAnswers.has(candidates.keyword.answer))
      ? candidates.keyword
      : (candidates.shortKeyword && (!seenAnswers || !seenAnswers.has(candidates.shortKeyword.answer)) ? candidates.shortKeyword : null);
    if (kw) return kw;
  }

  // Fallback priority order:
  // Standard mode: title -> artist -> keyword -> shortKeyword
  // Single-artist mode (allowArtist = false): title -> keyword -> shortKeyword
  if (candidates.title && (!seenAnswers || !seenAnswers.has(candidates.title.answer))) {
    return candidates.title;
  }
  if (allowArtist) {
    const bestArtist = getBestArtistCandidate();
    if (bestArtist && (!seenAnswers || !seenAnswers.has(bestArtist.answer))) {
      return bestArtist;
    }
  }
  if (candidates.keyword && (!seenAnswers || !seenAnswers.has(candidates.keyword.answer))) {
    return candidates.keyword;
  }
  if (candidates.shortKeyword && (!seenAnswers || !seenAnswers.has(candidates.shortKeyword.answer))) {
    return candidates.shortKeyword;
  }

  if (candidates.title) return candidates.title;
  if (allowArtist) return getBestArtistCandidate();
  if (candidates.keyword) return candidates.keyword;
  return null;
}
