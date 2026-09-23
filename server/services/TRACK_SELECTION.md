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
6. **Previews:** every live song gets a stable `previewRef` (`previewRefForTrack`: catalog Deezer id, then iTunes id, then `catalog:<id>`, or the live provider id), and `audioUrl` becomes `/api/preview/<ref>`. Only songs with no provider id go through `batchResolvePreviews` at selection time. Songs with no ref are dropped. Anime clips keep their local `/audio/anime/...` URLs.
7. **Serving:** `GET /api/preview/:ref` calls `resolvePreviewRef`, which tries Deezer `/track/{id}`, then Deezer search, then iTunes, and redirects. Cached until 60 s before the signed URL's `exp`.

## Rules
- Targeting a single artist means 0% artist-name clues and keyphrase tokens are banned as answers.
- Language: the catalog query uses `language` (`en`, or `ko/en` for K-pop, or `ja/en` for Japanese themes). `isLanguagePermitted` is a second regex gate.
- Tests swap the provider with `setMusicProviderForTesting`. When a mock is active, no network calls and no preview filtering happen.

## Rules for previews
- Never put a signed Deezer URL (`hdnea=exp=`) in a puzzle or anything that outlives the request. Use `toPreviewPath(ref)`.
- `isPreviewUrlFresh` treats URLs within 60 s of `exp` as stale.

## Known issues
- Catalog ordering is `popularity*3 + RANDOM()%100` over a 0–100 score, which is still strongly popularity-biased. The planned replacement samples by `rand_key` with weights.
- Every request still fans out to live Deezer and up to 4 iTunes searches (the iTunes limiter allows 0.25 req/s), which adds 7–17 s. The catalog query itself takes under 350 ms.
- NULL release years (≈57%) are rejected whenever a decade is requested.
