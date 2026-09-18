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
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  const titleWords = cleanTitle.split(/\s+/).filter(w => w.length >= 3 && w.length <= 10);

  // Strategy 1: Single-word song title
  if (titleWords.length === 1 && /^[a-zA-Z]{3,10}$/.test(titleWords[0])) {
    const candidate = titleWords[0].toUpperCase();
    return {
      answer: candidate,
      clueType: 'Song title',
      clueText: `Iconic hit single (${candidate.length} letters)`
    };
  }

  // Strategy 2: Multi-word title prominent word (longest word)
  if (titleWords.length > 1) {
    const sorted = [...titleWords].sort((a, b) => b.length - a.length);
    const candidate = sorted[0].toUpperCase();
    return {
      answer: candidate,
      clueType: 'Song title keyword',
      clueText: `Key word in this legendary track (${candidate.length} letters)`
    };
  }

  // Strategy 3: Complete artist answer. Never drop words from a display name.
  const candidate = toCrosswordAnswer(artist);
  if (candidate) {
    return {
      answer: candidate,
      clueType: 'Artist name',
      clueText: `Celebrated performer of this hit (${candidate.length} letters)`
    };
  }

  return null;
}
