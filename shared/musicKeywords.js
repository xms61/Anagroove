/**
 * Extracts a title keyword, falling back to a complete normalized artist name.
 *
 * @param {string} title - Track title
 * @param {string} artist - Artist or band name
 * @returns {{ answer: string, clueType: string, clueText: string } | null}
 */
import { toCrosswordAnswer } from './musicIdentity.js';

export function extractAnswerKeyword(title, artist) {
  if (!title || !artist) return null;

  const cleanTitle = String(title)
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  // Strategy 1: Combined full song title (up to 16 letters)
  // e.g. "Your Love" -> "YOURLOVE", "Don't Stop Believin'" -> "DONTSTOPBELIEVIN"
  const combinedTitle = toCrosswordAnswer(cleanTitle, { minLength: 3, maxLength: 16 });
  if (combinedTitle) {
    return {
      answer: combinedTitle,
      clueType: 'Song title',
      clueText: `Iconic track title (${combinedTitle.length} letters)`
    };
  }

  // Strategy 2: If the combined title exceeds 16 letters (too long),
  // fall back to complete artist answer if within 3 to 16 characters.
  const artistCandidate = toCrosswordAnswer(artist, { minLength: 3, maxLength: 16 });
  if (artistCandidate) {
    return {
      answer: artistCandidate,
      clueType: 'Artist name',
      clueText: `Celebrated performer of this track (${artistCandidate.length} letters)`
    };
  }

  // Strategy 3: Clean prominent single keyword from multi-word title (4 to 12 chars)
  const normalizedWords = cleanTitle
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => toCrosswordAnswer(w, { minLength: 4, maxLength: 12 }))
    .filter(Boolean);

  if (normalizedWords.length > 0) {
    const sorted = [...normalizedWords].sort((a, b) => b.length - a.length);
    const candidate = sorted[0];
    return {
      answer: candidate,
      clueType: 'Song title keyword',
      clueText: `Key word in this track title (${candidate.length} letters)`
    };
  }

  return null;
}
