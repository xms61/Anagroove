# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [1.28.9] - 2026-09-24

### Changed
- **Agent docs state current rules only:** the crawler, catalog, track selection and frontend docs drop the notes that described earlier behaviour ("before, …", "used to", "replaced") and the dated coverage pass count, and keep the reasons.

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

Older releases (1.28.6 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
