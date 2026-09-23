# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

Older releases (1.20.1 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
