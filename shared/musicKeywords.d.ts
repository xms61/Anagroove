export interface KeywordExtractionResult {
  answer: string;
  clueType: string;
  clueText: string;
  artistName?: string;
  isCollaboration?: boolean;
}

export interface ExtractKeywordOptions {
  preferredType?: 'title' | 'artist' | 'keyword';
  allowArtist?: boolean;
  seenAnswers?: Set<string>;
  artistIndex?: number;
  targetLengthBucket?: 'short' | 'medium' | 'long';
}

export declare function isSingleEntityArtist(artistName: string): boolean;
export declare function splitArtistNames(artistName: string): string[];

/**
 * Extracts a title keyword, falling back to a complete normalized artist name.
 */
export declare function extractAnswerKeyword(
  title: string,
  artist: string,
  options?: ExtractKeywordOptions | string
): KeywordExtractionResult | null;
