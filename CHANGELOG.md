# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

Older releases (1.28.7 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
