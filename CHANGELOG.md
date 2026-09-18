# Changelog

All notable changes to the **SpotySpice** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.5] - 2026-09-18

### Fixed
- **Multi-Artist Collaboration Separation & Title Concatenation Prevention (`shared/musicKeywords.js`, `shared/musicIdentity.js`, `server/services/musicService.js`)**:
  - Prevented collaborating artists from being combined into a single concatenated crossword answer like a title (e.g. `Ski Aggu & Sira` is no longer combined into `SKIAGGUSIRA`).
  - Added intelligent multi-artist parser (`splitArtistNames`, `isSingleEntityArtist`) recognizing distinct collaborators (`Ski Aggu` or `Sira`, `Drake` or `21 Savage`, `David Guetta` or `Bebe Rexha`).
  - Generated distinct candidate clues for each artist (`Lead performer` vs `Co-performer`), allowing graceful fallback between collaborators on the grid before falling back to song titles or keywords.
  - Tracked all individual collaborating artist identities in `seenArtists` to guarantee variety and prevent duplicate artist appearances across the crossword.
- **Single-Entity Band Ampersand Expansion to "AND" (`shared/musicIdentity.js`, `shared/musicKeywords.js`)**:
  - When an artist or group is a single entity with `&` (e.g. `Above & Beyond`, `Mumford & Sons`, `Kool & The Gang`, `Bob Marley & The Wailers`, `Of Mice & Men`), the `&` is expanded to `AND` (`ABOVEANDBEYOND`, `MUMFORDANDSONS`, `KOOLANDTHEGANG`) rather than being stripped out.
  - Expanded `&` to `AND` in song titles as well (e.g. `Rock & Roll` -> `ROCKANDROLL`).
  - Unified `canonicalMusicKey` to map `&` and `+` to `and` for consistent search and blacklisting comparisons.
- **Automated Test Suite Expansion (`scripts/run_tests.js`)**:
  - Added 20 automated unit assertions covering multi-artist splitting, collaboration clue generation, single-entity band identification, and ampersand expansion, bringing the test suite to **192 passing tests**.

---

## [1.4.4] - 2026-09-18

### Added
- **Hint Hotkeys (<kbd>Space</kbd> for Letter, <kbd>Tab</kbd> for Word) (`src/components/CrosswordGrid.tsx`, `src/components/HintModal.tsx`, `src/App.tsx`, `src/hooks/useCrosswordGame.ts`)**:
  - Bound <kbd>Space</kbd> to instantly reveal the letter at the current cursor cell, validate it, and automatically advance the cursor to the next empty cell in the active word.
  - Bound <kbd>Tab</kbd> to instantly fill and reveal the entire active word and automatically advance to the next clue.
  - Added visual keyboard badges (`<kbd>Space</kbd>` and `<kbd>Tab</kbd>`) inside `HintModal.tsx` and updated the header hint button tooltip.
  - Added real-time co-op synchronization for hints in multiplayer rooms.
- **Universal Remaster / Reissue Historical Vintage Detection (`server/services/musicService.js`)**:
  - Implemented regex vintage parser detecting original release stamps in track/album metadata (e.g. `(YYYY Remaster)`, `(Remastered YYYY)`, `(Live YYYY)`).
  - Automatically evaluates true musical vintage against requested temporal bounds, preventing legacy songs re-released recently (e.g. deathcore remasters) from falsely qualifying for contemporary prompts (`2020-2026`).
- **Cross-Theme Semantic Prefix & Homonym Guardrails (`server/services/musicService.js`, `server/services/queryBuilder.js`)**:
  - **Anime**: Filtered out Deezer prefix stem collisions matching `anim*` (`Animal Collective`, `Techno Animal`, `Animosity`, `Os Abelhudos - As Crianças e os Animais`), filtered hardcore techno DJ *AniMe*, and rejected Apple Music JP storefront leakage (K-Pop singles like *TWICE*).
  - **High-Intent Compound Anime Searches**: Upgraded search generation to query `"anime opening"`, `"anime ost"`, `"anime theme"` instead of bare `"anime"`.
  - **Gaming / Video Games**: Filtered out rapper *The Game* and non-gaming stem collisions (e.g. *Gamin*).
  - **Pop-Punk**: Filtered out electronic act *Daft Punk*.
  - **EDM / Dance**: Filtered out post-hardcore band *Dance Gavin Dance* and Tina Turner's *Private Dancer*.
  - **Latin**: Filtered out British 80s new wave band *Latin Quarter*.
- **Accurate Provider Badge Display (`src/components/EndScreenModal.tsx`)**:
  - Updated puzzle solve screen to display **"Apple Music"** with distinct rose badge styling when tracks originate from the iTunes/Apple Music provider, avoiding misleading "Spotify" badges.
- **Comprehensive Automated Test Expansion (`scripts/run_tests.js`)**:
  - Added 17 unit tests verifying cross-theme guardrails, remaster vintage detection, and storefront leakage, bringing the test suite to **172 passing tests**.

---

## [1.4.3] - 2026-09-18

### Changed
- **Audio Preamp Deck & End-Screen Base Volume Set to 25% (`src/components/AudioPlayerBar.tsx`, `src/components/EndScreenModal.tsx`)**:
  - Calibrated default audio playback volume to a comfortable 25% (0.25) across all preview players.
  - Initialized volume immediately upon audio element mount and clue transitions.
- **CI Test Suite Optimization (`.github/workflows/ci.yml`, `.github/workflows/manual-release.yml`)**:
  - Configured automated CI workflow to execute linting and the 155-case automated test suite (`npm test`) on every push and pull request, omitting the live network-harvesting prompt suite.
  - Reserved the 14-scenario multi-prompt crossword suite for manual execution via workflow dispatch (`run_prompt_suite: false` by default in `manual-release.yml`) or local CLI (`npm run test:prompts` / `npm run test:all`).

---

## [1.4.2] - 2026-09-18

### Added
- **Complete Test Suite Automation in Workflows & CI Pipeline**:
  - **CI Workflow (`.github/workflows/ci.yml`)**: Added automated CI workflow triggering on every `push` and `pull_request` to `main`, running ESLint, the 155-case automated test suite (`npm test`), and the 14-case live multi-prompt crossword verification suite (`npm run test:prompts`).
  - **Release Workflow Enhancement (`.github/workflows/manual-release.yml`)**: Configured `run_prompt_suite` to run by default (`default: true`), guaranteeing all tests execute before any Docker image build or GitHub Release creation.
  - **NPM Script Unification (`package.json`)**: Added `npm run test:all` and updated `npm run test:ci` to execute both linting, unit/integration tests, and prompt verification end-to-end.
- **Crossword Placement Engine & Full Multiplayer Sync Tests (`scripts/run_tests.js`)**:
  - **Live Crossword Placement Tests**: Validated bounding box computations, coordinate constraints, and non-empty placement grids directly in the automated test suite.
  - **Complete 2-Player Live Synchronization**: Validated the entire multiplayer lifecycle (host room creation, guest room join, synchronized game start, real-time co-op cell update broadcast, and versus race progress update).
  - Test suite expanded from 145 to **155 passing tests**.

---

## [1.4.1] - 2026-09-18

### Added
- **Multi-Prompt Crossword Generation Suite Expansion (`scripts/test_prompts_crossword_suite.js`)**:
  - Expanded automated crossword generation suite to 14 comprehensive test prompts.
  - Added dedicated test scenarios for:
    - **Single Artist**: `songs by Daft Punk` (asserts 0% artist name clues, 100% title/keyword clues, and multi-track selection).
    - **Temporal Range**: `anime from the years 2020-2026` (asserts 100% temporal fidelity within 2020-2026 and homonym protection).
    - **Temporal Upper Bound**: `grunge before 1994` (asserts 100% temporal fidelity strictly $\le 1993$).
    - **Temporal Range Bounds**: `rock between 1970 and 1976` (asserts 100% temporal fidelity within 1970-1976).
  - Achieved **100% suite pass rate (14/14)** with 10/10 words placed on every grid.

---

## [1.4.0] - 2026-09-18

### Added
- **Temporal Prompt Parsing & Release Date Validation (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - **Multi-Dimensional Temporal Parsing**: Full support for date spans (`from the years 2020-2026`, `between 1970 and 1976`, `2020-2026`), upper bounds (`before 1994`, `pre-2000`, `prior to 1990`), lower bounds (`after 2018`, `since 2020`, `post-2010`), single release years (`in 1999`, `released in 2022`), and decades (`80s`, `1990s`).
  - **Order-Dependent Extraction Pipeline**: Temporal parsing extracts date bounds before artist directive matching, preventing phrases like `from the years 2020-2026` or `from 1980` from misidentifying temporal ranges as artist names.
  - **Temporal Candidate Verification (`isTemporalPermitted`)**: Rejection sampling validates track release years against the parsed temporal window, tracking `rejections.temporal` in server diagnostics.
  - **Anchor-Year Provider Queries**: Automatically injects year-anchored search queries (start year, midpoint, end year) into Deezer and iTunes harvesting.
- **Single-Artist Dedicated Crosswords & Clue Policy (`server/services/musicService.js`, `shared/musicKeywords.js`, `server/services/queryBuilder.js`)**:
  - **Zero "Artist Name" Clue Policy**: For single-artist puzzles (e.g. `songs by Daft Punk`, `Queen`), clues asking for the artist name are strictly eliminated (0% Artist clues). 100% of clues resolve to Song Title or Song Title Keyword (`allowArtist: false`).
  - **Target Artist Multi-Track Exemption**: Allows multiple distinct songs by the queried artist while preserving strict duplicate title and duplicate answer protection on the puzzle grid. Non-target collaborating artists remain capped at 1 track.
  - **Noise & Filler Word Scrubbing**: Strips non-genre terms (`songs`, `tracks`, `music`, `discography`, `singles`) so queries like `songs by Daft Punk` do not contaminate the residual genre.
  - **Standalone Artist Recognition**: Direct artist prompts without `by` (e.g. `Queen`, `Daft Punk`) automatically map to target artists using the curated artist registry.
- **Anime Theme Homonym Guardrail (`server/services/musicService.js`)**:
  - Rejects tracks where the artist or song title is literally the word `"Anime"`, preventing non-soundtrack Western rap/pop collisions.
- **UI Clarifications (`src/components/LiveGeneratorModal.tsx`)**:
  - Renamed `"Steered Prompt & AI"` to `"Steered Prompt"`.
  - Updated example prompts to demonstrate temporal and single-artist steering (`Songs by Daft Punk`, `Anime from the years 2020-2026`, `90s Grunge before 1994`).

---

## [1.3.0] - 2026-09-18

### Added
- **Storefront Steering, Thematic Homonym Guardrails & Spoken Media Filters (`server/services/itunesMusicProvider.js`, `server/services/musicService.js`, `server/services/deezerMusicProvider.js`)**:
  - **Dynamic iTunes Storefront Steering (`detectStorefront`)**: Automatically directs cultural prompts to authentic regional storefronts (`JP` for Japanese/City Pop/Anime, `FR` for French House/Chanson, `DE` for German Krautrock, `BR` for Bossa Nova/MPB, `ES` for Latin, `JM` for Reggae, `NG` for Afrobeat, `GB` for Britpop/UK Garage, and `US` for K-Pop and Western pop/rock).
  - **Thematic Homonym & Novelty Act Filtering (`isThematicallyPermitted`)**: Rejects Western artist collisions matching cultural adjectives (e.g. *The Japanese House*, *The Japanese Popstars*, *French Montana*, *German Brigante*) and novelty titles (e.g. *Aneka - "Japanese Boy"*, *Doctor Flake - "Japanese Porn"*, or non-Korean rap tracks titled *"K-POP"*), including featured artist mentions in titles.
  - **Compound Genre Invariance (`server/services/queryBuilder.js`)**: Protects atomic compound sub-genres (`City Pop`, `French Touch`, `Krautrock`, `Bossa Nova`, `Classic Rock`, `Roots Reggae`) so compound themes are never broken or degraded into generic pop or rock tokens.
  - **Audiobook & Spoken Track Rejection (`mapDeezerTrack`, `mapItunesTrack`)**: Excludes audiobooks, spoken radio drama episodes (`Kapitel`, `Folge`, `Chapter`), and raw audio file rips (`.flac`, `.mp3`) from crossword clue generation.
  - **Grid Answer Duplicate Self-Healing (`server/services/musicService.js`)**: When multiple tracks by the same artist are permitted or when an artist answer would duplicate an existing grid entry, automatically falls back to song title instead of dropping the candidate track.
  - **Multi-Genre Crossword Verification Test Suite (`scripts/test_prompts_crossword_suite.js`, `npm run test:prompts`)**: Automated end-to-end test suite evaluating 10 diverse genres, eras, and cultures (`Japanese City Pop`, `French House`, `90s Grunge`, `Bossa Nova`, `Synthwave`, `Afrobeat`, `German Krautrock`, `K-Pop 2010s`, `Reggae Roots`, `Classic Rock 70s`), achieving **100% test pass rate**, **100% thematic purity (0 homonym leaks)**, **10/10 words placed on every grid**, and balanced clue distributions.
- **Enhanced Release Workflow (`.github/workflows/manual-release.yml`)**:
  - Added `run_prompt_suite` input parameter to trigger the live 10-genre crossword verification suite during pre-release validation.

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
- **Prompt Priority & Thematic Query Precision (`server/services/queryBuilder.js`)**:
  - Prompts with themes/genres (e.g. `"80s Japanese City Pop"`) take priority over modal default `genre: 'all'`, preventing open catalog fallback.
  - Compound search term generation combining genre + era/decade (e.g. `"Japanese City Pop 1980s"`).
  - Strict guardrail: random alphanumeric entropy seeds (`generateDynamicSeed()`) are forbidden from executing whenever a user prompt is present.
- **Cultural & Regional Language Policy (`server/services/musicService.js`, `server/services/itunesMusicProvider.js`)**:
  - Automatically detects international/regional themes in prompts or genres (`Japanese`, `City Pop`, `K-Pop`, `Latin`, `Anime`, `Spanish`, `French`, `German`, etc.).
  - Grants language exemption allowing native titles, Kanji, Kana, Hangul, and accented characters.
  - Bypasses US iTunes storefront constraint for international and Asian soundtrack discovery.
- **Universal Multi-Query Harvesting & Repetition Cap ($\le 3$ repeats across 50 crosswords)**:
  - **Dynamic Theme Variations (`server/services/queryBuilder.js`)**: Generates complementary sub-genre, de-spaced (`synthwave`, `citypop`), and decade-specific queries generically for any prompt while preserving cultural identifiers (`Japanese`, `French`, `Korean`, etc.).
  - **Deep Multi-Provider Ingestion (`server/services/musicService.js`)**: Expanded aggregator candidate harvesting depth to 250 on Deezer and 4 parallel queries of 100 tracks on iTunes, discovering 400+ unique candidates per prompt without static seed lists.
  - **Multi-Pass Tiered Play-Frequency Sampling (`server/services/musicService.js`)**: Strictly prioritizes unplayed tracks (Tier 0). Only taps Tier 1 (1 previous play) and Tier 2 when unplayed tracks are exhausted, strictly capping any song at $\le 3$ repetitions across extended sessions.
  - **Session Memory Expansion (`src/services/dynamicMusicService.ts`)**: Expanded client session memory buffer from 50 to 300 tracks.
  - **50-Crossword Simulation Benchmark (`scripts/evaluate_city_pop_variance.js`)**: Evaluated 50 consecutive crosswords with live provider APIs and rolling session tracking, achieving **99.5% unique songs** (420 unique out of 422 slots) and a maximum repetition of only **2x** per song (exceeding the $\le 3$ benchmark).

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
