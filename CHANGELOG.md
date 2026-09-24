# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

Older releases (1.28.2 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
