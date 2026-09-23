/** The UI themes. Colours, radii and fonts live in `themes.css`, keyed by `html[data-theme]`. */
export const THEMES = [
  { id: 'city', label: 'Tokyo Rain', description: 'Neon signs on wet streets, late at night' },
  { id: 'berlin', label: 'Berlin Concrete', description: 'Raw concrete, station signs and one yellow line' },
  { id: 'vinyl', label: 'Vinyl Room', description: 'A warm listening room with the record on' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'city';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(theme => theme.id === value);
}

/** Shows the theme on the page; `public/theme-boot.js` does the same before the app loads. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
}
