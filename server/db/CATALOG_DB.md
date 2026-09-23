# Catalog DB

Uses Node 24 native `node:sqlite` (`DatabaseSync`). Files live under `DATA_DIR` (`server/paths.js`, override with `SPOTYSPICE_DATA_DIR`):
- `catalog.sqlite` — main music catalog (`sqliteCatalog.js`)
- `anime_catalog.sqlite` — isolated anime OP/ED catalog (`animeCatalog.js`)
- `store.json` — user progress/history/blacklist (`server/db.js`, JSON store)

`sqliteCatalog` and `animeCatalog` are **lazy singletons** (`lazySingleton.js`): importing a module opens nothing, and the first property access opens (and migrates) the file. Scripts and tests that must not touch real data need `SPOTYSPICE_DATA_DIR`, or `new SqliteCatalog(':memory:')`.

## Pragmas
WAL, `synchronous=NORMAL`, `busy_timeout=10000`, `foreign_keys=ON`. After long ingests or sanitizing, run `PRAGMA wal_checkpoint(TRUNCATE);`.

## Migrations (`catalogMigrations.js`)
- Versions are tracked in `PRAGMA user_version` (currently **v3**). Each migration runs in its own transaction.
- They're applied automatically on first catalog use, or explicitly with `npm run db:migrate`.
- Before migrating a populated file DB, a `VACUUM INTO` copy is written next to it: `catalog.backup-v<from>-<timestamp>.sqlite`, gitignored. Set `SPOTYSPICE_SKIP_DB_BACKUP=1` or pass `--no-backup` to skip it.
- New schema changes go in a **new** migration entry. Never edit an applied one.

## Tables
- `artists`: `canonical_name` UNIQUE (`canonicalArtistKey`: Latin accents folded; kana dakuten and hangul kept), `display_name`, and provider ids (`spotify_id`, `deezer_id`, `itunes_artist_id`) each UNIQUE, plus `genres_json`, `fans_count`, `primary_language` (voted over the artist's catalog), and `enriched_at`.
- `tracks`:
  - `isrc` UNIQUE (validated format), `display_title`, `artist_id`, `album_name`, `duration_ms`, `release_year`/`release_date`, `is_explicit`.
  - `canonical_title`: the Unicode **base title** key from `baseTitleKey`. Credits and version tags are removed; kana (including dakuten), hangul and kanji are kept.
  - `version_type`: `original` or `remaster` for admitted rows. Legacy rows may hold `live`, `remix`, `edit`, ... until the cleanup phase deletes them.
  - `language`: from `languageClassifier.js` (script, artist vote, ELD title detection); `country_code` is the ISRC **registrant** prefix, not a language.
  - `enriched_at` / `itunes_checked_at`: set once `catalog:enrich` has attempted the Deezer or iTunes lookup.
  - `popularity`: a single **0–100 score**. Raw inputs are kept in `deezer_rank` and `spotify_popularity`.
  - `rand_key`: a random number in [0, 1) for index-backed random sampling (`idx_tracks_pick`).
- `track_samples`: one row per (track, provider) with the preview URL. **Deezer preview URLs are signed and expire** (`hdnea=exp=`, minutes), so treat them as a cache. `previewResolver.isPreviewUrlFresh` decides whether a stored URL is still usable.
- `track_providers`: `(provider, provider_track_id)` UNIQUE cross-reference, plus `raw_metadata_json`.
- `crawl_queue`: crawl tasks.
- `tracks_fts`: contentless FTS5 with the `trigram` tokenizer (substring matching, works for CJK), kept in sync by the `tracks_fts_ai/ad/au` triggers. Never write to it by hand. MATCH terms need at least 3 characters.

## Admission policy (`upsertTrack`, rules in `trackNormalization.js`)
A track is rejected (returns `null`; counted in `getRejectionStats()`) unless it is:
- **Language** `en`, `ja` or `ko` (`detectTrackLanguage` → `languageClassifier.resolveTrackLanguage`, using the known artist's `primary_language`).
- **Authentic** per `server/policy/authenticityRules.js`: no covers, karaoke, utility audio, or audiobooks/radio plays.
- **Original version**: `classifyVersion` returns `original` or `remaster`. Live, remix, edit, extended, acoustic, instrumental, demo, re-recorded, sped-up, cover, and language versions are refused.
- **Duration** 45 s–20 min. There are no made-up defaults.

Invalid ISRCs, years and dates are dropped to `NULL` rather than stored.

Catalog read queries (`getRandomPlayableTracks`, `searchCatalogByTheme`, `queryCatalogForCrossword`) only return `original`/`remaster` rows.

## Dedupe
1. Tier 1: exact normalized ISRC.
2. Tier 2: same `artist_id` + `canonical_title` (base title), whatever the duration or release. One row per song and artist.

A match merges provider links, samples, raw popularity, and missing metadata into the existing row. A plain original replaces a remaster as the displayed release. Use `upsertBatch` (one transaction) for bulk writes.

## Languages after crawls
`recomputeCatalogLanguages(db)` (`catalogLanguages.js`, also `npm run catalog:enrich -- --languages`) re-votes every artist's language and re-resolves track languages. Run it after large crawls, because new titles change artist votes.

## Popularity
- `normalizePopularity`: Spotify popularity is the reference when present. Otherwise the Deezer rank is mapped with `deezerRankToScore` (`20·log10(rank) − 39`, calibrated so the median top-10k hit's rank ≈ 562k maps to 76). A legacy `popularity` > 100 is treated as a Deezer rank.
- Pass raw values to `upsertTrack` as `deezerRank` / `spotifyPopularity`.

## Validation & sanitizing
`catalogValidator.js` runs integrity, orphan, duplicate, anomaly, and contamination checks.
- `npm run db:validate` is a dry run and writes `reports/database_validation_report.md` (gitignored).
- `npm run db:sanitize` applies fixes. Back up first (`VACUUM INTO`).

Known issues:
- The contamination purge's `LIKE` patterns don't match space-separated canonical names.
- Legacy rows that break the admission policy (other languages, non-original versions, base-title duplicates) are still present until the cleanup phase.
