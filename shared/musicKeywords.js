/**
 * Extracts candidate crossword answers (Song title, Artist name, or Title keyword),
 * capped at 14 characters, supporting variable clue distributions.
 *
 * @param {string} title - Track title
 * @param {string} artist - Artist or band name
 * @param {{ preferredType?: 'title' | 'artist' | 'keyword' } | string} [options]
 * @returns {{ answer: string, clueType: string, clueText: string } | null}
 */
import { toCrosswordAnswer } from './musicIdentity.js';

export function extractAllAnswerCandidates(title, artist) {
  if (!title || !artist) return null;

  const cleanTitle = String(title)
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  // Combined full song title (3 to 14 letters)
  // e.g. "Your Love" -> "YOURLOVE" (8), "Blinding Lights" -> "BLINDINGLIGHTS" (14)
  const combinedTitle = toCrosswordAnswer(cleanTitle, { minLength: 3, maxLength: 14 });
  const titleCandidate = combinedTitle ? {
    answer: combinedTitle,
    clueType: 'Song title',
    clueText: `Iconic track title (${combinedTitle.length} letters)`
  } : null;

  // Complete normalized artist name (3 to 14 letters)
  // e.g. "Adele" -> "ADELE" (5), "Daft Punk" -> "DAFTPUNK" (8)
  const artistAnswer = toCrosswordAnswer(artist, { minLength: 3, maxLength: 14 });
  const artistCandidate = artistAnswer ? {
    answer: artistAnswer,
    clueType: 'Artist name',
    clueText: `Celebrated performer of this track (${artistAnswer.length} letters)`
  } : null;

  // Prominent single keyword from multi-word title (4 to 10 letters)
  let keywordCandidate = null;
  const normalizedWords = cleanTitle
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => toCrosswordAnswer(w, { minLength: 4, maxLength: 10 }))
    .filter(Boolean);

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
  }

  return {
    title: titleCandidate,
    artist: artistCandidate,
    keyword: keywordCandidate,
  };
}

export function extractAnswerKeyword(title, artist, options = {}) {
  const candidates = extractAllAnswerCandidates(title, artist);
  if (!candidates) return null;

  const preferred = typeof options === 'string' ? options : options?.preferredType;
  if (preferred && candidates[preferred]) {
    return candidates[preferred];
  }

  // Fallback priority order if no preferred type specified or not available
  return candidates.title || candidates.artist || candidates.keyword || null;
}
