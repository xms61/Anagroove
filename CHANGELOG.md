# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.28.3] - 2026-09-23

### Changed
- **`shared/` is TypeScript:** `clueGenerator`, `liveCrossword`, `musicKeywords`, `shuffle` and `themes` are `.ts` files, run by Node directly.
  - Their hand-written `.d.ts` files are gone, so the declarations can't drift from the code any more.
  - `musicIdentity.js` follows later: the running catalog enrichment loads it.
- **`shared/types.ts`** holds the puzzle types (`Song`, `Clue`, `Puzzle`, `CellValidity`, …). It replaces `src/types/crossword.ts`, and the server and client now share it.
- **New exported types:** `LiveSong` and `LiveCrosswordOptions` (grid generator), `AnswerCandidate`, `ExtractKeywordOptions` and `ClueType` (answer extraction), `ClueTrack`/`ClueKeyword` (clue formatting), `Theme` and `SongLanguage`.
- **Removed unused call forms:** `extractAnswerKeyword` no longer accepts its options as a bare string, and `formatCrosswordClue` drops the options argument it never used. No caller used either.
- **Tests:** the `themes`, `clueSystem`, `musicKeywords` and `crosswordEngine` tests are TypeScript.

---

## [1.28.2] - 2026-09-23

### Changed
- **TypeScript setup for the server, shared modules and scripts** (first step of moving them from JavaScript).
  - Node 24 runs `.ts` files directly by stripping the types. There is no build step, and `tsc` only type-checks.
  - The new `tsconfig.node.json` checks `server/`, `shared/` and `scripts/`:
    - `nodenext` resolution
    - `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties
    - `verbatimModuleSyntax`: type-only imports use `import type`
    - relative imports name the `.ts` file
    - `strict`
  - While files move, `.js` files are read for their types but not checked.
- `npm run typecheck` checks both projects. The frontend config now targets ES2022, and also checks the Playwright smoke test.
- `npm test`, c8 and ESLint accept `.ts` files next to `.js`.
- Dev dependencies: `@types/node` 24 (was 22, only installed as a sub-dependency) and `@types/express` 4 (was 5, which didn't match Express 4.22).
- `AGENTS.md` lists the TypeScript rules for new server, shared and script code.

---

## [1.28.1] - 2026-09-24

### Changed
- The crawler's, the anime sync script's and the anime image service's User-Agents now link to the renamed repository (`github.com/xms61/Anagroove`); the image service's had no contact URL before.

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

Older releases (1.26.0 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
