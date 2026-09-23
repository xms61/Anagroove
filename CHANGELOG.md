# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.28.0] - 2026-09-23

### Changed
- **Menu (`MenuDrawer`, was `LoungeDrawer`):**
  - the current puzzle with "New puzzle, same theme"
  - **Play:** custom puzzle, multiplayer (showing the room code while in one)
  - **You:** songs in this puzzle, history, hidden artists & songs (with the count), settings
  - the keyboard shortcuts
- **All dialogs share one clean layout.** They take the theme's heading face, use plain labels and the shared buttons, and drop their per-dialog accent colours.
  - **Custom puzzle** (Theme / Prompt tabs, popularity, languages, size, and "Artist and seed" folded away).
  - **Multiplayer** (mode, theme, room code, players, start).
  - **Hidden artists & songs** (was "Music Blacklist").
  - **Hint:** three options, each with its shortcut.
  - **History.**
  - **End screen:**
    - the tracklist with previews and the answer
    - a provider link labelled by provider (the "Spotify" fallback label is gone)
    - "Hide artist" / "Hide song" buttons that are always visible instead of appearing only on hover
  - **Room victory.**
- **Confetti** uses the active theme's colours and is skipped when the OS asks for reduced motion.

### Removed
- The "Jazz Kissa & Audio Salon" wording, the generator's info banner and gradient buttons.

---

## [1.27.0] - 2026-09-23

### Changed
- **Header (`AppHeader`):**
  - the name, the puzzle picker, then Hint and **Check** (the only primary button)
  - New, Settings and Menu as icons, with a dot on Menu while in a multiplayer room
  - phones get two rows: the name, Check and Menu, then the picker, Hint, New and Settings
- **Clue list:**
  - one badge style per theme instead of a colour per clue
  - theme headings: ヨコのカギ / タテのカギ, WAAGERECHT / SENKRECHT, Side A / Side B
  - Across/Down tabs on phones
- **Player:**
  - one docked row, with the theme's deck: a car-radio display with level bars, a step sequencer that fills with playback, or a turntable whose tonearm moves in as the preview plays
  - the seek bar is now a keyboard-accessible slider
  - "Preview unavailable" is an icon with a label instead of a pill that overflowed on phones
  - a blocked autoplay no longer shows as an error
- **Page:**
  - the loading and error states use plain wording ("Picking songs…", "Couldn't build a puzzle")
  - the race leaderboard is a slim bar
  - the page reserves the player's height, so it no longer covers the last clue on phones

### Added
- `ui.tsx`: `Button`, `IconButton` (a label is required), `Panel` and `cx`.
- `only-city` / `only-berlin` / `only-vinyl` wrappers for theme-specific markup.
- The smoke test checks that the last clue can scroll into view above the player on a 375 px phone.

### Removed
- The -5 s / +5 s buttons (the slider seeks), the spinning disc logo, and the unused `isPlaying` grid prop and animation helpers.

---

## [1.26.0] - 2026-09-23

### Added
- **Three themes, picked in Settings:**
  - **Tokyo Rain:** navy, neon pink and cyan, falling rain, a vertical katakana sign.
  - **Berlin Concrete:** graphite, U-Bahn yellow, square corners, a faint site grid.
  - **Vinyl Room:** walnut, brass and cream paper cells.
- **How the theme is stored and applied:**
  - Saved with the other settings (`useSettings`); unknown values fall back to Tokyo Rain.
  - `public/theme-boot.js` applies it before the app loads, so there is no colour flash.
  - Each theme brings its own heading face (Zen Kaku Gothic New, Barlow Condensed, Fraunces), self-hosted; browsers download only the active one.
- A lint rule rejects raw Tailwind colours and hex literals in components.
- **Tests:**
  - a Vitest test for the theme setting and its fallback
  - a Playwright check that the picked theme applies and survives a reload

### Changed
- **One token set for all colours.** `src/themes.css` holds each theme's colours, radii, shadows and fonts. Every component uses the semantic Tailwind names (`bg-panel`, `text-muted`, `border-line`, `bg-accent`, …) instead of about 650 raw colour classes.
- **The grid** takes its cell colours from the theme:
  - the active word is highlighted and the cursor cell stands out
  - wrong letters get a strike mark as well as a colour
  - cells size themselves to the board, so the grid fits a 375 px phone
  - the spinning vinyl disc behind it is gone
- **Settings** is simpler: theme, default volume, word animations and the keyboard shortcuts.
- A new favicon.

### Removed
- The `kissa.*`, `spotifyGreen` and legacy colour tokens, the coloured glow shadows, and unused CSS helpers (`vu-needle`, `focus-glow-amber`, `pulse-subtle`, `filament`).

---

## [1.25.0] - 2026-09-23

### Changed
- **The app is now called Anagroove** (anagram + groove): page title, header, menu footer, server and WebSocket logs, script banners, the crawler's and image service's User-Agents, the npm package name, the Docker image, container, service and system user, and the release workflow.
- **Kept on purpose:**
  - browser storage keys (`spotyspice_*`), so players keep their progress, settings and hidden list
  - env vars (`SPOTYSPICE_*`), so existing `.env` files and CI keep working
  - the Docker volume `spotyspice_data`, so deployments keep their data
  - `AGENTS.md` and the README say so
- Test temp dirs are now `anagroove-*`. The smoke test checks the page title.
- `CHANGELOG.md` keeps the five latest releases; 1.15.0–1.20.1 moved to `docs/CHANGELOG-archive.md`.

---

## [1.24.1] - 2026-09-23

### Changed
- **`App.tsx`: 649 → 534 lines.**
  - One `openDialog` value replaces seven `isXOpen` booleans (only one dialog can be open).
  - `loadPuzzle` replaces five copies of "show the puzzle, reset the grid, store it".
  - `adoptConfig` replaces two copies of the config bookkeeping.
- **`useMultiplayer`** (new hook) holds the room, the teammate's last cell, the winner, the WebSocket listeners and the create/join/start actions that were inline in `App.tsx`.
- **`catalogReport.js` replaces `catalogValidator.js` (713 → 170 lines).** The validator recomputed integrity, orphans, duplicate groups, durations and contamination that the gate and the cleanup dry run already report, and its popularity statistics still assumed Deezer ranks. The report now combines the gate, the cleanup dry run and the statistics the gate doesn't compute: coverage, languages, decades, popularity percentiles, genres and the most prolific artists.
- Checked with the Playwright smoke test (generate, type every answer, solve, 375 px layout) and `db:validate` on a copy of the real catalog.

---

Older releases (1.24.0 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
