# Track Selection

Entry point: `getRandomSongPool(opts)` in `server/selection/songPool.ts`. It is called by `GET /api/music/random` and `POST /api/puzzles/live` (`server/routes/music.ts`).

## Themes (`shared/themes.ts`)
`THEMES` is the single theme list: the generator and multiplayer pickers, `genresForPrompt`, the theme languages, the crawler's playlist seeds and the coverage report all read it. Each theme has `id`, label fields, `genres` (values in `artists.genres_json`), `languages` and `seeds`. Add a theme there, plus a `DEEZER_GENRE_TAXONOMY` entry for the live fallback; `themes.test.ts` checks both. Free-text prompts go through the ordered `PROMPT_GENRES` rules: the most specific phrase wins and is removed before the next rule runs ("city pop" never also counts as "pop"). There is no Latin theme: the catalog only admits en/ja/ko.

## Modules
- `songPool.ts`: orchestrator (query plan → candidates → recency tiers → picker → preview paths). `setMusicProviderForTesting(mock)` replaces the live providers **and** bypasses the catalog.
- `candidates.ts`: candidate sources, `POPULARITY_SAMPLING`, and catalog learning.
- `trackPicker.ts`: the variety/policy/answer loop (`createTrackPicker`, `createRecentCounter`).
- `random.ts`: `createRng(seed)` (sfc32 seeded from SHA-256 of the seed, hashed once) and `weightedOrder` (Efraimidis–Spirakis).
- Policy: `server/policy/selectionPolicy.ts` (`isLanguagePermitted`, `allowedLanguagesForContext`, `isThematicallyPermitted`, `isAuthenticTrack`, `isTemporalPermitted`/`resolveReleaseYear`, anime/Japanese affinity). Authenticity rules: `server/policy/authenticityRules.ts`.

## Pipeline
1. **Query plan:** `queryBuilder.buildQueryPlan` handles the prompt, genre, decade, artist and popularity. `genresForPrompt` (`shared/themes.ts`) maps a theme id, or the words of the genre and prompt, to artist genre clusters.
2. **Catalog window** (`sqliteCatalog.sampleCatalogTracks`). Every filter runs in SQL:
   - allowed languages, `original`/`remaster` only, a popularity window, and the year range
   - the artist (resolved to ids first), genres (`artists.genres_json`), and a text theme (trigram FTS over title, artist and album; its matches are the whole answer, however few. LIKE per token only when the FTS query is malformed. Skipped when the prompt maps to genres)
   - excluding recent `sqlite:<id>` plays

   It then reads up to 400 rows in `rand_key` order from a random start (wrapping around; index `idx_tracks_rand`). That's one row per track, 2–160 ms on ~300k tracks.
3. **Weighting:** `weightedOrder` with weight `(popularity + 1)^α`. With a seed, both the window start and the keys are reproducible.

   The score is the track's percentile within its language (`server/db/CATALOG_DB.md`, Popularity).

   | `popularity` | Score window | α |
   |---|---|---|
   | `obscure` | 0–50 | 0 (uniform) |
   | `pure` | 0–100 | 0 |
   | `balanced` (default) | ≥ 30 | 1 |
   | `mainstream` | ≥ 75 (top quarter) | 2 |

   A named artist drops the popularity floor (deep cuts allowed).
4. **Live providers are a fallback only:** used when the catalog window has fewer than `max(3×count, 30)` rows, or once when the picked pool falls short. Deezer goes first; iTunes (0.25 req/s) only if Deezer is still short. Capped at 10 s: then the request's `AbortSignal` fires, which also stops the provider's remaining searches and artist lookups. Deezer results go through `upsertTrack` (admission policy), so the catalog learns. `SPOTYSPICE_OFFLINE=1` (`server/offline.ts`) turns the fallback and preview lookups off.
5. **Recency tiers:** candidates are bucketed by recent plays (0 / 1 / 2 / 3+), counting track ids, legacy `hit-` ids, and recently played artists. Tiers are filled in that order until `count` is reached.
6. **Picker:**
   - It rejects duplicate track/title/answer, blacklisted items (`compileBlacklist`, once per request: an artist hidden by provider id matches that id, or its name when the song has no id from that provider; catalog rows carry the artist's Deezer id), language/thematic/authenticity/year policy failures, and non-original versions (`classifyVersion`, which also applies to live candidates).
   - One track per artist, unless the prompt targets the artist. The target matches whole names only: the full artist key or one credited artist ("Drake" covers "Drake feat. Future", not "Nick Drake").
   - Answer and clue via `extractAnswerKeyword`, with clue-type and length-bucket rotation. See `shared/CROSSWORD_ENGINE.md`.
7. **Previews:** `previewRefForTrack` checks the catalog Deezer id, then the iTunes id, then `catalog:<id>`, then the live provider id. `audioUrl` becomes `/api/preview/<ref>`. Songs with no provider ref (none or `catalog:<id>`) go through `batchResolvePreviews`, which searches Deezer and iTunes. Songs it can't resolve are dropped, with one warning line per pool. With `SPOTYSPICE_OFFLINE=1` (as `catalog:coverage` runs) the search is off, so they are always dropped. Anime clips keep `/audio/anime/...`.
8. **Serving:** `GET /api/preview/:ref` calls `resolvePreviewRef`, which tries Deezer `/track/{id}`, then Deezer search, then iTunes, and redirects (302). The URL is cached until 60 s before the signed URL's `exp`. Concurrent requests for one ref share a lookup, and a ref the providers answered without a preview answers 404 for 10 minutes without a lookup (a timeout is not cached). Lookups time out after 5 s and wait at most 3 s for a rate-limiter token; an exhausted budget answers 503 with `Retry-After`. The iTunes text search only accepts a result with the same artist key and base title.

## Rules
- **Language:** catalog rows are judged by their stored `language`; live candidates by `resolveTrackLanguage`. An explicit `languages` filter (generator chips, `queryPlan.languages`) replaces the theme languages in both the catalog window and the picker. Otherwise `allowedLanguagesForContext` returns:
  - a theme id → the theme's `languages` (`shared/themes.ts`)
  - K-pop or Korean prompts → ko/en
  - Japanese, J-pop, city pop or anime prompts → ja/en
  - everything else → en

  English-only themes still run live candidates of 1-2 words through the stopword/script heuristics, because titles like "Despacito" are too short for the classifier. From 3 words the classifier decides: stopwords such as "die" or "son" are English words too. Typographic quotes, dashes and the ellipsis (U+2010-U+2027) count as Latin text.
- **Year window:** a requested year range needs a known year (`resolveReleaseYear`: a vintage remaster year, then the stored year/date, then a year in the title/album). Without a range, unknown years pass. `isTemporalPermitted` never mutates the track; the picker stores the matched year on the output copy.
- **Named artist:** targeting a single artist means no artist-name clues, and keyphrase tokens are banned as answers.
- **Anime:** anime prompts use only `animeCatalog`.

## Rules for previews
- Never put a signed Deezer URL (`hdnea=exp=`) in a puzzle or anything that outlives the request. Use `toPreviewPath(ref)`.
- `isPreviewUrlFresh` treats URLs within 60 s of `exp` as stale.

## Coverage (`server/selection/coverage.ts`, `npm run catalog:coverage`)
For every theme (except anime, which has its own catalog) and about 40 benchmark prompts (moods, eras, genres, artists), offline:
- the catalog window at `balanced`: tracks (up to 5,000), distinct artists, languages
- five seeded 12-song puzzles: whether they fill up, and their average overlap (Jaccard, 0 = all different)

Targets: themes ≥ 150 tracks from ≥ 40 artists, prompts ≥ 60 / 20, artist prompts ≥ 15 tracks, and full puzzles. `-- --ci` exits 1 on a miss. The failing rows are the crawl to-do list. Genre themes miss on artists until `catalog:enrich -- --artists=N` fills genres, and decade prompts miss on release years until `--albums=N` runs.

## Known limits
- Genre prompts depend on `artists.genres_json`, which `npm run catalog:enrich -- --artists=N` fills. With few enriched artists, genre pools are thin and pick many tracks per artist, so they fall back to live providers.
- Decade prompts depend on release-year coverage (`catalog:enrich -- --albums=N`). Years come from the album, so compilations carry their own year.
- Homonym guardrails (Daft Punk in pop-punk, "The Japanese House", …) are still code in `selectionPolicy.ts`, not data.
