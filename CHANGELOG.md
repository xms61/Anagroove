# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

Older releases (1.28.1 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
