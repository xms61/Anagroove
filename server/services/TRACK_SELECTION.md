# Track Selection

Entry point: `getRandomSongPool(opts)` in `musicService.js`. It is called by `GET /api/music/random` and `POST /api/puzzles/live`.

## Pipeline
1. **Query plan:** `queryBuilder.buildQueryPlan` parses the prompt/genre/decade/artist/popularity into Deezer/iTunes searches, a year range, and an artist target. `queryFactory.mapPromptToGenres` maps them to catalog genre clusters.
2. **Candidates:**
   - Anime prompts (`isAnimeTarget`) use **only** `animeCatalog`.
   - Everything else uses `sqliteCatalog.searchCatalogByTheme` (FTS/genre/language/year), plus `deezerMusicProvider` and up to 4 `itunesMusicProvider` searches.
3. **Ordering:** a seeded SHA-256 sort when `seed` is given, otherwise Fisher-Yates. Candidates are then bucketed by recent-play count (tiers 0/1/2/3+).
4. **Rejection sampling** (`trySelectTracks`) drops recent plays, duplicate track/title/answer, blacklisted items, `isLanguagePermitted`, `isThematicallyPermitted`, `isAuthenticTrack`, and `isTemporalPermitted` failures. It allows max 1 track per artist unless an artist is targeted.
5. **Answer + clue:** `extractAnswerKeyword` with clue-type rotation and length buckets. See `shared/CROSSWORD_ENGINE.md`.
6. **Previews:** `previewResolver.batchResolvePreviews` tries Deezer `/track/{id}`, then Deezer search, then iTunes. Tracks without audio are dropped.

## Rules
- Targeting a single artist means 0% artist-name clues and keyphrase tokens are banned as answers.
- Language: the catalog query uses `language` (`en`, or `ko/en` for K-pop, or `ja/en` for Japanese themes). `isLanguagePermitted` is a second regex gate.
- Tests swap the provider with `setMusicProviderForTesting`. When a mock is active, no network calls and no preview filtering happen.

## Known issues (fix in Phases 1 & 5 of the plan)
- Stored Deezer preview URLs are expired, but the resolver still returns them as "existing" hits.
- The `popularity` scale is mixed, so the SQL ordering is effectively deterministic.
- NULL release years (≈57%) are rejected whenever a decade is requested.
