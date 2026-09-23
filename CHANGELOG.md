# Changelog

All notable changes to the **SpotySpice** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

Older releases (1.14.0 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
