# Frontend & UI

React 19 + TypeScript + Vite (dev on :3000, proxying `/api`, `/ws`, and `/audio` to :3001). Tailwind CSS, `lucide-react` icons, `canvas-confetti`, self-hosted fonts (`@fontsource`), three switchable themes.

## Structure
- `App.tsx`: top-level state, the grid + clue layout, and all modals.
- `hooks/`:
  - `useCrosswordGame.ts`: grid state, cursor, validation, hints, progress, and solve time for history.
  - `useBlacklist.ts`: local + server blacklist sync.
  - `useMultiplayer.ts`: room state over the WebSocket (room, teammate's last cell, winner) and the create/join/start actions. The game's reactions (`onPuzzle`, `onCoopLetter`, …) are read through a ref, so the hook runs before `useCrosswordGame`, which needs the room.
- `App.tsx` keeps one `openDialog` value (one dialog at a time) and loads every puzzle through `loadPuzzle`, which resets the grid and stores it for reloads.
  - `useSettings.ts`: the single settings source (`readSettings()` for non-React readers).
  - `useDialog.ts`: dialog focus/Esc behavior.
- `services/`:
  - `apiClient.ts`: REST calls plus the anonymous user id.
  - `socketService.ts`: WS client.
  - `dynamicMusicService.ts`: live puzzle requests and recent-song history.
  - `storage.ts`: guarded storage.
  - `audioSource.ts`
- `components/`:
  - `AppHeader`: name, puzzle picker, Hint, Check (the only primary button), New, Settings and Menu. On phones it uses two rows (flex `order`).
  - `CrosswordGrid`
  - `ClueList`: two columns, or Across/Down tabs below `md`. The headings change per theme.
  - `AudioPlayerBar`: docked at the bottom, with `PlayerDeck` (radio display, step sequencer or turntable, following the theme), a seek slider and volume.
  - `MenuDrawer`: the current puzzle, then Play (custom puzzle, multiplayer), You (songs in this puzzle, history, hidden artists & songs, settings) and the keys.
  - `ThemeBackdrop`
  - `ui.tsx`: `Button` (primary/secondary/ghost/danger), `IconButton` (`label` required), `Panel` and `cx`. Use them instead of restyling buttons and surfaces.
  - `Modal` (shared shell)
  - the modals: `LiveGenerator` ("Custom puzzle"), `Multiplayer`, `Blacklist` ("Hidden artists & songs"), `Hint`, `EndScreen` (the solved puzzle's tracklist), `History` (all solved puzzles), `Settings`, plus the room victory dialog in `App.tsx`.
  - Dialogs share one layout: a `font-display` title and a one-line muted description, sections labelled in small caps, `Button`s in the footer. Labels are plain ("Hint", "Hidden artists & songs"), and actions that used to appear only on hover are always visible.
- Puzzle types (`Song`, `Clue`, `Puzzle`, `CellValidity`, …) live in `shared/types.ts`, shared with the server that builds the puzzles. The client imports the shared modules directly (e.g. `canonicalArtistKey`, so recent-artist keys match the server).

## Styling
- **Themes:** three dark themes, picked in Settings: `city` (Tokyo Rain), `berlin` (Berlin Concrete) and `vinyl` (Vinyl Room).
  - `src/themes.ts` lists them, and `useSettings` stores the choice (unknown values fall back to `city`).
  - `App` sets `html[data-theme]`. `public/theme-boot.js` sets it before the bundle loads (the CSP blocks inline scripts), and `index.html` inlines each theme's page colour, so the first paint is right.
- **Tokens only.**
  - `src/themes.css` defines each theme's colours, radii, shadows and display font as CSS variables.
  - `tailwind.config.js` exposes them as `bg`, `surface`, `panel`, `glass` (panel with the theme's translucency), `raised`, `fg`, `muted`, `accent`/`on-accent`, `hi`/`on-hi`, `ok`, `bad`, the grid colours (`cell`, `cell-fg`, `cell-num`, `word`, `cursor`, `cursor-fg`, `ok-cell`, `bad-cell`), the borders `line`/`cell-line`/`word-line`, `rounded-panel`/`rounded-control`/`rounded-cell` and `shadow-panel`/`shadow-accent`/`shadow-cursor`.
  - ESLint rejects raw Tailwind colours (`text-slate-400`, `bg-amber-500`, …) and hex literals in `.tsx` files.
  - Colours that come from data (a player's colour) go in `style`, with `rgb(var(--c-accent))` as the fallback.
- **Headings** use `font-display` (`index.css`): the theme's face, weight, style, case and spacing.
- **Theme-only markup** goes in `only-city` / `only-berlin` / `only-vinyl` wrappers (`themes.css`): the active theme's wrapper renders as `display: contents`, the others are hidden. `ThemeBackdrop` (rain and neon, a site grid, a lamp glow), `PlayerDeck` and the clue headings use them. Decoration is `aria-hidden`.
- **Fonts:**
  - Plus Jakarta Sans (body) and JetBrains Mono (numbers), plus one display face per theme: Zen Kaku Gothic New, Barlow Condensed, Fraunces italic.
  - All are Latin subsets from `@fontsource`, imported in `main.tsx`. A browser only downloads a face the active theme uses.
  - The CSP allows `font-src 'self'` only. CJK text uses system fonts.
- **Readability:**
  - Every theme keeps body and `muted` text at WCAG AA on its surfaces.
  - The minimum text size is `text-xs` (12 px); clue text is `text-sm` (14 px). The exception is the grid's cell numbers.
- **Motion:** `prefers-reduced-motion` stops the rain, spinners, equalizer bars and the letter pop (`index.css`, `themes.css`).
- **Mobile:** the grid sizes its cells from its container (20–44 px) and scrolls inside its board if it still doesn't fit. The page reserves the docked player's height (`pb-28`), so the last clue scrolls into view above it. The page must not scroll horizontally at 375 px (both checked by the smoke test).

## Rules
- **Every dialog uses `<Modal>`**, which gives it:
  - `role="dialog"` and `aria-modal`
  - `aria-labelledby`/`aria-describedby` via the `titleId`/`descriptionId` render props
  - a focus trap, Esc and backdrop close, and focus returned to the opener
  - a built-in labelled close button (`closeLabel={null}` hides it)

  Pass the accent border color in `className`. Drawers use `useDialog` directly. Put `data-autofocus` on the element that should receive focus first.
- Icon-only buttons need an `aria-label`. Decorative icons get `aria-hidden`. Toggle buttons use `aria-pressed`.
- **Storage:** go through `services/storage.ts` (`readString`/`writeString`/`readJson`/`writeJson`, `STORAGE_KEYS`) and never touch `localStorage` directly. Storage may be blocked or hold corrupt JSON. The user id in `apiClient.ts` has its own guarded reader.
  - Keys: `spotyspice_user_id`, `spotyspice_settings`, `spotyspice_active_genre`, `spotyspice_active_config`, `spotyspice_active_live_puzzle`, `spotyspice_recent_songs`, `spotyspice_player_name`, `spotyspice_local_blacklist`.
- **Settings:** read and write through `useSettings()`/`readSettings()`. Don't parse `spotyspice_settings` in components.
- **Language filter:** the live generator's EN/JA/KO chips send `languages` (a subset of en/ja/ko; empty means the theme decides). The server applies it to the catalog window and the picker.
- **Themes:** the generator and multiplayer theme pickers render `THEMES` from `shared/themes.ts`. A saved theme id that no longer exists (the removed "latin") falls back to Mixed (`knownThemeOr` in `App.tsx`).
- **Audio:** play through `playableAudioUrl(song)` (`services/audioSource.ts`). It keeps `/api/preview/...` and `/audio/...` paths and rebuilds a stable path for older saved puzzles that hold expiring Deezer URLs.
- **Multiplayer:** `socketService` remembers the room seat (`resumeToken`) and rejoins on reconnect. A `room_joined` with `resumed: true` must not reset local progress.
- **Grid key handlers** build the next grid from the rendered state (`withCell`) for their checks and saves, and apply it with a functional `setUserLetters`. Never read values out of a state updater: React may run it later, and the handler then sees an empty grid.
- **Tests:** hooks are tested with Vitest + React Testing Library (`src/**/*.test.ts`, fixtures in `src/test/`), and the full flow with a Playwright smoke test. See `scripts/tests/TESTING.md`.
- `npm run build` runs `tsc` in strict mode, then `vite build`.
