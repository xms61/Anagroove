export interface KeywordExtractionResult {
  answer: string;
  clueType: string;
  clueText: string;
}

/**
 * Extracts a clean uppercase A-Z answer word (length 3 to 10) from a song title or artist name.
 */
export declare function extractAnswerKeyword(
  title: string,
  artist: string
): KeywordExtractionResult | null;
