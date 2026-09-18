export interface KeywordExtractionResult {
  answer: string;
  clueType: string;
  clueText: string;
}

/**
 * Extracts a title keyword, falling back to a complete normalized artist name.
 */
export declare function extractAnswerKeyword(
  title: string,
  artist: string
): KeywordExtractionResult | null;
