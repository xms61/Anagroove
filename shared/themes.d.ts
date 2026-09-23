export interface Theme {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Values in artists.genres_json that belong to the theme. */
  genres: readonly string[];
  /** Song languages the theme allows. */
  languages: readonly ('en' | 'ja' | 'ko')[];
  /** Deezer playlist searches the crawler harvests for the theme. */
  seeds: readonly string[];
}

export declare const THEMES: readonly Theme[];

/** The theme with this id, or undefined (`mixed` is an old name for `all`). */
export declare function themeById(id: string): Theme | undefined;

/** Genre clusters for a theme id, or for the words of a free-text genre and prompt. */
export declare function genresForPrompt(genre?: string, prompt?: string): string[];
