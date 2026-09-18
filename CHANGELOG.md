# Changelog

All notable changes to the **SpotySpice** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-18

### Added
- **Pure & Steered Randomization Engine**:
  - Full catalog discovery capability unconstrained by top chart rankings or popularity filters.
  - Free-text prompt parser (`server/services/queryBuilder.js`) with regex heuristics extracting decades (`80s`, `1990s`), artist directives (`by Daft Punk`, quotes), popularity modifiers, and custom themes.
  - 4-tier popularity spectrum: `Pure Random` (unfiltered), `Hidden Gems` (indie/obscure cuts), `Balanced` (pleasing mix), and `Top Hits` (chart-toppers).
  - Single-artist steering mode with automatic exemption from 1-track-per-artist variety limits.
- **Natural Song Title Answers (Combined Words Up to 16 Characters)**:
  - Multi-word track titles are now concatenated into natural crossword answers (e.g. *"Your Love"* $\rightarrow$ `YOURLOVE`, *"Don't Stop Believin'"* $\rightarrow$ `DONTSTOPBELIEVIN`, *"Blinding Lights"* $\rightarrow$ `BLINDINGLIGHTS`).
  - Strict 3 to 16 character bounds matching the 22×22 physical crossword grid dimension.
  - Graceful fallback to normalized complete artist names or prominent keywords for titles exceeding 16 letters (e.g. *"Smells Like Teen Spirit"* $\rightarrow$ `NIRVANA`).
- **Multi-Endpoint Music Harvesting**:
  - Integrated iTunes Search API provider (`server/services/itunesMusicProvider.js`) with preview validation, 600×600 artwork resolution, and bounded LRU caching.
  - Coordinated parallel fetching between Deezer and iTunes with canonical track identity deduplication (`canonicalArtistKey + '|' + canonicalTrackKey`).
- **Deterministic Seed Hashing & Sharing**:
  - Deterministic SHA-256 seed hashing ($\text{SHA-256}(\text{seed} + \text{":"} + \text{track.id})$) per architectural blueprint for reproducible puzzle sharing across players.
- **Enhanced Live Generator UI (`src/components/LiveGeneratorModal.tsx`)**:
  - Mode switcher for **Theme Presets** vs. **Steered Prompt & AI**.
  - Quick example prompt chips (*"80s Japanese City Pop"*, *"Songs by Daft Punk"*, *"Classic 70s rock ballads"*, etc.).
  - Popularity spectrum segmented controls.
  - Collapsible advanced steering panel for custom artist targets and deterministic seeds.
- **Automated Test Coverage**:
  - Added 12 new automated test assertions in `scripts/run_tests.js` covering prompt parsing, iTunes track mapping, query plan generation, deterministic seed hashing, and variety rejection sampling (91 tests total).

### Changed
- `shared/musicKeywords.js`: Replaced single-word title extraction with combined multi-word answers up to 16 characters.
- `server/server.js`: `/api/puzzles/live` and `/api/music/random` forward steering parameters (`prompt`, `artist`, `album`, `decade`, `popularity`, `seed`).
- `server/validators.js`: Updated payload schemas to accept and sanitize steering parameters.
- `src/services/dynamicMusicService.ts`: Upgraded `generateLivePuzzle` to accept `LivePuzzleOptions` while preserving backward compatibility.

---

## [1.0.0] - 2026-09-17

### Added
- **Blind Audio Crossword Gameplay**:
  - 30-second audio previews with hidden track and artist titles until victory.
  - Floating 33⅓ RPM vinyl turntable rotating beneath interactive letter tiles.
- **Catalog & Theme Library**:
  - 220+ pre-generated puzzles across 11 curated musical themes (Rock, Pop, Hip-Hop, EDM, K-Pop, Anime, Gaming, Cinematic, Latin, Pop-Punk, Mixed).
- **On-The-Fly Live Crossword Generation**:
  - Real-time placement algorithm generating intersecting crossword grids from live streaming candidates.
- **Real-Time Multiplayer Lounge**:
  - WebSocket lounge supporting Co-Op (collaborative grid solving) and Versus Race modes.
  - Zero-account anonymous player sessions.
- **Multi-Tier Hints & Crate Blacklists**:
  - Reveal letter, solve word, or reveal puzzle hints.
  - Persistent user blacklist for silencing unwanted artists or songs.
- **Full Test Suite & Tooling**:
  - Automated CI-friendly test runner (`scripts/run_tests.js`).
