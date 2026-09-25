# Changelog archive

Releases before 1.28.12. Current entries are in [CHANGELOG.md](../CHANGELOG.md).

## [1.28.11] - 2026-09-24

### Fixed
- **The `cjk` crawl no longer skips Japanese and Korean artists as English.** It checked each artist on its Deezer top tracks, which carry no ISRCs and come with romanized titles ("Usseewa", "Gimme Chocolate!!"). Most seeds (Ado, Joe Hisaishi, WINNER, STAYC) were skipped as `catalog language "en"` and still used up the `--cjk` limit.
  - An artist already in the catalog keeps its stored `primary_language`.
  - Any other artist whose top-track titles vote outside the allowed languages is voted again with the ISRCs of its first 3 top tracks before it is skipped.

---

## [1.28.10] - 2026-09-24

### Changed
- **The catalog and enrichment modules are TypeScript**, which finishes the migration:
  - `server/db/`: `sqliteCatalog`, `catalogMigrations`, `catalogLanguages`, `catalogPopularity`, `languageClassifier`, `trackNormalization`, `lazySingleton`
  - `server/crawler/`: `enricher`, `rateLimiter`
  - `server/policy/authenticityRules`
  - `server/config`, `logger`, `paths`
  - `shared/musicIdentity`
  - `scripts/enrich_catalog`, `scripts/lib/cli`
  - `npm run catalog:enrich` runs the `.ts` file.
- **`SqliteCatalog.db` is always the open database.** `close()` can be called twice, and using a closed catalog throws "database is not open".
- **Typed catalog data:** `TrackInput`, `ArtistRow`, `CatalogRow`, `CatalogWindowQuery`, `MigrationResult`, `EnrichProgress`, `VersionType`.
  - The catalog's prepared statements are built in one place.
  - The table-column checks in the migrations share one helper.
- **Temporary casts removed:** the casts and the `cli.d.ts` / `musicIdentity.d.ts` declarations that bridged to the JavaScript modules are gone.
- **Tests:** `catalogWindow`, `coverage` and `musicMoveArr` are TypeScript. Every server test is now `.test.ts`.
- **`tsconfig.node.json` no longer allows JavaScript.** `npm run lint` rejects any `.js`, `.mjs` or `.cjs` file under `server/`, `shared/` or `scripts/`.

---

## [1.28.9] - 2026-09-24

### Changed
- **Agent docs state current rules only:** the crawler, catalog, track selection and frontend docs drop the notes that described earlier behaviour ("before, …", "used to", "replaced") and the dated coverage pass count, and keep the reasons.

---

---

## [1.28.8] - 2026-09-24

### Changed
- **Server tests are TypeScript:** `cli`, `crawler`, `fixtureCatalog`, `languageCorpus`, `popularity`, `sqliteCatalog`, `trackNormalization` and `unicodeDedupe`, plus the `setup_env.ts` preload. `npm test` and the single-file command in `AGENTS.md` and `TESTING.md` use `--import ./scripts/tests/setup_env.ts`.
- **`routedFetch` returns a typed fake `fetch`**, with the requested URLs in `calls`.
- **Waiting for the catalog module:** `catalogWindow`, `coverage` and `musicMoveArr` stay JavaScript until `sqliteCatalog` moves. Their type errors come from its inferred JavaScript types.
- **Docs name the `.ts` test files.**

---

## [1.28.7] - 2026-09-24

### Changed
- **Scripts are TypeScript:** every CLI under `scripts/` except `enrich_catalog.js` and `lib/cli.js`, which stay JavaScript while the catalog enrichment runs. The `npm run` aliases point at the `.ts` files.
- **Test support is TypeScript:** `helpers`, the fixture catalog, the CI gate fixture and the e2e server. Tests `apiIntegration`, `blacklist` and `hardening` are TypeScript.
- **New `scripts/lib/cli.d.ts`:** types for the flag helpers in `cli.js`, so flag values are typed by their options. It goes when `cli.js` moves (T7).
- **Typed script data:**
  - `CrawlPlan`
  - `SampleRecord` (anime clips)
  - `AnimeThemeMetadata` and `AnimeMetadataIndex` (the anime metadata index)
- **The harvester reports a typed `HarvestProgress`.**
- **Selection takes blacklist identities:** `getRandomSongPool` and the track picker take `BlacklistIdentityItem[]` instead of stored entries.
- **Test hooks reset with no argument:** `setMusicProviderForTesting()` and `setPreviewFetchForTesting()`.
- **New test helper `readJson`:** reads a response body for assertions.

### Removed
- **`scripts/test_multiplayer_live_sync.js`:** it no longer matched the room protocol (rooms need a live puzzle token, cells send `char`). The same co-op flow is covered by `apiIntegration`.
- **Dead code:**
  - `generateAllSamples`' unused `onProgress` option
  - the anime ingest's snake_case metadata fallbacks, which no index or fallback produces

---

## [1.28.6] - 2026-09-24

### Changed
- **The HTTP and WebSocket server is TypeScript:**
  - `server/server.ts`, `server/validators.ts`
  - `server/http/` (`security`, `livePuzzleStore`), `server/middleware/rateLimiter`
  - `server/routes/` (`music`, `user`), `server/ws/rooms`
- **`npm run dev`, `npm start` and the Docker image run `node server/server.ts`.**
- **Typed request data:**
  - `Validation<T>`: a validator returns the parsed data or the rejection reason
  - `LivePuzzleRequest`, `WsMessage`
  - `Player` and `Room` for multiplayer rooms
  - `server/express.d.ts` adds `userId` to Express requests
- **`PORT` is read as a number.**
- **The first multiplayer player color is `#3de0ff`** instead of the old Spotify green.
- **Tests:** `deezerProvider` and `validators` are TypeScript. `apiIntegration`, `blacklist` and `hardening` move with the test helpers.

---

## [1.28.5] - 2026-09-23

### Changed
- **Song selection, policy, services and the crawler's harvester are TypeScript:**
  - `server/selection/` (`candidates`, `coverage`, `random`, `songPool`, `trackPicker`) and `server/policy/selectionPolicy`
  - `server/services/` (`animeImageService`, `deezerMusicProvider`, `fetchWithTimeout`, `ffmpegHelper`, `itunesMusicProvider`, `previewResolver`, `queryBuilder`)
  - `server/crawler/` (`artistBaseline`, `authenticityFilter`, `harvester`)
- **New `server/types.ts`:** `SongCandidate` (a song as it moves through selection, from any source), `TrackLike` and `YearRange`.
- **Typed interfaces between modules:**
  - `QueryPlan`, `PromptOptions` and `QueryOptions` (query builder)
  - `CatalogSource` and `MusicProvider` (candidate sources)
  - `SongPoolRequest` and `PickedSong`
  - `ResolvedPreview` and `PreviewTrack`
  - the Deezer and iTunes API payloads (`DeezerApiTrack`, `ItunesApiTrack`)
  - `HarvestCatalog`, `HarvestResult` and `DiscographyResult` (harvester)
- **New `server/errors.ts`:** `errorMessage(err)` reads the message of a caught value.
- **Temporary casts:** where these modules call `sqliteCatalog`, `rateLimiter` or `musicIdentity` (still JavaScript while the catalog enrichment runs), they cast once to a small interface. The casts go when those files move.
- **Tests:** `animeArt`, `animeCatalog`, `authenticity`, `itunesProvider`, `offline`, `queryBuilder`, `selectionPolicy` and `trackPicker` are TypeScript.

---

---

## [1.28.4] - 2026-09-23

### Changed
- **Server base and database modules are TypeScript:** `db`, `offline`, `shutdown`, and in `server/db/` `animeCatalog`, `catalogCleanup`, `catalogGate`, `catalogReport` and `userStore`.
  - The modules loaded by the running catalog enrichment (`sqliteCatalog`, `catalogMigrations`, `trackNormalization`, …) follow once it finishes.
- **New exported types:**
  - `userStore`: `BlacklistEntry`, `BlacklistInput`, `Progress`, `SolvedItem`
  - `catalogCleanup`: `CleanupResult`, `StepResult`, `CleanupExample`, `CatalogSummary`, `CleanupStep`
  - `catalogGate`: `GateResult`, `GateCheck`, `GateThresholds`
  - `catalogReport`: `CatalogStatistics`
  - `animeCatalog`: `AnimeSong`, `AnimeTrackInput`, `AnimeTrackQuery`
- **Private methods lose the underscore prefix and are marked `private`:** `UserStore.migrate`/`transaction`/`touchUser`/`insertBlacklistItem`, and `AnimeCatalog.initSchema`.
- **Tests have their own config:** `tsconfig.tests.json` checks the server tests with implicit `any` and null checks relaxed, while source files stay fully strict. `npm run typecheck` runs all three configs.
- **Tests:** `userStore`, `catalogCleanup` and `catalogReport` are TypeScript.

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

## [1.24.0] - 2026-09-23

### Added
- **Japanese/Korean crawl vector** (`npm run crawl -- --cjk=N`):
  - the Deezer Asian Music chart
  - then discographies of the catalog's Japanese and Korean artists, fetched by Deezer id with the most fans first
  - then their related artists (≥ 20,000 fans), keeping to artists whose top tracks vote ja/ko (the vote now also sees the tracks' ISRCs)

  The catalog held 4,572 ja and 3,651 ko tracks.
- **Decade playlists** (`--decades`): 49 playlist searches (60s–2020s × hits/rock/pop/soul/hip hop/dance/country). The artists they contain get the style's genre.

### Changed
- `harvestArtistDiscography` skips artists with fewer than 5,000 fans before any track request (the popularity cleanup would drop most of their tracks), accepts a known `deezerId` instead of a name search, and returns related artists with their ids.
- `runFullHarvest` runs every vector through one bounded helper. Default limits: charts 100, playlists 100, decades 49, cjk 300, artists 500, lexicon 400.

### Fixed
- **`--artists=N` did not bound the crawl.** Related artists were appended to the queue with no cap, so an artist crawl ran until the 500,000-track target. The limit now counts every discography, related ones included.

### Removed
- The decade × genre text searches ("1960s rock"). Deezer search matches the words in titles and does not filter by year.

---

## [1.23.0] - 2026-09-23

### Added
- **`npm run catalog:coverage`** (`server/selection/coverage.js`): an offline report on whether every theme and about 40 benchmark prompts (moods, eras, genres, artists) can be served from the catalog.
  - It measures the catalog window at "balanced" (tracks, distinct artists, languages) and generates five seeded 12-song puzzles (do they fill up, and how much do they overlap).
  - Targets: themes ≥ 150 tracks from ≥ 40 artists, prompts ≥ 60 / 20, artist prompts ≥ 15. `-- --ci` exits 1 on a miss, and `-- --json` gives the raw results.
  - Baseline on a copy of the real catalog, before enrichment: **28 of 54 pass** in 25 s. Genre themes miss on distinct artists (only 565 artists have genres), decade prompts miss on release years ("70s disco": 9 tracks), and "songs by YOASOBI" finds nothing.
- **Theme playlists tag their artists:** the crawler's playlist seeds come from `shared/themes.js`, and every artist on a theme's playlist gets that theme's first genre. `getOrCreateArtist` now merges genres into existing artists (it ignored them before).
- Tests: the coverage report on the fixture catalog, playlist genre tagging, and English genre names from localized API responses.

### Fixed
- **Genre names were stored in German.** The Deezer API localizes genre names by the caller's location ("Filme/Videospiele", "Asiatische Musik", "Klassik", "Latin Musik"), so theme filters never matched them. Enrichment now maps album genres by Deezer genre id to English names, and **schema v7** translates the names already stored.

### Removed
- `CURATED_PLAYLIST_SEEDS` and `harvestCuratedPlaylists`, replaced by `PLAYLIST_SEEDS` and `harvestPlaylists(query, { genre })`.

---

## [1.22.0] - 2026-09-23

### Changed
- **Popularity is the track's percentile within its language (schema v6).** The old log mapping (`20·log10(rank) − 39`) squeezed 94% of the catalog into scores 40–80, so the popularity settings barely differed. Deezer also under-ranks Japanese and Korean music (the median Japanese rank was the placeholder), so each language is now ranked on its own. A Spotify popularity can only raise a score.
  - On a copy of the real catalog, migration v6 took 3.1 s, the scores spread evenly over 0–100, and the hits (Bohemian Rhapsody, Blinding Lights, Dynamite) score 98–100.
  - `npm run catalog:recompute` (new) re-votes languages and recomputes the percentiles after crawls and enrichment. The cleanup's `fields` step and migration v6 run it too.
  - New rows get a provisional score until then: their Spotify popularity, else 50 for a Deezer-ranked track, else 0.
- **Selection windows:** mainstream ≥ 75 (the top quarter), balanced ≥ 30, obscure ≤ 50.
- `catalog:enrich` no longer has a `--languages` step (use `catalog:recompute`), and Deezer enrichment updates the rank but leaves the score to the recompute.

### Added
- **Popularity floor and cover acts** (`server/db/catalogPopularity.js`, new cleanup step `popularity`, only for artists whose fans are known from enrichment):
  - A track stays when its Deezer rank reaches its language's floor (en 60,000, ja 32,000, ko 110,000: the 30th percentile on 2026-09-23), its Spotify popularity is ≥ 30, or its artist has ≥ 5,000 fans.
  - The floors are fixed ranks, so repeated cleanups are idempotent.
  - A cover act has ≥ 5 songs, < 50,000 fans, and ≥ 60% of its titles also recorded by an artist with more fans. All its songs are deleted.
  - Before enrichment, below-floor tracks are reported as `unjudged` and kept.
  - Upper bound on the real catalog: about 83,800 tracks below the floor and 13,700 cover-act tracks. The top cover acts found: Mix Factor, Stingray Music, Hindley Street Country Club, The Pop Posse, Kidz Bop Kids, 100% Hit Crew.
- Dump ingest (`ingest_musicmovearr.js`) applies the floor instead of the old "score > 30".
- New authenticity patterns: "Various Artists" in German/French/Spanish/Portuguese/Italian, Stingray Music, cover "factories", R&B Songbook, Sleepy Tunes, "Relax …" acts, DJ Hits, "80's Greatest Hits". The existing `mixfactor` rule never matched "Mix Factor".
- Tests: rank normalization, provisional scores, per-language percentiles, the floor table, enriched vs unjudged, cover acts, idempotence of the popularity step, and an artist contamination corpus with real acts that have similar names (C+C Music Factory, Electric Light Orchestra, Sleep Token).

### Fixed
- **Deezer's placeholder rank `100000`** (18,884 tracks with no play data) is now `NULL`. It used to score 61, so stock music counted as "mainstream".

### Removed
- `deezerRankToScore` and `normalizePopularity`. Migration v2 keeps a private copy of the old mapping so it replays unchanged.

---

## [1.21.0] - 2026-09-23

### Added
- **`shared/themes.js`, the single theme table.** Before, theme knowledge lived in six places that disagreed: two UI lists, prompt mapping, theme variations, the live taxonomy and the crawler seeds.
  - Each theme has `genres` (values in `artists.genres_json`), `languages` and the crawler's playlist `seeds`.
  - The generator and multiplayer pickers render it, and selection reads it through `genresForPrompt` and `allowedLanguagesForContext`.
- **Six new themes:** Indie & Alternative, R&B/Soul/Funk, Metal, Country, Jazz & Blues, and J-Pop & City Pop (ja/en), each with a live Deezer configuration. There are now 16.
- Free-text prompts map to genres through ordered phrase rules. The most specific phrase wins and is removed before the next rule runs, so "city pop", "k-pop" and "pop-punk" no longer also add Pop. Word boundaries stop "trapped" from counting as rap.
- `themes.test.js`: unique ids, admitted languages only, genres and seeds per theme, a live configuration per theme, theme languages, and prompt → genre cases.

### Removed
- **The "Latin & Reggaeton" theme.** The catalog only admits en/ja/ko, so it could never be served. A saved `latin` theme falls back to Mixed.
- Other non-en/ja/ko remnants:
  - the "international → any language" branch in `allowedLanguagesForContext`
  - the FR/DE/BR/ES/IT/JM/NG iTunes storefronts
  - the Latin Quarter guard and the Bossa Nova variation
- `server/services/queryFactory.js` (`mapPromptToGenres` moved to `genresForPrompt`), the unused `ThemeBar` component, and the `ThemeCategory`/`ThemesCatalog` types.

---

## [1.20.1] - 2026-09-23

### Changed
- **Server tests are split into one test per behaviour: 429 named tests, up from 56.** Before, 15 of 23 files were a single `test()` with 8–116 unrelated asserts, so the first failure hid the rest and the test name said nothing. Rule corpora are tables (`languageCorpus`, `selectionPolicy`, `musicKeywords`, `validators`). Shared state between steps became small fixture builders.
- `assert(a === b, msg)` → `assert.equal(a, b)` (a codemod over 471 asserts), so a failure shows the actual and expected values.
- Tests moved to the module they cover:
  - `trackNormalization.test.js`: version classes, keys, ISRC, years, display text.
  - `authenticity.test.js`: the crawler filter corpus.
  - `userStore.test.js` and `catalogWindow.test.js`: RNG, weighted order, the SQL window.
  - `itunesProvider.test.js`.
  - `languageCorpus.test.js` now holds every track-language, artist-vote and script case (they were in three files).
- `hardening` and `apiIntegration` share one server per `describe` block. The nested WebSocket callbacks became linear `await`s.
- `scripts/tests/TESTING.md` gained a short "Writing tests" rule set.

### Added
- `trackPicker.test.js`: a named artist is never an answer and never gets artist clues; an anime keyphrase is banned; one song per artist; recency tiers. The old anime-art check only split a string inside the test itself.

### Removed
- Tests that checked nothing: `assert(true)` after a timing-based rate-limiter check, `typeof harvester.x === 'function'`, seed-list sizes, a keyphrase check that ran its own inline code, and a text search in `vite.config.ts`.

---

## [1.20.0] - 2026-09-23

### Fixed
- **Script flags were silently ignored, so full runs started instead of targeted ones.**
  - `npm run catalog:enrich --albums=5` (no `--`): npm took `--albums` as its own config and passed no arguments, so every enrichment step ran with default limits.
  - `--albums 30000` (space instead of `=`) fell back to the default limit of 2000.
  - A typo such as `--album=500` matched no step and also ran every step.
  - `crawl_catalog.js` always ran the year × genre and bigram sweeps, whatever flags were given.

  All 10 scripts now parse flags with Node's `util.parseArgs` in strict mode (`scripts/lib/cli.js`). Unknown flags, bad values and flags swallowed by npm print the usage and exit 1, and both `--flag=value` and `--flag value` work.
- `catalog:enrich` and `crawl` run only the steps or vectors you name. `--all` runs every one with default limits, and per-step overrides still apply (`--all --artists=80000`). Without a step they print the usage.
- `db:validate -- --steps=…` rejects unknown step names.

### Removed
- The year × genre (1,675 text searches) and bigram crawl vectors. Deezer search matches "1987" in titles rather than filtering by year, and the two-letter bigram searches return random tracks.
- The eval-only crossword pipeline that production never ran: `queryFactory.buildCrosswordFromCatalog` / `prepareCandidateSongs` and the catalog methods only it used (`queryCatalogForCrossword`, `searchCatalogByTheme`, `getRandomPlayableTracks`).
- `crosswordJudge.js`, `npm run eval:crosswords`, `npm run test:prompts` (and the release workflow's prompt-suite option), and `npm run test:all`. The judge's policy cases (anime, Japanese, authenticity) moved to `selectionPolicy.test.js`.
- Unused exports: `shuffleWith`, `peekUserStore`, `getPreviewCacheStatsForTesting`, `resetItunesCachesForTesting`.
- The unused `--report` flag in the `db:validate` / `db:sanitize` npm scripts.

### Added
- `scripts/tests/cli.test.js`: `=` and space values, typos, missing values, no step, `--all` with overrides, and flags swallowed by npm.

---

## [1.19.1] - 2026-09-23

### Changed
- `README.md` is now a short quickstart (75 lines, down from 470) that links to the area docs. It also fixes stale claims: Node 18 → Node 24, the MIT license → Apache 2.0 (as in `LICENSE`), and the removed pre-generated theme list.
- `CHANGELOG.md` keeps the last five releases. Older entries moved to `docs/CHANGELOG-archive.md`.
- `npm test` uses the `dot` reporter: failures still print in full, and passing tests print as dots.
- `AGENTS.md` gained a short "Always" block: the single-file test command, no network or real data in tests, flags after `--`, and code style.

### Fixed
- Added `.gitattributes` (`* text=auto eol=lf`). With `core.autocrlf=true`, about 25 files showed as modified with only line-ending differences.

---

## [1.19.0] - 2026-09-23

### Changed
- **Test suite on `node:test`:** the 2,900-line `scripts/run_tests.js` is split into 17 per-area files in `scripts/tests/*.test.js`.
  - All 616 assertions carried over unchanged.
  - Files run in parallel processes, each with its own temp data dir. The suite takes ~5 s.
- **CI** (`.github/workflows/ci.yml`) runs:
  - lint, typecheck, and server tests with c8 coverage thresholds (`server/db`, `server/policy` and `shared` at lines/functions ≥ 85 %, branches ≥ 75 %; currently 90.5 / 93.8 / 79.8)
  - frontend tests, the validation gate on a generated fixture catalog, and the build
  - in a second job, a Playwright smoke test

  The release workflow also runs typecheck and the frontend tests.

### Added
- **New server suites:**
  - Unicode dedupe: kana, hangul and kanji titles survive ingest and cleanup; width, spacing and version variants merge.
  - Popularity calibration: monotonic, clamped, with anchor points.
  - A table-driven language-classifier corpus.
  - Blacklist matching, offline mode, and the CI fixture catalog.
- **Frontend tests** (Vitest + React Testing Library, jsdom) for `useCrosswordGame` and `useBlacklist`: typing, backspace, direction toggle, completion, hints, debounced saves, server sync.
- **Playwright smoke test** (`npm run test:e2e`):
  - builds a 92-track fixture catalog, starts the production server offline, and loads the app
  - types every answer, expects the end screen and checks the solve in `/api/history`
  - checks for horizontal overflow at 375 px
- `SPOTYSPICE_OFFLINE=1` serves puzzles from the local catalog only: no Deezer/iTunes fallback, no preview lookups.
- `npm run test:coverage`, `test:web`, `test:e2e`, `typecheck`, `db:gate:fixture`. `test:ci` runs lint + typecheck + coverage + frontend tests + fixture gate.

### Fixed
- **Blacklist matched substrings:** blacklisting "IU" also removed songs by "Julius"; "Queen Latifah" removed "Queen"; the song "Hello" removed "Othello". Generic entries now match whole words, which still covers collaborations ("Drake feat. Future") and versions ("Hey Jude - Remastered 2015").
- **Grid key handlers could read an empty grid:** typing and backspace took the next grid from inside a `setState` updater. When React ran that updater later (any other update pending), the handler crashed on the full-grid check or scheduled a save of an empty grid. They now build the grid from the rendered state and apply it with a functional update.

### Removed
- `scripts/run_tests.js` and the unused `isBlacklisted` in `useBlacklist` (the server does the matching).

---

## [1.18.0] - 2026-09-23

### Added
- **Accessible dialogs:** a shared `<Modal>` and `useDialog` hook give all 8 dialogs and the Lounge drawer:
  - `role="dialog"` and `aria-modal`
  - an accessible name and description
  - a focus trap, Esc to close, and focus returned to the opener

  Before, only the drawer closed on Esc.
- **Solved History view:** a new Lounge menu item lists every finished puzzle from `GET /api/history` with date, clue count and solve time (now recorded; it was always 0). "Listening Log & Showcase" still opens the current puzzle's tracklist.
- **EN/JA/KO filter** in the live generator: `languages` on `POST /api/puzzles/live` and `GET /api/music/random`, validated to en/ja/ko, applied to the catalog window and the picker.
- `useSettings()` and `readSettings()` replace three separate settings parsers. `services/storage.ts` guards every storage access (it was unguarded in `App.tsx` and `useBlacklist`).
- Self-hosted fonts (`@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`, OFL-1.1, Latin subsets). No more render-blocking Google Fonts requests; the CSP drops the Google font hosts.
- 5 new tests: language filter validation, policy override, catalog window.

### Fixed
- **Recently played artists never matched on the server:**
  - The client stripped spaces and non-Latin letters from artist keys ("dualipa" vs the server's "dua lipa").
  - Japanese and Korean artists became empty keys.
  - The client now uses the shared `canonicalArtistKey`.
- **Phones overflowed horizontally:** the page was 675 px wide at 375 px. The header now wraps and collapses button labels to icons with `aria-label`s, and the race leaderboard wraps.
- **Background flash** on load: `index.html` used `#181818` while the CSS used `#0b0e14`. Both now use the palette base, inlined in `<head>`.
- **Room victory dialog** used an off-palette gray and yellow; it now uses the palette.

### Changed
- **Palette tokens:** 91 hardcoded hex classes (35 distinct colors) replaced with the `kissa` tokens (`base`/`surface`/`card`/`panel`) and exact Tailwind palette colors.
- **Contrast and type:** `text-slate-500` on dark surfaces becomes `text-slate-400` (WCAG AA); 9–11 px text becomes 12 px; clue text is 14 px.
- Docs: `FRONTEND_UI.md`, `API_SECURITY.md`, `TRACK_SELECTION.md`, `README.md`.

---

## [1.17.0] - 2026-09-23

### Added
- **Song selection v2** (`server/selection/`):
  - A random window over the catalog with every filter in SQL: language, originals, popularity window, year range, artist, genres, text theme and recent plays.
  - The window is read in `rand_key` order from a random start (new `sampleCatalogTracks`, schema **v5** index `idx_tracks_rand`), one row per track, in 2–160 ms on ~300k tracks.
  - Candidates are weighted by popularity (Efraimidis–Spirakis, α = 0 for obscure/pure, 1 balanced, 2 mainstream) with a seedable sfc32 RNG. The seed is hashed once instead of SHA-256 inside a sort comparator.
- **Live providers are a fallback only:** used when the catalog window is thin or the picked pool falls short.
  - Deezer goes first; iTunes (0.25 req/s) only if Deezer is still short. The fallback is capped at 10 s.
  - Results are written to the catalog through the admission policy, so the catalog learns.
  - Typical prompts now return in 10–200 ms instead of 7–28 s.
- **SQLite user store** (`server/db/userStore.js`, `users.sqlite`): users, progress, solved history and blacklist tables. `store.json` is imported once on first open (with `.bak` fallback) and then no longer read. Writes are transactional, so nothing needs flushing.
- 20 new tests: selection policy, RNG and weighting, catalog window, recency tiers, and the user store and its import.

### Fixed
- **Recency tiers** fill 0 → 1 → 2 → 3+ plays until the pool is full. Before, a small fresh tier plus leftover once-played tracks could under-fill the pool.
- **Live candidates skipped the catalog's rules:**
  - Version rules: live versions ("Live at Nassau Coliseum"), re-recordings and language versions ("Soda Pop (Tagalog)") got in.
  - Language: any Japanese or K-pop context allowed every language (a Spanish "Otro Como Yo" in city pop).
- **Catalog language is trusted** over stopword heuristics, which rejected English titles like "Viva La Vida".
- "songs by Queen" also matched Queen Ifrica. Artist targeting now accepts the exact artist or its collaborations ("Queen & David Bowie").
- **Genre prompts** ("80s rock") also ran the genre word as a title search, which starved the pool and forced a 17 s live fallback.
- `isTemporalPermitted` no longer mutates the track; `resolveReleaseYear` is separate.
- **Crossword engine:** the regex that strips bracketed text from titles was mis-escaped and never matched, so answers like "BY" came from "(Inspired by …)". Two-letter function words are no longer answers.
- Version rules catch "re-recording", tour/dome/arena live recordings, and language-only brackets. Artist names with "Japanese City Pop" and "Untitled … 7" filler titles are inauthentic.

### Changed
- `musicService.js` (991 lines) is replaced by `server/selection/` (`songPool`, `candidates`, `trackPicker`, `random`) and `server/policy/selectionPolicy.js`.
- `server.js` (861 lines) now only composes the app (99 lines): `http/` (security, live puzzle store), `routes/` (music, user), `ws/rooms.js`.
- Deezer candidates keep their duration, ISRC and album id.
- Docs: `TRACK_SELECTION.md` moved to `server/selection/`; `API_SECURITY.md`, `MULTIPLAYER_WS.md`, `CATALOG_DB.md`, `TESTING.md`, `README.md`, `AGENTS.md`.

---

## [1.16.0] - 2026-09-23

### Added
- **Catalog cleanup** (`server/db/catalogCleanup.js`, `npm run db:sanitize`) brings existing rows under the admission policy. The steps are idempotent and run in one transaction; a dry run executes the same steps and rolls back, so its counts are exact.
  - `text`: decodes HTML entities (`I&#039;m`), removes invisible characters, and merges artists whose names now share a key.
  - `classify`: recomputes base titles and version types.
  - `recordings`: folds collaborations stored once per credited artist ("Die With A Smile" under Lady Gaga and Bruno Mars) into the row that owns the provider link.
  - `links`: restores provider links from stored samples.
  - `duplicates`: keeps one row per artist and base title, preferring the plain original with a sample, an ISRC and the highest popularity, with the earliest release year and every provider link.
  - `languages` + `policy`: re-votes languages, then deletes other languages, non-original versions, inauthentic rows, bad durations and unlinked rows. The two repeat until they agree.
  - `fields`: normalizes ISRCs, registrants, years and 0–100 popularity. `orphans`: removes empty artists. The FTS index is rebuilt once at the end.
- **Validation gate** (`server/db/catalogGate.js`, `npm run db:validate -- --ci`) exits 1 on duplicates, other languages, non-original versions (stored or re-derived from the title), popularity outside 0–100, bad durations, unlinked or orphan rows, inauthentic rows, uncleaned text, an FTS/track count mismatch, or release-year/ISRC coverage under 95% (`--min-year-coverage`, `--min-isrc-coverage`).
- **Album enrichment** (`npm run catalog:enrich -- --albums=N`): one Deezer `/album` request dates every catalog track on the album (about 9 tracks per request on the real catalog). **Schema v4** adds the `tracks.album_checked_at` marker.
- `cleanDisplayText` is applied to titles, albums and artist names on every upsert.
- 33 new tests: classifier guards, text/version normalization, every cleanup step, idempotence, the gate, album enrichment, and the CLI exit codes and backup.

### Fixed
- **English songs the cleanup would have deleted as foreign:** "Sweet Child O' Mine" (Tagalog), "Moth To A Flame" (Albanian), "Cutie Pie" (Latvian), D'Angelo's catalog (Tagalog), and KoЯn and DISCIPLΞS (Russian/Greek from one stylized letter).
  - A non-English verdict must now beat English by a margin that grows as titles get shorter.
  - Two-word titles can only be ruled es/pt/fr/de/it.
  - Artist votes need 6+ words and a clear lead.
  - Other scripts must make up at least half the letters.
  - Dotted acronyms carry no language evidence.
- Tags that name the original release ("Single ver.", "Version originale 1981", "Full Version", "Album ver.") were classed as alternate versions and would have been deleted.
- Artist names containing "Covers" (e.g. "Bossa Nova Covers") are rejected as inauthentic.
- The validator's contamination checks use the shared authenticity rules; its `LIKE` patterns never matched space-separated names. Duplicate detection uses the one-row-per-song rule instead of a 3-second duration window.

### Changed
- `scripts/validate_and_sanitize_db.js` is rewritten. The default run prints diagnostics, a cleanup dry run and the gate, and writes the report. `--fix` writes a `VACUUM INTO` backup, migrates if needed, applies the cleanup, then runs ANALYZE, a WAL checkpoint and VACUUM (`--no-backup`, `--no-vacuum`, `--steps=`). `CatalogValidator.sanitize()` is removed.
- Docs: `CATALOG_DB.md`, `CRAWLER.md`, `SCRIPTS_CLI.md`, `TESTING.md`, `README.md`.

---

## [1.15.0] - 2026-09-23

### Added
- **Language classifier** (`server/db/languageClassifier.js`), built on the ELD n-gram detector (new dependency `eld`, Apache-2.0, no dependencies of its own):
  - Script rules for CJK text.
  - A per-artist vote over each artist's catalog titles and ISRC registrants (`artists.primary_language`).
  - Title-level detection with word-count safeguards.
  - Artist names are never text-classified.
- **Schema v3** (`artists.primary_language`, `artists.enriched_at`, `tracks.enriched_at`, `tracks.itunes_checked_at`). The migration recomputes every artist and track language (13 s on the 498k-track catalog).
- **Catalog enrichment** (`npm run catalog:enrich`, `server/crawler/enricher.js`), resumable, with per-step limits:
  - Deezer `/track` → ISRC, release date, rank.
  - `/artist` + `/album` → fans, genres.
  - A strict iTunes cross-reference that attaches to existing rows and never creates tracks.
  - A local language recompute.
  - Rows are stamped when tried, so runs never loop. ISRCs owned by another row are reported as duplicates instead of being overwritten.
- **Apple Music charts** (US, UK, Japan, Korea) as the first crawl vector, matched to exact Deezer tracks. New `crawl --charts=N` flag. `npm run catalog:genres` now runs the curated genre script.
- **Shared authenticity rules** (`server/policy/authenticityRules.js`) used by the crawler filter, `upsertTrack` (new `inauthentic` rejection), and song selection. Adds audiobook/radio-play detection ("Kapitel 12 - …", Gruselkabinett, Hörspiel, ungekürzt).
- 39 new tests: language classifier, identity keys, authenticity rules, harvester charts/skip (mocked network), enrichment steps, and the v3 key recompute.

### Fixed
- **English songs tagged as German/Spanish by title regexes:** "Die With A Smile", "Die For You", "Die Young", every King Von track (artist name matched "von"), and "Viva La Vida" were tagged `de`/`es`. Under the admission policy they would have been rejected or deleted. Real Spanish titles like "Te Quería Ver" slipped through as English.
- **Kana dakuten were stripped from identity keys** (アイドル → アイトル, ご → こ), so different Japanese songs and artists could collide. Hangul was decomposed into jamo. Keys now fold accents on Latin letters only. Migration v3 recomputes stored artist and title keys, and blacklist matching recomputes keys from stored names.
- **Deezer's advanced `artist:"…" track:"…"` search** returns unrelated or empty results, which silently broke the preview resolver's search fallback. Both it and chart matching now use plain queries with strict artist + base-title matching.

### Changed
- The harvester uses one `toCatalogCandidate` mapper instead of four copies, and takes an injectable fetch. Progress uses `countSummary()` (two `COUNT(*)`) instead of `getStats()` on every query.
- Seeds focus on English/Japanese/Korean: Spanish/French/German lexicon words and Latin/reggaeton playlists are removed, and Japanese/Korean artists, playlists and romanized words are added. Out-of-scope artists are skipped after one request.
- The iTunes cross-reference moved from the harvester into the enricher, with a strict match.
- Docs: `CRAWLER.md`, `CATALOG_DB.md`, `TRACK_SELECTION.md`, `SCRIPTS_CLI.md`, `README.md`.

---

---

## [1.14.0] - 2026-09-23

### Added
- **Versioned catalog migrations** (`server/db/catalogMigrations.js`) tracked in `PRAGMA user_version`, one transaction per migration, with an automatic `VACUUM INTO` backup before migrating a populated catalog. New `npm run db:migrate` (`--no-backup`, `--db=path`) and a `SPOTYSPICE_SKIP_DB_BACKUP` env var.
- **Schema v2** (`tracks.version_type`, `deezer_rank`, `spotify_popularity`, `rand_key`; indexes `idx_tracks_base`, `idx_tracks_pick`, `idx_tracks_version`). Existing rows are backfilled in place.
- **Catalog admission policy** enforced in `upsertTrack` for every writer (`server/db/trackNormalization.js`):
  - Only English, Japanese, and Korean tracks.
  - Only original recordings (a remaster counts). Live, remix, edit, extended, acoustic, instrumental, demo, re-recorded, altered, cover, and language versions are rejected by `classifyVersion`.
  - Duration 45 s–20 min, with no made-up defaults. Invalid ISRCs, years, and dates become `NULL`.
  - Rejections are counted per reason (`getRejectionStats()`).
- Lazy catalog singletons (`server/db/lazySingleton.js`): importing a module no longer opens or migrates `catalog.sqlite` / `anime_catalog.sqlite`.
- 36 new tests: admission policy, Unicode base titles, CJK language detection, popularity mapping, remaster/original merging, trigram FTS and triggers, and a v0 → v2 legacy migration.

### Fixed
- **Japanese/Korean titles were silently dropped.** The dedupe title stripped everything outside `[a-z0-9]`, so kana, hangul, and kanji titles became `''` and were refused. Base titles are now Unicode-aware.
- **Full-text search was broken** (`tracks_fts` pointed at columns that don't exist on `tracks`), so every themed query fell back to `LIKE '%term%'` over the whole catalog. It's rebuilt as a contentless trigram FTS5 index kept in sync by triggers. Themed catalog queries on the real 498k-track catalog now take 6–324 ms.
- **Mixed popularity scales:** Deezer ranks (up to ~1M), rank/10000, and Spotify 0–100 values shared one column, so "popularity > 30" did nothing. `popularity` is now one 0–100 score. Spotify is the reference; the Deezer rank is mapped with `20·log10(rank) − 39`, calibrated on the catalog's Spotify/Deezer overlap.
- Kanji-only titles with a JP/KR ISRC are now tagged `ja`/`ko` instead of `zh`.
- Tier-2 dedupe matches artist + base title regardless of duration, and base titles now also strip Deezer-style suffixes (`" - 2011 Remaster"`, `" - Single Version"`). A plain original replaces a remaster as the displayed release.
- Catalog read queries only return original recordings.

### Changed
- Harvester and ingest scripts pass raw `deezerRank` / `spotifyPopularity`. `ingest_musicmovearr` no longer invents a 180 s duration when one is missing.
- `catalogValidator` flags popularity outside 0–100.
- Docs: `server/db/CATALOG_DB.md`, `server/crawler/CRAWLER.md`, `server/services/TRACK_SELECTION.md`, `scripts/SCRIPTS_CLI.md`, and `README.md` are updated for schema v2.

---

## [1.13.2] - 2026-09-23

### Fixed
- **Audio previews that never played:** all ~495k stored Deezer preview URLs are signed and expire within minutes, but the resolver served them as instant hits. Puzzles now carry stable `/api/preview/<provider>:<id>` paths. The new `GET /api/preview/:ref` endpoint redirects (302) to a freshly minted URL (Deezer track API, then Deezer search, then iTunes) and caches it until 60 s before expiry. `resolveTrackPreview` ignores expired URLs (`isPreviewUrlFresh`). Older saved puzzles are routed through the same endpoint by `src/services/audioSource.ts`.
- **Multiplayer authorization:** identity is bound to the socket on create/join, so later messages can't choose who they act as.
  - A guest can no longer start the game by sending the host's id.
  - Sockets that never joined a room can't write cells, progress, or wins into it.
  - `join_room` with an existing player id requires that seat's `resumeToken`, which closes the seat-hijack hole.
  - Co-op updates carry the server-assigned name and color. Cell updates are rejected in race rooms.
- **Reconnects** no longer drop the player. A disconnected seat is held for 30 s and `socketService` reclaims it automatically with its `resumeToken`. A resumed `room_joined` (`resumed: true`) keeps local progress.
- A disallowed CORS origin now returns a 403 JSON error instead of Express's HTML 500. Malformed or oversized bodies return 400/413 JSON.
- Blacklist DELETE removes only the item with that id; it used to also remove any item whose name matched the id string.
- Read-only endpoints (`GET /api/progress`, `/api/history`, `/api/blacklist`, and song-pool/puzzle generation) no longer create users, so random ids can't grow `store.json`.

### Added
- Security headers on every response (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`), plus a CSP in production. `X-Powered-By` is removed.
- `TRUST_PROXY` env var for Express `trust proxy`. The HTTP limiter keys on `req.ip`, and WebSocket upgrades use `clientIpFromUpgrade`. Neither trusts `X-Forwarded-For` unless configured.
- `server/shutdown.js` (`onShutdown`) is the single SIGINT/SIGTERM owner. It flushes the user store and runs `PRAGMA wal_checkpoint(TRUNCATE)` on the catalog.
- 41 new tests: preview expiry and refs, the redirect endpoint, CORS/headers, read-only users, blacklist delete, proxy trust, and WebSocket authorization and resume.

### Changed
- Room codes are `WORD-NNNN` (was `WORD-NN`), generated with `crypto.randomInt`.
- Anonymous user and multiplayer ids come from `crypto.getRandomValues` (was `Math.random`), with a safe fallback when storage is blocked.
- Audio preview requests have their own 300/min limit and don't count toward the general 120/min API limit.

### Removed
- The implementation plan is no longer tracked. `docs/plans/` is gitignored (planning docs stay local), and agent/section docs no longer reference it.

---

## [1.13.1] - 2026-09-23

### Added
- **Code review & implementation plan** (`docs/plans/2026-09-23-code-review-plan.md`) covering architecture, crawling (en/ja/ko only, originals only), security, testing, track selection, and DB validation.
- **Section docs for agents**, colocated with their code: `.github/RELEASE_PROCESS.md`, `server/db/CATALOG_DB.md`, `server/crawler/CRAWLER.md`, `server/services/TRACK_SELECTION.md`, `server/API_SECURITY.md`, `server/MULTIPLAYER_WS.md`, `shared/CROSSWORD_ENGINE.md`, `src/FRONTEND_UI.md`, `scripts/SCRIPTS_CLI.md`, `scripts/tests/TESTING.md`.
- **`server/paths.js`**: a single `DATA_DIR` for the user store and SQLite catalogs, overridable with `SPOTYSPICE_DATA_DIR`.

### Changed
- `AGENTS.md` (renamed from `agents.md`) is now a minimal map to the section docs, cutting it from 150 lines to 17.
- `npm test` preloads `scripts/tests/setup_env.js`, which isolates each run in a temp data dir. Tests no longer write to the real `server/data/store.json` or open `catalog.sqlite`.
- Node 24 everywhere: the Dockerfile uses `node:24-alpine`, and CI/release workflows read `.nvmrc`.
- Unified dev ports: API/WebSocket on `3001`, Vite on `3000` (production stays on `3000`).
- `.dockerignore` excludes SQLite catalogs, `store.json`, dataset dumps, reports, and docs, so user data and the 480 MB catalog are never baked into images.
- `.env.example` lists the env vars the app actually reads. The unused `GEMINI_API_KEY` is gone.
- `test:prompts` writes its report to `reports/` instead of a hardcoded absolute path.
- `README.md`: updated project structure, env setup, testing, and Docker data notes.

### Removed
- `.agents/skills/*` (folded into the section docs).
- Offline pools `data/master_song_pool.json` and `data/music_pool.json`, and the scripts that only served them: `generate_puzzles.js`, `generate_all_themes.js`, `refresh_audio_pool.js`, `fetch_all_previews.js`, `test_live_generator.js`, `verify_all_themes.js`, `verify_puzzles.js`. The `generate` and `generate:themes` npm scripts are removed too.
- Dead code and one-off scripts: `server/data/tracks_cache.json` (expired preview URLs), `src/utils/liveGenerator.ts`, `scripts/test_randomizer.js`, `scripts/inspect_crossword_batch.js`, `scripts/evaluate_city_pop_variance.js`, `scripts/test_features.js`.
- Generated `reports/*.md` are no longer tracked (`reports/` is gitignored).

---

## [1.13.0] - 2026-09-21

### Added
- **Theme-Aware Catalog-First Song Selection (`server/db/sqliteCatalog.js`, `server/services/musicService.js`)**:
  - New `searchCatalogByTheme()` method combining FTS5 full-text search on titles/artists/albums with genre JSON filtering and popularity-weighted random sampling (10–100× faster than `LIKE '%term%'` on 285k+ tracks).
  - Composite index `idx_tracks_lang_pop_year` on `(language, popularity DESC, release_year)` for the most common theme-filtered query pattern.
  - Catalog is now queried **first** (catalog-first architecture) and inserted at the front of the candidate pipeline, ensuring local genre/language/temporal accuracy before external API enrichment.
  - New `toFtsQuery()` helper in `server/services/queryBuilder.js` converts free-text prompts to safe FTS5 OR queries, stripping noise words, directives, and temporal references already handled by filters.
  - Cultural language auto-detection: K-Pop themes get `['ko','en']`, Japanese/City Pop get `['ja','en']`, all other themes default to `'en'` at the SQL level to maximize thematic precision.
  - Recently-played catalog track IDs are excluded at the SQL level via `NOT IN (...)` to minimize wasted rejection sampling.
  - Offline crossword factory (`server/services/queryFactory.js`) upgraded to use `searchCatalogByTheme()` in the primary (non-anime) query path.
- **Multiplayer Victory Modal (`src/App.tsx`)**:
  - Replaced blocking `window.alert()` for multiplayer room victories with a state-driven modal matching the EndScreenModal design aesthetic (trophy emoji, yellow gold palette, click-outside-to-dismiss).
- **WebSocket Connection Timeout (`src/services/socketService.ts`)**:
  - Added 10-second timeout on the connection polling interval to prevent indefinite hangs.
- **WebSocket Exponential Backoff (`src/services/socketService.ts`)**:
  - Reconnect delay now doubles on each failure (1500ms → 3000ms → … → 60000ms cap) instead of a fixed 1500ms, preventing thundering-herd reconnects under sustained server unavailability.
- **Node.js Engine Constraint**:
  - Added `"engines": { "node": ">=24.0.0" }` to `package.json` and a `.nvmrc` file pinning the runtime to Node 24.

### Fixed
- **Security: CORS Fallthrough (`server/server.js`)**:
  - Removed implicit `callback(null, true)` that allowed every unknown origin through CORS. Unknown origins now receive a `403` via `callback(new Error('Origin not allowed by CORS policy'))`.
- **Security: `start_game` Host Check (`server/server.js`)**:
  - Corrected inverted boolean — game start now **requires** `playerId` to be present AND match `room.hostId`. Previously any anonymous client could start a room game.
- **Security: Room Player Limit (`server/server.js`)**:
  - Added `MAX_PLAYERS_PER_ROOM = 8` check; joining a full room now sends an `error` message and returns early instead of allowing unbounded memory growth.
- **Room Code Collision Prevention (`server/server.js`)**:
  - `generateRoomCode()` now loops with a retry (up to 50 attempts) until an unused code is found, preventing collision on high-traffic servers.
  - Expanded adjectives vocabulary from 8 to 16 entries (`TEMPO`, `RIFF`, `DROP`, `LOOP`, `VIBE`, `TUNE`, `WAVE`, `ECHO` added).
- **API 404 Handler (`server/server.js`)**:
  - Added `app.use('/api', ...)` catch-all returning `{ error: 'Endpoint not found' }` with `404` status, preventing unmatched API routes from falling through to the SPA HTML handler.
- **Validator Validity Enum (`server/validators.js`)**:
  - Aligned server-side validity enum to include `'wrong'` (the current frontend `CellValidity` value), keeping `'incorrect'` as a legacy alias. Removed `'neutral'` which was never emitted by the frontend.
- **Stale Closure: `handleInputLetter` & `handleBackspace` (`src/hooks/useCrosswordGame.ts`)**:
  - Both handlers now use functional `setUserLetters(prev => ...)` updates, eliminating stale closure captures of `userLetters` in `useCallback` dependency arrays.
- **Duplicate Co-op Event Handler (`src/hooks/useCrosswordGame.ts`)**:
  - Removed the duplicate `coop_cell_update` `useEffect` that was applying the same cell mutation twice per teammate keystroke.
- **Settings localStorage Consolidation (`src/App.tsx`)**:
  - Replaced two separate `localStorage.getItem('spotyspice_settings')` calls (each with try/catch) with a single shared parse.

### Changed
- **ESLint `no-constant-condition` Narrowed**:
  - Removed the global `'no-constant-condition': 'off'` override. The suppression is now scoped only to `server/crawler/**` and `scripts/**` where `while(true)` event loops are legitimate.
- **Test Runner Structure TODO**:
  - Added a detailed comment block at the top of `scripts/run_tests.js` recommending the monolithic file (2200+ lines) be split into per-module test files with a suggested structure.
- **WebSocket Test Authentication**:
  - Updated the WebSocket integration test to send `playerId` on `start_game`, matching the now-enforced host authentication requirement.

---

## [1.12.3] - 2026-09-19

### Added
- **Three-Way Entity Variation for Anime Crosswords (`shared/musicKeywords.js`, `server/services/musicService.js`)**:
  - Added support for extracting **Anime Series Titles** (`clueType: 'Anime title'`) as crossword answers alongside **Song Titles** and **Artist Names** (e.g. solving `SOLA`, `COWBOYBEBOP`, `EVANGELION`, `GUNDAM`).
  - Implemented 4-way balanced rotation across `['anime', 'title', 'artist', 'keyword']` for anime puzzles.
- **Strict Entity Isolation & Zero-Spoiler Clue Discipline (`shared/clueGenerator.js`)**:
  - **Anime Title Clues**: Whichever anime franchise is the solution is strictly excluded from clue text (e.g. `Anime featuring the OP2 theme (2007)` or `Anime featuring the OP2 theme by Aira Yuuki (2007)`).
  - **Artist Clues**: The performer name is strictly excluded from clue text, while providing series and theme context (e.g. `Performer behind the OP2 of "Sola" (2007)`).
  - **Song Title & Keyword Clues**: Song titles and keywords are strictly excluded, and gratuitous artist mentions (`by <Artist>`) have been eliminated from title/keyword clues to prevent confusion and leaks (e.g. `Key word in the OP2 of "Sola"` instead of `... by Aira Yuuki`).

### Changed
- **Suite 11 & Suite 12 Test Expansion (`scripts/run_tests.js`)**:
  - Updated Suite 11 and Suite 12 with tests asserting candidate extraction for anime titles, 3-way rotation, zero leakage across all entities, and strict absence of artist mentions in song title clues.

---

## [1.12.2] - 2026-09-19

### Added
- **AniList GraphQL Artwork Pipeline (`server/services/animeImageService.js`, `scripts/backfill_anime_images.js`)**:
  - Automated AniList GraphQL batch resolver (`Media(id: ..., type: ANIME)`) fetching high-res cover images (`coverImage.large`) for anime series.
  - SQLite migration: Added `image_url TEXT` column to `anime_tracks` with indexed lookups.
  - Just-In-Time (JIT) cover art hydration in `server/services/musicService.js` before returning anime puzzle song pools.
  - Added `npm run anime:images` backfill script for offline catalog artwork synchronization.
- **Anime Victory Screen Presentation & Visual Fallbacks (`src/components/EndScreenModal.tsx`)**:
  - Passed `animeTitle`, `themeSlug`, `themeType`, `imageUrl`, and `isAnimeOped` to client song list.
  - Added graceful `onError` fallback cards featuring stylized gradient backgrounds, vinyl icons, and `OP1`/`ED1` theme badges when images are loading or unavailable.
- **Targeted Keyphrase Deduplication & Solution Blacklisting (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - Implemented `extractAnimeKeyphrase` extracting specific target phrases (e.g., `gundam` from `anime gundam`, `naruto` from `anime openings naruto`).
  - Relaxes artist/franchise deduplication for targeted keyphrases (allowing multiple Gundam tracks or multiple Dolly Parton tracks on dedicated prompts).
  - Blacklists target keyphrase tokens ($\ge 3$ characters) from `seenAnswers` so players are never asked to solve the prompt itself as a grid word.

### Changed
- **Strict 0% Artist Clues for Anime Tracks (`server/services/musicService.js`)**:
  - Anime tracks strictly alternate between `Song title` and `Song title keyword` clues (`allowArtist: false`), eliminating unengaging seiyuu name guesses and spoilers while retaining clean context formatting (e.g. `ED1 of "Jigoku Shoujo Futakomori" by Mamiko Noto (2006)`).
- **Comprehensive Test Suite 12 (`scripts/run_tests.js`)**:
  - Added Suite 12 verifying keyphrase extraction, target deduplication rules, prompt solution blacklisting, 0% artist clue distribution, and anime cover artwork SQLite persistence (expanding test suite to **486 passing tests**).

---

## [1.12.1] - 2026-09-19

### Fixed
- **Anime Audio Preview in Dev Mode (`vite.config.ts`)**:
  - Added `/audio` route proxying in Vite development configuration, forwarding local anime audio preview requests (`/audio/anime/...`) from port `3010` to the Express backend (`3011`). Resolves the `⚠️ Preview unavailable` badge during `npm run dev`.
- **Zero-Spoiler Clue System Overhaul (`shared/clueGenerator.js`, `server/services/musicService.js`)**:
  - Eliminated answer leakage where anime artist clues previously output `by ${track.artist}` (e.g., displaying the solution when asking for "Artist name").
  - Context-aware clue templates for Anime OP/ED:
    - Artist clues: `Vocalist / musical act behind the {themeSlug} of "{animeTitle}" ({year})` (never discloses artist name).
    - Song title clues: `{themeSlug} of "{animeTitle}" by {artist} ({year})` (never discloses song title).
    - Keyword clues: `Key word in the {themeSlug} of "{animeTitle}"` (never discloses keyword).
  - Universal Zero-Leak Sanitizer (`containsAnswerLeak`, `sanitizeClue`): Validates every generated clue against normalized answer strings and component tokens ($\ge 3$ characters), automatically falling back to non-spoilered descriptive templates if any leak is detected.
  - Added Suite 11 to test suite (`scripts/run_tests.js`), verifying audio proxy rules, zero leakage across 500 randomized stress test generations, and expanding test suite to **423 passing tests**.

---

## [1.12.0] - 2026-09-19

### Added
- **Dedicated Anime OP/ED Sourcing & Catalog Engine (`server/db/animeCatalog.js`, `server/services/musicService.js`)**:
  - Independent SQLite schema (`anime_catalog.sqlite`) managing authentic anime openings (OP), endings (ED), and insert tracks.
  - Sourcing isolation: Dedicated routing via `isAnimeTarget()` and `getAnimeThemeType()` ensures anime puzzle requests bypass external general-music collisions.
  - Multi-sample variations: Supports multiple 20-second playback segments (e.g., 5s, 35s, 65s offsets) per track for dynamic playback variation.
  - Local preview delivery: Express static file route at `/audio/anime` for serving locally verified OP/ED preview clips.
- **FFmpeg Preview Pipeline & Batch Generator (`server/services/ffmpegHelper.js`, `scripts/generate_anime_samples.js`)**:
  - Robust FFmpeg utility extracting precise 20-second audio clips at key chorus/hook timestamps without external API dependencies.
  - `npm run anime:samples`: Configurable batch generator with concurrent workers and duration validation.
- **Anime Catalog Sync & Ingest Scripts (`scripts/sync_anime_metadata.js`, `scripts/ingest_anime_catalog.js`)**:
  - `npm run anime:sync`: Synchronizes anime theme metadata including series titles, season years, artists, and media sources.
  - `npm run anime:ingest`: Ingests mapped themes and audio variations into the SQLite anime catalog.
- **Database Validation, Deduplication & Sanitization Engine (`server/db/catalogValidator.js`, `scripts/validate_and_sanitize_db.js`)**:
  - Structural and relational integrity audits via `PRAGMA integrity_check` and foreign key constraint validation.
  - Semantic duplicate clustering detecting identical tracks across normalized tokens and +/- 3-second duration variance.
  - Contamination detection purging corrupt audio entries, tracks < 15 seconds, and audiobook contaminations.
  - Added `npm run db:validate` and `npm run db:sanitize` CLI workflows with automated Markdown reporting (`reports/database_validation_report.md`).
- **Automated Test Expansion (`scripts/run_tests.js`)**:
  - Added Suites 9 and 10 testing catalog validation, duplicate deduplication, contamination purging, and isolated anime OP/ED routing, expanding automated coverage to **396 passing tests**.

### Changed
- **Git Hygiene & Media Safeguards (`.gitignore`)**:
  - Comprehensive blanket exclusions for raw audio media (`*.mp3`, `*.aac`, `*.m4a`, `*.wav`, `*.flac`, `*.ogg`, `*.opus`, `*.webm`), local sample folders (`data/anime_samples/`, `**/samples/`), and SQLite binaries (`*.sqlite*`, `*.db*`).

---

## [1.11.0] - 2026-09-19

### Added
- **Automated Crossword Judgment Suite (`server/services/crosswordJudge.js`)**:
  - `judgePuzzle(puzzle, context)`: Evaluates grid integrity, language compliance (with culturally bounded exemptions for K-Pop, Anime, Japanese, Latin, and Bossa Nova), single-artist thematic fidelity (0 leaked artist-name clues), and authenticity (rejection of covers, instrumentals, karaoke, and audio utilities).
  - `judgeMultiGenerationSuite(prompt, puzzles, context)`: Aggregates N generations per prompt to measure Jaccard similarity overlap, unique track ratios, popularity distribution (High, Mid, Catalog tiers), and length variety shares.
- **Cultural and Linguistic Guardrails (`server/services/musicService.js`)**:
  - `isAnimeTrack(track)`: Strictly validates authentic anime opening, ending, and soundtrack themes, guarding against Western collisions (e.g. DJ AniMe, Ben Mazué, French/Latin homonyms).
  - `isJapaneseTrack(track)`: Authenticates verified Japanese artists and City Pop icons while rejecting Western homonyms (e.g. The Japanese House, Aneka).
  - Expanded cover and audio modification rejection filters: filters out YouTube guitar/piano/harp covers (e.g. Fonzi M), backing tracks, and workout mixes.
- **Answer Word Length Variance & Stratified Querying (`server/services/queryFactory.js`, `server/db/sqliteCatalog.js`)**:
  - `LENGTH_ROTATION` ensures high-frequency injection of short (3-5 letter) words across all archetypes, achieving 48% to 94% short word representation across crosswords.
  - Stratified 10-tier popularity retrieval with random sampling (`CAST(t.popularity / 100000 AS INT) DESC, RANDOM()`) maximizes track diversity across queries.
- **Large-Scale Evaluation Suite (`scripts/eval_crossword_factory.js`, `npm run eval:crosswords`)**:
  - Scales generation trials to 150-300 per puzzle and runs 138 crossword executions (46 prompts x 3 generations) across Dense, Small, Themed, Custom, and Edge-Case suites.
  - Automatically produces detailed markdown evaluation report at `reports/crossword_evaluation_report.md`.
- **Comprehensive Unit Tests (`scripts/run_tests.js`)**:
  - Added 25 unit and integration tests for anime/Japanese separation, authenticity filtering, judge metrics, and multi-generation aggregation, expanding the automated suite to 350 passing tests.

### Changed
- **Placement Engine Trials Default (`shared/liveCrossword.js`)**:
  - Increased placement attempts from 50/80 to 150/300 trials with typed `options.trials` support.

---

## [1.10.2] - 2026-09-19

### Added
- **Dataset Preparation & Download Utility (`scripts/fetch_datasets.js`, `npm run fetch:datasets`)**:
  - Automatically fetches Anna's Archive Spotify Top 10k table into local `data/spotify_top10k.html`.
  - Scans and validates local `data/base_tables/` and `data/changes/` directories.
  - Comprehensive CLI guide and download links for MusicMoveArr datasets and incremental MEGA diffs.
- **Local File Fast-Path in Anna's Ingestor (`scripts/ingest_annas_spotify.js`)**:
  - Added support for `--file=...` and automatic fallback to `data/spotify_top10k.html`, enabling instant offline re-ingestion in under 2 seconds.

### Changed
- **Git Hygiene**:
  - Updated `.gitignore` to strictly exclude dataset dumps (`*.csv`, `*.tsv`, `*.sql`, `*.sql.gz`, `*.html`, `*.gz`, `*.tar*`, `data/downloads/`) while preserving tracked pools and directory structure (`.gitkeep`).

---

## [1.10.1] - 2026-09-19

### Fixed
- **MusicMoveArr Ingestor Initial DB Stats Logging (`scripts/ingest_musicmovearr.js`)**:
  - Resolved `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` by aligning stats property access with `audioSamples` and `crossReferencedTracks`.
  - Added backward-compatible alias properties (`samples`, `crossReferenced`) to `sqliteCatalog.getStats()` to ensure resilience across CLI commands and logging utilities.

---

## [1.10.0] - 2026-09-19

### Added
- **MusicMoveArr Dataset Streaming Ingestor (`scripts/ingest_musicmovearr.js`, `npm run ingest:dataset`)**:
  - Implemented streaming ingestion engine for the [MusicMoveArr Datasets](https://github.com/MusicMoveArr/Datasets) (Deezer, Spotify, Tidal, MusicBrainz base dumps and compressed incremental `.sql.gz` diffs from MEGA).
  - Enforces Scenario C filtering: strict `popularity > 30` (default `--min-popularity=31`) and `isAuthenticCandidate({ requireSample: false })`, pruning noise, amateur covers, and karaoke.
  - Memory-safe stream processing using Node.js `readline` and `zlib.createGunzip()`, batching 2,000 tracks per SQLite transaction via `sqliteCatalog.upsertBatch()`.
  - Automatic WAL journal compaction (`PRAGMA wal_checkpoint(TRUNCATE)`) every 100,000 tracks to keep disk footprint strictly controlled.
- **On-the-Fly Lazy JIT Preview Hydration Engine (`server/services/previewResolver.js`)**:
  - Implemented on-demand audio preview resolution: tracks ingested from MusicMoveArr start with instant metadata (`sample_url = NULL`) and are resolved JIT when selected for live gameplay.
  - Multi-tiered resolution pipeline:
    1. Instant existing URL hit (`sample_url` or `audioUrl`).
    2. Fast-path Deezer Track API lookup via stored `deezer_id` (sub-150ms).
    3. Fallback Deezer artist + title search.
    4. Fallback iTunes Search API lookup (by ISRC or artist + title).
  - Parallel batch resolution via `batchResolvePreviews(tracks)` using `Promise.allSettled`.
  - Asynchronously persists verified audio previews into SQLite `track_samples` table (`sqliteCatalog.insertSample`), turning first-time resolutions into zero-latency future cache hits.
  - Bounded in-memory preview cache (`inMemoryPreviewCache`) to eliminate redundant external API requests during active gameplay sessions.
- **High-Performance SQLite Engine (`server/db/sqliteCatalog.js`)**:
  - Configured `PRAGMA mmap_size = 2147483648;` (2GB memory-mapped I/O) and `PRAGMA cache_size = -64000;` (64MB page cache) enabling sub-10ms queries across millions of tracks.
  - Added covering indexes: `idx_tracks_pop_year`, `idx_tracks_lang_country`, `idx_providers_lookup`, `idx_providers_provider_id`.
  - Added `sqliteCatalog.insertSample(trackId, sampleData)` for runtime sample persistence.
  - Extended `sqliteCatalog.getRandomPlayableTracks({ allowSampleless: true })` to harvest sampleless candidate tracks and attach provider IDs (`deezer_id`, `spotify_id`, `itunes_id`).
- **Music Service Candidate Harvesting & JIT Hydration (`server/services/musicService.js`)**:
  - Integrated local SQLite candidate harvesting directly into candidate tasks when generating puzzles.
  - Embedded JIT Lazy Preview Hydration before crossword layout generation, filtering for 100% playable tracks with verified audio previews.
- **Automated Test Suite Expansion (`scripts/run_tests.js`)**:
  - Added 30 new tests covering CSV/TSV parsing, SQL tuple parsing, candidate mapping, numeric track ID extraction, preview resolution, batch resolution, and SQLite sampleless/lazy hydration workflows (total: 321 passing tests).

---

## [1.9.7] - 2026-09-19

### Added
- **Agent Guidelines & Repository Manual (`agents.md`)**:
  - Created comprehensive agent operations manual detailing branching/PR discipline, version synchronization rules, secrets security, and SQLite concurrency/WAL invariants.
  - Documented crawler discovery vectors, two-tier deduplication, authenticity filtering, and live multiplayer WebSocket protocols.
  - Included a structured pre-commit checklist for automated AI agent sessions.
- **Agent Skills (`.agents/skills/`)**:
  - Added `catalog-crawler` skill (`.agents/skills/catalog-crawler/SKILL.md`) for crawler management, status inspection, and WAL compaction.
  - Added `crossword-engine` skill (`.agents/skills/crossword-engine/SKILL.md`) for crossword layout placement, answer extraction, and homonym protection.
  - Added `release-discipline` skill (`.agents/skills/release-discipline/SKILL.md`) for enforcing git hygiene, version bumps, test verification, and PR creation.
- **Git Hygiene (`.gitignore`)**:
  - Added `.gemini/` to `.gitignore` to prevent local AI runtime state from leaking into version control.

---

## [1.9.6] - 2026-09-19

### Added
- **Anna's Archive Spotify Top 10k Ingestor (`scripts/ingest_annas_spotify.js`)**:
  - Implemented streaming HTML table parser that downloads and ingests the top 10,000 songs by popularity from Anna's Archive (`https://annas-archive.gl/blog/spotify/spotify-top-10k-songs-table.html`).
  - Added strict `popularity > 30` filtering and multi-artist, ISRC, and explicit flag parsing.
  - Added `npm run crawl:top10k` script for one-command execution.
- **Dedicated Playlist Crawling Script (`npm run crawl:playlists` / `--playlists-only`)**:
  - Added `--playlists-only` CLI flag to `scripts/crawl_catalog.js` allowing dedicated playlist harvesting without running decades, artists, or lexicon vectors.
  - Added `npm run crawl:playlists` script to `package.json`.

### Improved
- **Authenticity Candidate Filter (`server/crawler/authenticityFilter.js`)**:
  - Added configurable `{ requireSample = true }` option to `isAuthenticCandidate` to allow ingesting high-reputation metadata records (e.g., Spotify top tracks) for subsequent iTunes/cross-provider preview backfills while filtering noise and tributes.
- **Crawler Batch Summary (`scripts/crawl_catalog.js`)**:
  - Extended crawl completion summary to report `yearGenreQueriesCrawled` and `bigramsCrawled`.

---

## [1.9.5] - 2026-09-19

### Improved
- **SQLite Concurrency & Lock Resilience (`server/db/sqliteCatalog.js`)**:
  - Configured `PRAGMA busy_timeout = 10000;` on SQLite initialization.
  - Automatically handles concurrent transaction retries up to 10 seconds, eliminating `database is locked` exceptions under heavy asynchronous ingestion.

---

## [1.9.4] - 2026-09-19

### Added
- **Decade/Genre Crawler Control (`--decades=<n>`)**:
  - Added `decadesLimit` option to `musicHarvester.runFullHarvest` and `--decades=<n>` CLI argument in `scripts/crawl_catalog.js`.
  - Enables skipping or scoping Vector 2 (e.g. `--decades=0`) when running targeted high-speed crawler runs.
  - Documented `--decades=<n>` in the `README.md` flags table.

---

## [1.9.3] - 2026-09-19

### Added
- **Country Code & Language Tracking (`server/db/sqliteCatalog.js`)**:
  - Added `country_code TEXT` and `language TEXT` columns with dedicated B-tree indexes (`idx_tracks_country`, `idx_tracks_lang`) to the `tracks` schema.
  - Implemented `extractIsrcCountryCode` to automatically extract the ISO 3166-1 2-letter country code from the standard 12-character ISRC registration prefix.
  - Implemented `detectTrackLanguage` to detect language tags (`en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `zh`, `ru`, `ar`) via Unicode script analysis and linguistic markers.
  - Added automated non-blocking migration and fast backfill across all existing catalog tracks.
- **500,000 Tracks Discovery Vectors (`server/crawler/harvester.js`, `scripts/crawl_catalog.js`)**:
  - Added **Vector 5: Fine-Grained Year (1960–2026) $\times$ Genre Matrix (`YEAR_GENRE_SEEDS`)** generating over 1,600 highly targeted historical and contemporary discography queries.
  - Added **Vector 6: High-Yield Bigram Sweeper (`BIGRAM_SEEDS`)** covering 60+ top musical n-grams.
  - Expanded `MUSIC_LEXICON_SEEDS` with 500+ rich musical, emotional, atmospheric, and multilingual vocabulary seeds.
  - Updated default `--target` to `500000` and added Country Code and Language counts to `crawl:status` output.

---

## [1.9.2] - 2026-09-18

### Changed
- **Gitignore Local SQLite Databases (`.gitignore`)**:
  - Added `*.sqlite` and `server/data/catalog.sqlite*` to `.gitignore` to keep the Git repository lightweight and free of binary database blobs.
  - Untracked `server/data/catalog.sqlite` from Git index while preserving local database files.
- **Documentation for SQLite Initialization & Population (`README.md`)**:
  - Documented automatic schema initialization via Node.js 24 native `node:sqlite` (`DatabaseSync`).
  - Added comprehensive step-by-step instructions and CLI options table for populating the database at various scales (quick seed, standard catalog, massive 100k catalog).

---

## [1.9.1] - 2026-09-18

### Changed
- **Music Catalog Milestone (100,033 Canonical Tracks)**:
  - Completed multi-vector lexicon harvest sweep, bringing the local SQLite music database (`server/data/catalog.sqlite`) to **100,033 canonical tracks**, **33,455 unique artists**, **100,036 verified audio samples**, and **6,590 cross-referenced tracks**.
  - Executed WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`) consolidating all transaction journals directly into `catalog.sqlite` at an ultra-compact 88.0 MB file size.
  - Added unique constraint collision safeguards to `getOrCreateArtist` handling artist metadata updates.

---

## [1.9.0] - 2026-09-18

### Added
- **Massive 100,000+ Track Catalog Expansion (`server/crawler/harvester.js`, `scripts/crawl_catalog.js`)**:
  - Expanded the catalog crawler architecture with four high-yield discovery vectors targeting $\ge 100,000$ canonical songs:
    1. **Curated Playlist Vector (`harvestCuratedPlaylists`)**: Deep-spidering across 40+ genre and historical playlist searches (e.g. *Rock Classics*, *Billboard Hot 100*, *90s Alternative*, *Motown Essentials*, *Electronic Journey*, *City Pop Vibes*), ingesting entire curated tracklists.
    2. **Decade $\times$ Genre Matrix Sweeper (`DECADE_GENRE_SEEDS`)**: Cross-product matrix combining 7 eras (1960s to 2020s) across 15 musical genres (rock, pop, hip-hop, r&b, soul, jazz, electronic, indie, metal, latin, reggae, country, funk, punk, dance) with multi-offset pagination.
    3. **Foundation & Recursive Artist Graph Spider (`harvestArtistDiscography`)**: Expanded foundation artist roster to 200+ global musical icons across all genres and eras, spidering studio albums, top releases, and dynamically discovering authentic related artists with $\ge 100,000$ fans.
    4. **350+ Expanded Lexicon Vocabulary Sweep (`MUSIC_LEXICON_SEEDS`)**: Broadened high-frequency musical title vocabulary spanning English and international song titles across 3 paginated result windows per keyword.
  - Added CLI flag `--target=<number>` to `scripts/crawl_catalog.js` (defaulting to 100,000 tracks) with dynamic percentage completion tracking, live artist/track counters, and automatic graceful termination upon reaching the target goal.
- **Enhanced Authenticity & Deduplication at Scale**:
  - Upgraded normalization regexes to strip `(?:radio\s+)?edit` and multi-bracket qualifiers, ensuring radio edits seamlessly merge into their parent master recordings.
  - Verified cross-referencing with Apple Music / iTunes candidate mapping for acoustic duration delta $\le 3$s.

---

## [1.8.0] - 2026-09-18

### Added
- **Native SQLite Catalog & Storage Engine (`server/db/sqliteCatalog.js`)**:
  - Engineered a high-performance local SQLite database leveraging Node.js 24's native `node:sqlite` (`DatabaseSync`), requiring zero external native compilation or C++ dependencies.
  - Configured WAL mode (`PRAGMA journal_mode = WAL;`) and batched transaction commits (`upsertBatch`), supporting over 40,000 writes/sec and non-blocking reads.
  - Implemented FTS5 full-text indexing (`tracks_fts`) for sub-millisecond crossword clue lookups across titles, artists, and albums.
- **Autonomous Multi-Vector Catalog Crawler (`server/crawler/harvester.js`, `scripts/crawl_catalog.js`)**:
  - Multi-vector catalog crawler harvesting thousands of canonical songs beyond top charts:
    - **Artist Discography Spider**: Explores studio discographies and top releases for iconic artists across rock, pop, hip-hop, electronic, 80s/90s, jazz, K-Pop, anime, and Latin genres.
    - **Music Lexicon Vocabulary Sweeper**: Sweeps a dictionary of 100+ high-frequency musical title words across paginated search indices.
  - CLI management scripts (`npm run crawl`, `npm run crawl:status`) with live progress reporting, merge stats, and status summaries.
- **100% Deterministic Cross-Referencing & Deduplication Engine (`server/db/sqliteCatalog.js`)**:
  - **Tier 1 ISRC Matching**: Merges cross-platform master recordings deterministically via 12-character International Standard Recording Codes.
  - **Tier 2 Acoustic & Title Compound Keying**: Merges catalog entries across Deezer and Apple Music/iTunes using normalized artist canonical keys, noise-stripped core titles, and strict acoustic duration delta constraints ($\le 3$ seconds).
  - Unifies multi-provider audio samples (Deezer MP3 and iTunes AAC 30s clips) and external store links under single canonical track records.
- **Strict Multi-Layer Authenticity Filter (`server/crawler/authenticityFilter.js`)**:
  - Automatically screens out covers, tributes, karaoke, soundalikes, parody versions, lo-fi/phonk remixes, lullaby renditions, workout tracks, and non-official uploads.
  - Enforces mandatory playable 30s audio sample verification and legitimate musical duration bounds (45s to 20m).
- **Polite Token-Bucket Rate Limiting & Backoff (`server/crawler/rateLimiter.js`)**:
  - Enforces strict rate limits honoring provider constraints (Deezer at 5 req/s; iTunes at 15 req/min) with polite `User-Agent` identification and exponential backoff on HTTP 429/503.
- **Comprehensive SQLite & Crawler Automated Test Suite (`scripts/run_tests.js`)**:
  - Added 24 dedicated test cases covering in-memory SQLite schema initialization, multi-provider ISRC and compound deduplication, authenticity filtration, and token-bucket rate limiter refills (increasing test suite to 280 passing tests).

---

## [1.7.0] - 2026-09-18

### Removed
- **Gemini LLM Judge Layer (`server/services/geminiJudge.js`, `server/config.js`, `server/services/musicService.js`)**:
  - Completely removed the external LLM judge dependency, simplifying the backend pipeline, eliminating external network latency and 503 high-demand failures while relying on deterministic high-precision rule engines and verified catalog querying.

### Added
- **Word Field Audio Auto-Play on Click (`src/components/AudioPlayerBar.tsx`, `src/hooks/useCrosswordGame.ts`, `src/App.tsx`)**:
  - Selecting any clue or grid cell now instantly plays that track's audio preview. If audio was previously paused or finished, playback automatically rewinds to 0:00 and starts.
- **Dedicated Keyboard Shortcuts Cheat-Sheet (`src/components/HintModal.tsx`)**:
  - Separated `<kbd>` tags from action buttons into a dedicated, clean keyboard shortcuts card at the bottom of the hint modal (`Space` for letter, `Tab` for word, `Shift + Tab` for entire puzzle).
- **Persistent Input on "Next Puzzle" & Loading Indicator (`src/App.tsx`, `src/components/EndScreenModal.tsx`, `src/components/LiveGeneratorModal.tsx`)**:
  - Pressing "Next Puzzle" on the victory screen now faithfully regenerates another crossword using the exact active configuration (custom prompt, genre preset, popularity tier, target words), avoiding unwanted resets to generic random themes.
  - Added an interactive `Loader2` spinning indicator on the Next Puzzle button during generation.
- **Full Multi-Line Artist Typography on Victory Screen (`src/components/EndScreenModal.tsx`)**:
  - Replaced single-line clipping with flexible wrapping and `min-w-0` bounding, ensuring featuring artists, long band names, and multi-artist collaborations are fully legible.
- **Answer Length Variety Engine (`shared/musicKeywords.js`, `server/services/musicService.js`)**:
  - Introduced rotating answer length target buckets (`short`: 3–5, `medium`: 6–8, `long`: 9–14 characters) with graceful fallbacks, ensuring puzzles feature an engaging variety of short punchy words and sweeping title phrases.
- **Strict English Enforcement for Random Crosswords (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - Directed random catalog queries to English billboard charts and expanded stopword detection against Spanish, French, German, Italian, Portuguese, and Dutch lyrics.
- **Strict Temporal Release Date Verification (`server/services/musicService.js`)**:
  - Fixed custom prompt temporal parsing (`yearRange`) to strictly verify actual track/album release years or vintage remaster stamps, rejecting out-of-range or unverified tracks.
- **Cross-Session Anti-Repetition Persistence (`src/services/dynamicMusicService.ts`, `server/services/musicService.js`)**:
  - Switched recent track history from `sessionStorage` to `localStorage` (storing up to 500 tracks and normalized artist keys across visits).
  - Deepened Deezer search offset steps (0–175) and added recent artist frequency penalties to ensure fresh catalog variety.

### Fixed
- **Selective Hint Validation (`src/hooks/useCrosswordGame.ts`)**:
  - Fixed a bug where applying a single letter or word hint invoked `validateGrid`, prematurely coloring untested letters on the board. Hints now validate only the revealed cells.

---

## [1.6.2] - 2026-09-18

### Added
- **Query Precision & Grounded Candidate Replenishment (`server/services/musicService.js`, `server/services/queryBuilder.js`, `server/services/deezerMusicProvider.js`, `server/services/geminiJudge.js`)**:
  - **Elevated Catalog Taxonomy Thresholds**: Raised Deezer minimum fans from 1,000 to 25,000 and minimum rank from 100,000 to 200,000 for anime catalog harvesting, pruning bedroom uploads, karaoke demos, and amateur meme audio while admitting verified anisong chart-toppers.
  - **Curated Official Japanese Anisong Artist Seeds**: Injected authentic anisong performers (*YOASOBI*, *LiSA*, *Ado*, *Kenshi Yonezu*, *FLOW*, *RADWIMPS*, *Asian Kung-Fu Generation*, *Eve*, *Official HIGE DANdism*, *TK from Ling tosite sigure*, *SawanoHiroyuki[nZk]*, *ClariS*, *Creepy Nuts*, *SPYAIR*, *UVERworld*) into the query planner to anchor candidate pools with legitimate anime soundtrack releases.
  - **Audio Mod, Fan Cover Channel & Music Box Filtering**: Hardened `isAuthenticTrack` to filter unofficial YouTube cover artists (*Pellek*, *Little V.*, *ShiroNeko*, *Jonathan Young*, *NateWantsToBattle*, *Tsuko G.*, *RichaadEB*, *Rainych*, *AmaLee*), generic music box/lullaby ensembles, and title modifications (*music box*, *lullaby*, *bgm cover*, *fan cover*, *metal cover*, *rock cover*, *guitar cover*, *violin cover*, *piano cover*, *synth cover*, *lo-fi remix*, *phonk remix*).
  - **Western Animation & Cross-Genre Leakage Guardrails**: Expanded `isThematicallyPermitted` in anime mode to reject Western animation soundtracks (*Disney*, *Pixar*, *DreamWorks*, *Illumination*, *Moana*, *Frozen*, *Encanto*, *Lion King*, *Aladdin*, *Toy Story*, *Shrek*), literal novelty titles matching `/^anime\s+(theme|song|ost|music)$/i`, American television drama releases (*Empire Cast*), and unrelated Latin pop (*Sandoval*) or Moroccan hip-hop (*Dizzy DROS*) lacking Japanese context.
  - **Generic Soundtrack Cue Abbreviation Filter**: Filtered out generic 2-letter soundtrack abbreviations as crossword answers (`TV`, `OP`, `ED`, `OST`, `BGM`) in `trySelectTracks`, falling back to artist names or alternative keywords.
  - **Compound Refinement Queries & Storefront Inheritance**: Re-engineered the replenishment loop to construct compound provider queries (`artist:"${artist}" track:"${title}"` for Deezer, `"${artist} ${title}"` for iTunes) whenever both artist and title are available, anchored single titles with theme context (`"${title} anime"`), and inherited the puzzle theme's regional storefront (e.g. `jp` for anime) to prevent cross-genre hit collisions during LLM Judge backfills.
- **Automated Test Suite Expansion (`scripts/run_tests.js`)**:
  - Added 13 automated test cases verifying anime taxonomy thresholds, cover channel and audio mod filtering, Western animation exclusions, and compound prompt guidance (290 total automated tests).

---

## [1.6.0] - 2026-09-18

### Added
- **Gemini LLM Judge Song Selection Enhancement (`server/services/geminiJudge.js`, `server/services/musicService.js`)**:
  - Leverages Google Gemini to evaluate candidate song pools after initial sampling and filter out off-topic, novelty, or theme-inappropriate tracks.
  - **Model Priority, Intra-Model Retries & Fallback Cascade**: Evaluates with `gemini-3.8-flash` primarily, retrying up to 4 times per model with exponential backoff on temporary 503 high-demand spikes, 429 rate limits, or network timeouts before gracefully cascading to `gemini-3.7-flash`, `gemini-3.6-flash`, and `gemini-3.5-flash` (with immediate break on 404s).
  - **Full Input Context Contract**: Injects the exact user configuration into the evaluation prompt—including mode (`preset theme` or `custom free-text prompt`), specific theme title or prompt string, popularity profile (`mainstream`, `balanced`, `obscure`, `pure`), and target word count.
  - **Negotiated Contract for Replacements**: When tracks are rejected, Gemini provides structured replacement query parameters (`artist`, `trackTitle`, `genre`, `searchTerms`, bounded `yearRange`, `targetStorefront`, `popularity`) that directly map to catalog query engines.
  - **Iterative Refinement Loop**: Dispatches replenishment queries across music providers (Deezer and iTunes), cleans tracking sets, and loops evaluation up to 4 iterations until the LLM Judge is satisfied or the pool is finalized.
  - **Zero-Overhead Standby Mode**: When `GEMINI_API_KEY` is `'TODO'` or unset, the service remains in standby mode without making network calls or adding latency, maintaining full backward compatibility.
- **Secure Key Configuration (`server/config.js`, `.env.example`)**:
  - Centralized environment loader reading `.env` (guarded by `.gitignore`).
  - Set default `GEMINI_API_KEY=TODO` in `.env.example` ensuring secrets are never committed to the repository.
- **Automated LLM Judge Test Suite (`scripts/run_tests.js`)**:
  - 47 automated test cases covering standby mode bypass, negotiated contract normalization, prompt context synthesis, 4x intra-model retries on 503 spikes, cascade fallback ladder (`3.8 -> 3.7 -> 3.6 -> 3.5`), and multi-round iterative replenishment (277 total automated tests).

---

## [1.5.2] - 2026-09-18

### Changed
- **Automatic Audio Silence on Puzzle Completion & Reveal (`src/components/AudioPlayerBar.tsx`, `src/App.tsx`, `src/hooks/useCrosswordGame.ts`, `src/components/EndScreenModal.tsx`)**:
  - Automatically pauses background music snippets and resets playback state whenever the full crossword puzzle is revealed (via hint modal or `Shift+Tab` hotkey) or completed (all words correctly solved).
  - Wired `isCompleted` and `showEndScreen` state into `AudioPlayerBar`, ensuring background audio immediately cuts out when opening the victory showcase.
  - Added guards to prevent automatic audio snippet playback on clue transitions when the puzzle has reached completion.
  - Enhanced `EndScreenModal` with lifecycle unmount cleanup ensuring audio previews stop cleanly without dangling audio elements.
  - Corrected `validateGrid` and `handleRestartPuzzle` state transitions so `isCompleted` reliably resets to `false` when a puzzle is restarted or cleared.

---

## [1.5.1] - 2026-09-18

### Added
- **Multi-Crossing Variety Engine (`shared/liveCrossword.js`)**:
  - Engineered dynamic intersection management ensuring crossword words cross each other **1 to 3 times** in an organic, distributed lattice.
  - Eliminated "starburst/telephone pole" patterns where single backbone words monopolized crossings leaving other words with only 1 intersection.
  - Placements enforce a strict maximum of 3 crossings per word and evaluate crossed words to prevent exceeding the 3-crossing ceiling.
  - Added variety distribution scoring in puzzle trials: awards bonuses for achieving a balanced combination of 1-crossing, 2-crossing, and 3-crossing words while penalizing over-concentrated single-crossing leaf branches.
  - Attached clue-level `crossings` metadata in `Clue` and `Puzzle` outputs.
  - Added unit test suite assertions verifying 1–3 crossing bounds and multi-crossing frequency diversity across puzzle generations (230 total automated tests).

---

## [1.5.0] - 2026-09-18

### Added
- **Lounge Settings Screen (`src/components/SettingsModal.tsx`, `src/App.tsx`, `src/components/LoungeDrawer.tsx`)**:
  - New dedicated Lounge Settings modal accessible via the header toolbar gear icon and slide-over menu.
  - Interactive toggle switch for word correct celebration animations (`enableWordAnimations`), persisted in `localStorage` (`spotyspice_settings`).
  - Interactive master default volume slider from 0% to 100% with live percentage readout.
  - Turntable keyboard shortcuts reference card.
- **K-Pop Generation Temporal Parsing (`server/services/queryBuilder.js`)**:
  - Added natural language parsing for K-Pop generations in free-text prompts:
    - `new gen`, `4th gen`, `5th gen` -> bounds release window to `2020-2026` and anchors genre to `kpop`.
    - `3rd gen` -> bounds release window to `2012-2019`.
    - `2nd gen` -> bounds release window to `2003-2011`.
    - `1st gen` -> bounds release window to `1990-2002`.
  - Added flagship modern K-Pop group seeding (`NewJeans`, `LE SSERAFIM`, `aespa`, `Stray Kids`, `IVE`, `ENHYPEN`, `TXT`, `ITZY`, `KISS OF LIFE`) to ensure prompt richness.
- **Authenticity & Imitation Filter (`server/services/musicService.js`)**:
  - Built `isAuthenticTrack` to reject workout compilations and soundalikes (`Power Music Workout`, `Fitness Workout`), 8-bit arcade tribute versions (`8-Bit Arcade`), generic retrospective packaging (`1981 Rock Classics`), and audio speed modifications (`(Slowed + Reverb)`, `(Sped Up)`, `(Nightcore)`, `(Instrumental Version)`).

### Changed
- **Default Master Volume Reduced to 15% (`src/components/AudioPlayerBar.tsx`, `src/components/EndScreenModal.tsx`)**:
  - Lowered base preview audio volume from 25% to a gentle, comfortable 15% across all audio elements with `localStorage` user persistence.
- **Open Shuffle & Random Crossword Quality Elevation (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - Elevated default popularity for open shuffle from uncurated `pure` (`minFans: 0`, `minRank: 0`) to `balanced` (`minFans: 25,000`).
  - Eliminated arbitrary 2-letter alphabetic random seeds (`"rh"`, `"gl"`, etc.) in open shuffle in favor of curated rotating genre chart pools.
  - Added strict multilingual stopword filtering and `foreignGenres` rejection (e.g. `Pop Latino`, `Música Mexicana`, `Urbano latino`, `MPB`, `French Pop`) to prevent non-English and obscure international tracks from slipping into standard puzzles.
  - Added filters for classical orchestral movements (`Symphonie`, `Concerto`, `Larghetto`) and children's nursery rhyme albums.
- **Crossword Grid Animation Control (`src/components/CrosswordGrid.tsx`)**:
  - Connected `enableWordAnimations` prop to conditionally trigger tile celebration ripples.

### Fixed
- **Thematic Precision & Western Collisions in K-Pop & Other Themes (`server/services/musicService.js`, `server/services/deezerMusicProvider.js`)**:
  - Prevented generation prefix leakage (`"gen kpop"`) from entering search queries.
  - Added hard guardrails rejecting Western acts matched via token homonyms (Steven Wilson, Carrie Underwood, Destiny's Child, Billy Idol, Hozier, M4rkim, etc.).
  - Added foreign dub marker filtering, rejecting French dubs and language translations (e.g. `Saja Boys - Soda Pop (version française)`).
  - Cleaned up keyword taxonomies across `gaming`, `cinematic`, `poppunk`, `hiphop`, and `edm`.

---

## [1.4.9] - 2026-09-18

### Added
- **Audio Sample Interactive Scrubber & Playback Controls (`src/components/AudioPlayerBar.tsx`)**:
  - Replaced the static progress ribbon with an interactive scrubber bar equipped with playhead thumb, clickable track seek, current timestamp, total duration (`0:14 / 0:30`), and quick `-5s` / `+5s` jump buttons.
- **Word Completion Celebration Animation (`src/index.css`, `src/hooks/useCrosswordGame.ts`, `src/components/CrosswordGrid.tsx`)**:
  - Detects when an active word is fully filled and correct.
  - Plays a staggered tactile spring bounce animation (`@keyframes letter-correct-pop`) across each letter cell with an emerald and gold celebration aura.
- **Reveal Whole Puzzle Hotkey (`src/components/CrosswordGrid.tsx`, `src/components/HintModal.tsx`, `src/App.tsx`)**:
  - Bound `Shift + Tab` as a direct keyboard shortcut to solve and reveal the entire puzzle.
  - Updated `<kbd>` badges in the Hint modal and action tooltips.

### Changed
- **Crossword Tile Typography & Readability Rework (`src/components/CrosswordGrid.tsx`)**:
  - Increased letter font size from `48%` to `58%` of cell size (`15px` to `27px`) in bold/black uppercase (`font-sans font-black`).
  - Redesigned cell states for high-contrast legibility: crisp white cardstock for standard tiles, luminous amber for active words, and bright gold with radiant ring for selected tiles.
- **Dense Crossword Placement Engine with Multi-Crossing Scoring (`shared/liveCrossword.js`)**:
  - Overhauled crossword generation from first-intersection placement to an exhaustive multi-intersection compactness scoring algorithm.
  - Exponentially rewards 2+ crossing letters (+120 bonus), penalizes bounding box sprawl, and runs 30 randomized trials to select the densest layout with maximum interlocking words.
- **Answer Length Variation (2 to 14 Letters) (`shared/musicIdentity.js`, `shared/musicKeywords.js`, `server/services/musicService.js`)**:
  - Expanded answer length boundaries to 2–14 letters, allowing punchy short keywords (`UP`, `GO`, `DIE`, `APT`) and longer titles (`DIEWITHASMILE`).
  - Added rotating length buckets (`short`, `medium`, `long`) when assembling puzzle candidate tracks.
- **Two-Column Clue Layout (`src/components/ClueList.tsx`, `src/App.tsx`)**:
  - Split Across (Horizontal) and Down (Vertical) clues into a balanced 2-column side-by-side grid, utilizing the full screen width and eliminating empty dead space.

### Removed
- **Header Badge (`src/App.tsx`)**:
  - Removed the `LIVE SALON` badge from the header.

### Fixed
- **Feature & Collaboration Concatenation Elimination (`shared/musicKeywords.js`)**:
  - Ensured collaborating artists (e.g. `ROSÉ & Bruno Mars`) are strictly emitted as separate candidate entities (`ROSE` and `BRUNOMARS`), never concatenated into combined answers like `ROSEBRUNOMARS`.
  - Added case-insensitive feature stripping for unparenthesized and parenthesized features (`feat.`, `ft.`, `featuring`) while protecting genuine title words (`Die With A Smile`).

---

## [1.4.8] - 2026-09-18

### Fixed
- **Deezer Artist ID 147485 ("Anime" / DJ AniMe) & Collaborator Elimination (`server/services/queryBuilder.js`, `server/services/musicService.js`, `server/services/deezerMusicProvider.js`)**:
  - Identified the exact source of Italian hardcore techno DJ Barbara Palermo (Deezer Artist ID `147485`, indexed as `"Anime"` with 15,791 fans): Deezer's search engine treated the raw search term `q=anime` as a direct artist lookup, surfacing her solo tracks and collaborating artists (*Broken Minds*, *DJ Paul Elstak*, *Miss K8*, *MAD DOG*).
  - Replaced raw bare `'anime'` queries in `generateThemeVariations` with compound Japanese animation terms (`'anime opening'`, `'anime ost'`, `'anime theme'`, `'japanese anime'`), preventing Deezer from returning artist ID 147485 and unrelated Latin/Gabber tracks.
  - Added strict guardrails in `isThematicallyPermitted`:
    - Explicitly blocks tracks where `providerArtistId === '147485'` or `contributorArtistIds` contains `'147485'`.
    - Recursively checks all collaborating artists (`splitArtistNames`) to block `Anime` / `DJ AniMe` when featured or co-credited.
    - Rejects any candidate in anime contexts where the generated crossword answer would be `ANIME`.
    - Disallows hardcore techno labels, festivals, and releases (*Masters of Hardcore*, *Traxtorm*, *Thunderdome*, *Dominator*, *Break Your Mind*, *Aftermath*).
  - Extended `mapDeezerTrack` to preserve `contributorArtistIds` for downstream filtering.

---

## [1.4.7] - 2026-09-18

### Fixed
- **Crossword UI Responsive Cell Geometry & Overlap Elimination (`src/components/CrosswordGrid.tsx`)**:
  - Replaced flexible grid track minmax sizing (`minmax(0, 1fr)`) with dynamically calculated pixel track dimensions (`repeat(${cols}, ${cellSize}px)` and `repeat(${rows}, ${cellSize}px)`).
  - Eliminated tile squishing, overlapping borders, and shadow distortion that occurred when puzzles generated with wider column counts (e.g. 10–15 columns) on constrained viewport widths.
  - Implemented automatic responsive cell calculation via `ResizeObserver` bounded between 24px (compact mobile layout) and 42px (spacious desktop display).
  - Explicitly sized tile buttons and empty block cells to match grid tracks, guaranteeing vertical alignment for intersecting words across all rows.
  - Dynamically scaled letter fonts (`12px` to `20px`) and clue number indicators (`7.5px` to `10.5px`) based on cell size.
  - Relocated selected tile corner studio tape marker to top-right to prevent obscuring top-left clue numbers.
  - Scaled vinyl turntable backdrop responsively (`360px` mobile, `460px` tablet, `560px` desktop) for a clean visual presentation across all device viewports.

---

## [1.4.6] - 2026-09-18

### Maintenance & CI/CD
- **GitHub Actions Node.js 24 Runtime & Modern Action Upgrades (`.github/workflows/ci.yml`, `.github/workflows/manual-release.yml`)**:
  - Upgraded GitHub Actions to official Node 24 native major releases, resolving runner deprecation warnings for Node.js 20:
    - `actions/checkout@v4` $\rightarrow$ `actions/checkout@v5`
    - `actions/setup-node@v4` $\rightarrow$ `actions/setup-node@v5` with `node-version: 22` (Active LTS)
    - `docker/setup-buildx-action@v3` $\rightarrow$ `docker/setup-buildx-action@v4`
    - `docker/build-push-action@v5` $\rightarrow$ `docker/build-push-action@v7`
    - `softprops/action-gh-release@v2` $\rightarrow$ `softprops/action-gh-release@v3`
  - Ensured future-proof execution ahead of GitHub runner image transitions.

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
