/**
 * Types shared across the server's selection, policy and provider modules. Puzzle types the
 * client also uses live in shared/types.ts.
 */

/** A closed or open year range; either end may be missing. */
export interface YearRange {
  start?: number;
  end?: number;
}

/**
 * A song as it moves through selection: a catalog row, a live provider result or an anime
 * theme. Which fields are set depends on the source; extra provider fields pass through.
 */
export interface SongCandidate {
  id: string;
  title: string;
  artist: string;
  album?: string;
  provider?: string;
  providerTrackId?: string | number;
  providerArtistId?: string | number | null;
  catalogTrackId?: number;
  language?: string | null;
  popularity?: number | null;
  rank?: number | null;
  fans?: number;
  release_year?: number | null;
  releaseYear?: number | null;
  releaseDate?: string | null;
  release_date?: string | null;
  durationMs?: number | null;
  duration_ms?: number | null;
  isrc?: string | null;
  audioUrl?: string;
  sample_url?: string;
  previewRef?: string | null;
  providerUrl?: string | null;
  albumArt?: string;
  imageUrl?: string;
  genre?: string;
  isAnimeOped?: boolean;
  animeTitle?: string;
  themeSlug?: string;
  themeType?: string;
  /** Catalog and iTunes spellings of the same fields */
  display_title?: string;
  display_name?: string;
  album_name?: string | null;
  collectionName?: string;
  selection?: { source?: string; rank?: number; artistFans?: number; genre?: string; releaseDate?: string; storefront?: string };
  [field: string]: unknown;
}

/** Any object with some song fields: policy checks accept partial and unknown shapes. */
export type TrackLike = Partial<SongCandidate> | null | undefined;
