# Changelog

All notable changes to the **SpotySpice** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-09-18

### Added
- **Extended Structured Server Logging (`server/logger.js`)**:
  - **Subsystem Categorization**: Contextual tagging across the backend stack (`[STARTUP]`, `[API]`, `[HARVEST]`, `[SAMPLING]`, `[CROSSWORD]`, `[STORE]`, `[WS]`, `[ROOM]`).
  - **ISO Timestamps & Colorized TTY Levels**: High-visibility console output (`DEBUG`, `INFO`, `WARN`, `ERROR`) with automatic TTY color detection and `NO_COLOR` compliance.
  - **Runtime Log Level Filtering**: Configurable via `LOG_LEVEL` environment variable (`debug`, `info`, `warn`, `error`).
  - **Deep Rejection Sampling Telemetry**: Real-time breakdown of candidate filtering metrics, pinpointing why tracks were discarded (recency, blacklist, non-English language markers, artist duplicates, title duplicates, and answer collisions).
  - **Clue Distribution Visibility**: Logs exact clue type distributions across generated song pools (`Title`, `Artist`, `Keyword`).
  - **Crossword Layout & Token Diagnostics**: Tracks layout generation execution time (ms), grid dimensions, word placement ratios, and live token lifecycle events.
  - **Multiplayer WebSocket Event Tracing**: Room creation, joins, game starts, disconnections, and cleanup logged with player and room metadata.

---

## [1.1.0] - 2026-09-18

### Added
- **Dynamic Catalog Discovery (Zero Predetermined Lists)**:
  - Completely removed hardcoded artist lists, predetermined songs, and dictionary seed words to prevent repetitive output on requerying.
  - Dynamically randomized query exploration via random pagination offsets (`index`), randomized sort orders (`RANKING`, `TRACK_ASC`, `RATING_ASC`, `DURATION_ASC`), and uniform phonetic letter sampling for open catalog queries.
- **Genre Fidelity & Anime Search Precision**:
  - Eliminated generic English seed word pollution from genre searches. Selecting `anime` strictly queries anime soundtracks, openings, and Japanese animation music without unrelated pop songs.
- **English Language Enforcement (Except Anime & K-Pop)**:
  - Non-anime/non-kpop categories (Pop, Rock, Hip-Hop, EDM, etc.) are strictly filtered to the English language, discarding non-Latin scripts and foreign language tracks.
  - Explicitly permits Japanese soundtracks and artists for **Anime** and Korean tracks for **K-Pop**.
  - Localized iTunes queries with `country=US` and `lang=en_us` for English themes.
- **Balanced Clue Type Variance**:
  - Puzzles now feature an engaging, intentional balance of question types: **~40% Song Title**, **~40% Artist Name**, and **~20% Song Title Keyword**.
  - Clue types cycle across the crossword (`extractAnswerKeyword` accepts `preferredType`), with automatic graceful fallback.
- **14-Character Song Title Cap**:
  - Reduced combined song title maximum length from 16 to **14 characters** (3 to 14 letters), perfectly suited for standard physical crossword dimensions (e.g. `YOURLOVE`, `GETLUCKY`, `BLINDINGLIGHTS`).
  - Longer titles fall back to artist name (3 to 14 chars) or prominent title keyword (4 to 10 chars).
- **Duplicate Title Exclusion**:
  - Candidate pool rejection sampling tracks canonical song titles (`seenTitles`) in addition to tracks, artists, and answers, preventing duplicate or cover song titles in the same puzzle.
- **Prompt Parser & Multi-Endpoint Harvesting**:
  - Free-text prompt parser (`server/services/queryBuilder.js`) extracting decades, artist directives, and popularity spectrums.
  - iTunes search provider integration (`server/services/itunesMusicProvider.js`) with 600×600 album artwork and preview verification.
  - Deterministic SHA-256 seed hashing for reproducible puzzle sharing.
- **Manual CI/CD Release Pipeline (`.github/workflows/manual-release.yml`)**:
  - Added on-demand GitHub Actions workflow (`workflow_dispatch`) that runs ESLint, executes all 100 tests, builds the production Docker image, tags the git commit, extracts changelog notes, and generates the GitHub release.
- **Automated Test Coverage**:
  - Expanded automated test suite in `scripts/run_tests.js` to 100 passing tests covering 14-char limits, clue variance, language permission checks, anime genre isolation, and duplicate title exclusions.

### Changed
- `Dockerfile`: Added `COPY shared/ ./shared/` in runner stage to ensure shared modules are available at runtime.
- `package.json`: Bumped version to `1.1.0`.
- `shared/musicKeywords.js`: Updated combined song title answer cap to 14 letters; added candidate extraction supporting preferred clue types (`extractAllAnswerCandidates`, `extractAnswerKeyword`).
- `server/services/queryBuilder.js`: Replaced hardcoded seed words with dynamic entropy; ensured genre queries are never contaminated with unrelated search terms.
- `server/services/deezerMusicProvider.js`: Removed generic Asian pop chart 16 for anime; configured targeted anime and soundtrack searches.
- `server/services/musicService.js`: Added `isLanguagePermitted`, duplicate title rejection, and clue type rotation across crossword pools.

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
