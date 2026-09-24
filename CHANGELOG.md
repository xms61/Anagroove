# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.30.0] - 2026-09-24

### Changed
- **Live Deezer/iTunes lookups only for prompts that name an artist.** Themes and every other prompt are served from the local catalog alone. A named artist the catalog has too few rows of is still looked up, and the results are stored in the catalog as before.
  - Both providers search the artist and keep only tracks credited to that artist, so "songs by Queen" no longer brings ABBA's "Dancing Queen".
  - With an empty catalog, only artist prompts produce puzzles.
- **The K-pop, J-pop and anime themes only use Korean or Japanese songs.** Before, they also took English songs by any artist with the theme's genre tag. On 2026-09-24 more than half of the K-pop pool was Western acts: Drake, Radiohead and Queen were its three biggest artists.
- **A named artist is served in every language.** "songs by YOASOBI" found no songs before, because artist prompts only allowed English.
- Two theme playlist seeds, "top south korea" and "top japan", are gone. They are country charts of mostly Western hits and were the main source of the wrong genre tags.

### Fixed
- **K-pop and J-pop acts vote Korean or Japanese.** Deezer romanizes their titles and many of their ISRCs are US codes, so TWICE, Stray Kids, BTS, NewJeans and about 85 more voted English, and 2NE1 and TREASURE voted Japanese.
  - A K-Pop, Japanese, J-Pop, City Pop or Anime genre from a theme playlist now counts when evidence backs it: Deezer's Asian Music genre, at least one KR ISRC, or a fifth of the ISRCs from JP.
  - Western acts on those playlists stay English.
  - `npm run catalog:recompute` applies it, and removes these genres from artists the vote puts in another language. On the 2026-09-24 catalog, 1,558 tracks moved to Korean and 161 wrong genre tags were removed.
  - K-pop and J-pop acts with none of that evidence still vote English: LE SSERAFIM and the BTS solo acts.

### Removed
- **The K-pop artist blocklist** in the thematic rules. The language rule above does its job.
- **The per-genre live search setup:**
  - `DEEZER_GENRE_TAXONOMY`
  - the theme search variations, the K-pop and anime seed artists, and the year searches in the query plan
  - the fan and rank thresholds
  - the iTunes storefront guessing
  - the iTunes genre guards in the thematic rules
- **The `minFans` option** of `GET /api/music/random` and `POST /api/puzzles/live`. It only steered the genre search and is now ignored if sent.

---

## [1.29.0] - 2026-09-24

### Security
- **WebSocket frames over 64 KiB are refused while they arrive** (`maxPayload`, close 1009). The old check ran after `ws` had buffered up to its 100 MiB default, and an oversized frame's `error` event, which had no listener, crashed the process.
- **Dead sockets are dropped:** a socket that misses a 30 s ping is terminated, which frees its seat and its per-IP connection slot.
- **Room codes can't be guessed in bulk:** `join_room` allows 10 unknown codes per minute per IP.
- **The anonymous user id stays out of logs and URLs.** It is read from `X-User-Id` only, the request log records the path without the query string, and free text (prompt, artist, album, decade, player name) loses control characters.
- **Workflows run with read-only tokens** unless a job needs more. The release version input is validated, a separate job holds the write token, third-party actions are pinned to commit SHAs, and Dependabot proposes updates for them.
- **The runtime image's code is read-only to the app user**, which owns only `server/data`. A `HEALTHCHECK` is added.

### Fixed
- **Hidden artists stay hidden.** An artist hidden from a live Deezer song came back in catalog songs, which carry no provider artist id. Catalog rows now carry the artist's Deezer id, and when a song has no comparable id, the name decides.
- **Theme prompts keep their full-text matches.** Under 10 trigram matches were replaced by a `LIKE` for the literal text "tok1 OR tok2", which found nothing for prompts with two keywords (8 matches became 0 tracks).
- **English live candidates are no longer rejected as foreign:** "Die With A Smile", "Son of a Preacher Man" and "Don’t Start Now". From 3 words the language classifier decides, and typographic punctuation counts as Latin text.
- **"Drake" no longer covers "Nick Drake"** in the one-track-per-artist rule for artist prompts.
- **A production deployment accepts its own POST and DELETE requests.** Browsers send `Origin` on them, and without `CORS_ALLOWED_ORIGINS` they got 403. The page's own origin is now always allowed, for HTTP and WebSocket.
- **API requests handled by the routers are logged.** The request log read `req.path` after routing had removed the `/api` prefix.
- **A crawl no longer freezes the server.** The server opens the catalogs with a 250 ms busy timeout (scripts keep 10 s), so its best-effort writes give up instead of blocking the event loop for up to 10 s.
- **The iTunes text search only plays a result by the same artist** with the same base title.
- **A seed reproduces the grid layout too**, not only the songs.

### Changed
- **Preview lookups stay within the provider budget.** Concurrent requests for one ref share a lookup, a ref without a preview is not looked up again for 10 minutes, outbound calls time out, and an exhausted budget answers 503 with `Retry-After`. The 10 s live-fallback timeout now also stops the Deezer and iTunes requests still running.
- **Per-user limits:** up to 500 hidden artists and songs (the next add answers 409 with a message the client shows), and the newest 1,000 solved puzzles.
- **Catalog schema v8:** `artist_genres` (kept in sync by triggers) and a NOCASE index on artist names. On a 500k-track test catalog, a genre without matching artists went from 415 ms to 0.2 ms and an artist prompt from 16 ms to 0.2 ms. Artist prompts treat `%` and `_` as plain characters.
- **Faster grids:** a trial stops once a pass places nothing, crossings are looked up through owner grids, and the best trial is rendered once. 15-word grids: 51 → 12 ms; a target that can't be reached: 171 → 10 ms.
- **Selection policy per request:** `createLanguagePolicy` and `createThematicPolicy` resolve the request's rules once. The homonym guards are rows of `THEMATIC_RULES`. `canonicalMusicKey` memoizes its result.
- Docker compose mounts the anime clips and documents `TRUST_PROXY` and `CORS_ALLOWED_ORIGINS`.

### Added
- **Race wins are checked by the server:** `puzzle_solved` carries the player's grid, and only the first correct claim in a started room counts.

---

## [1.28.12] - 2026-09-24

### Fixed
- **Tracks from the Spotify dumps get their Deezer link.** 1,739 catalog tracks came only from the Spotify dumps, which have no previews. `npm run catalog:enrich -- --deezer=N` skipped them, because it only looked up tracks that already had a Deezer id.
  - It now looks them up with Deezer's `/track/isrc:{ISRC}` (1,723 have an ISRC).
  - A match stores the Deezer link, the album id and the artist's Deezer id, then fills the year and rank as usual.
  - Their previews then resolve without a live search, and `catalog:coverage` (offline) no longer drops them.
  - A Deezer track already linked to another row is left for `db:sanitize` to merge (`linkConflicts`).

### Changed
- **One warning line per song pool** lists the tracks dropped for having no audio preview. It used to be one warning per track.

---

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

Older releases (1.28.9 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
