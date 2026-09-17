/**
 * Extracts a clean uppercase A-Z answer word (length 3 to 10) from a song title or artist name.
 * Canonical implementation shared across backend music services and frontend generators.
 *
 * @param {string} title - Track title
 * @param {string} artist - Artist or band name
 * @returns {{ answer: string, clueType: string, clueText: string } | null}
 */
export function extractAnswerKeyword(title, artist) {
  if (!title || !artist) return null;

  const cleanTitle = String(title)
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .trim();

  const titleWords = cleanTitle.split(/\s+/).filter(w => w.length >= 3 && w.length <= 10);
  const cleanArtist = String(artist).replace(/[^a-zA-Z\s]/g, '').trim();
  const artistWords = cleanArtist.split(/\s+/).filter(w => w.length >= 3 && w.length <= 10);

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

  // Strategy 3: Artist name keyword
  if (artistWords.length > 0) {
    const candidate = artistWords[0].toUpperCase();
    return {
      answer: candidate,
      clueType: 'Artist name',
      clueText: `Celebrated performer of this hit (${candidate.length} letters)`
    };
  }

  return null;
}
