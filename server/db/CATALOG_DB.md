# Catalog DB

Uses Node 24 native `node:sqlite` (`DatabaseSync`). Files live under `DATA_DIR` (`server/paths.js`, override with `SPOTYSPICE_DATA_DIR`):
- `catalog.sqlite` — main music catalog (`sqliteCatalog.js`)
- `anime_catalog.sqlite` — isolated anime OP/ED catalog (`animeCatalog.js`)
- `users.sqlite` — user progress/history/blacklist (`server/db/userStore.js`, see `server/API_SECURITY.md`); imports the old `store.json` once

`sqliteCatalog` and `animeCatalog` are **lazy singletons** (`lazySingleton.js`): importing a module opens nothing, and the first property access opens (and migrates) the file. Scripts and tests that must not touch real data need `SPOTYSPICE_DATA_DIR`, or `new SqliteCatalog(':memory:')`.

## Pragmas
WAL, `synchronous=NORMAL`, `busy_timeout=10000`, `foreign_keys=ON`. After long ingests or sanitizing, run `PRAGMA wal_checkpoint(TRUNCATE);`.

## Migrations (`catalogMigrations.js`)
- Versions are tracked in `PRAGMA user_version` (currently **v5**). Each migration runs in its own transaction.
- They're applied automatically on first catalog use, or explicitly with `npm run db:migrate`.
- Before migrating a populated file DB, a `VACUUM INTO` copy is written next to it: `catalog.backup-v<from>-<timestamp>.sqlite`, gitignored. Set `SPOTYSPICE_SKIP_DB_BACKUP=1` or pass `--no-backup` to skip it.
- New schema changes go in a **new** migration entry. Never edit an applied one.

## Tables
- `artists`: `canonical_name` UNIQUE (`canonicalArtistKey`: Latin accents folded; kana dakuten and hangul kept), `display_name`, and provider ids (`spotify_id`, `deezer_id`, `itunes_artist_id`) each UNIQUE, plus `genres_json`, `fans_count`, `primary_language` (voted over the artist's catalog), and `enriched_at`.
- `tracks`:
  - `isrc` UNIQUE (validated format), `display_title`, `artist_id`, `album_name`, `duration_ms`, `release_year`/`release_date`, `is_explicit`.
  - `canonical_title`: the Unicode **base title** key from `baseTitleKey`. Credits and version tags are removed; kana (including dakuten), hangul and kanji are kept.
  - `version_type`: `original` or `remaster` (the cleanup deletes every other class).
  - `language`: from `languageClassifier.js` (script, artist vote, ELD title detection); `country_code` is the ISRC **registrant** prefix, not a language.
  - `enriched_at` / `itunes_checked_at` / `album_checked_at`: set once `catalog:enrich` has attempted the Deezer track, iTunes, or Deezer album lookup.
  - `popularity`: a single **0–100 score**. Raw inputs are kept in `deezer_rank` and `spotify_popularity`.
  - `rand_key`: a random number in [0, 1) for song selection windows (`sampleCatalogTracks`, index `idx_tracks_rand`).
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

Invalid ISRCs, years and dates are dropped to `NULL` rather than stored. Titles, albums and artist names go through `cleanDisplayText` (HTML entities decoded, invisible characters removed, whitespace collapsed).

Catalog read queries (`sampleCatalogTracks`, `getRandomPlayableTracks`, `searchCatalogByTheme`, `queryCatalogForCrossword`) only return `original`/`remaster` rows.

## Dedupe
1. Tier 1: exact normalized ISRC.
2. Tier 2: same `artist_id` + `canonical_title` (base title), whatever the duration or release. One row per song and artist.

A match merges provider links, samples, raw popularity, and missing metadata into the existing row. A plain original replaces a remaster as the displayed release. Use `upsertBatch` (one transaction) for bulk writes.

## Languages after crawls
`recomputeCatalogLanguages(db)` (`catalogLanguages.js`, also `npm run catalog:enrich -- --languages`) re-votes every artist's language and re-resolves track languages. Run it after large crawls, because new titles change artist votes.

## Popularity
- `normalizePopularity`: Spotify popularity is the reference when present. Otherwise the Deezer rank is mapped with `deezerRankToScore` (`20·log10(rank) − 39`, calibrated so the median top-10k hit's rank ≈ 562k maps to 76). A legacy `popularity` > 100 is treated as a Deezer rank.
- Pass raw values to `upsertTrack` as `deezerRank` / `spotifyPopularity`.

## Cleanup (`catalogCleanup.js`)
`runCatalogCleanup(db, { apply, steps })` brings existing rows under the admission policy. All steps run in one transaction; without `apply` it rolls back, so dry-run counts are exact. It is idempotent: a second run changes nothing. Steps, in order:
1. `text`: `cleanDisplayText` on titles, albums and artist names; artists whose names now share a key are merged.
2. `classify`: recompute `canonical_title` and `version_type`.
3. `recordings`: a row whose sample points at a provider track owned by another row is the same recording (collaborations used to be stored per credited artist) and is folded into the owner.
4. `links`: restore missing provider links from samples.
5. `duplicates`: one row per (artist, base title) among accepted versions. Keeper: plain original, then has a sample, has an ISRC, highest popularity. It gets every provider link and sample, the earliest release year, the max popularity inputs, and a missing ISRC.
6. `languages` + `policy`: re-vote languages, then delete rows that break the admission policy or have no provider link. They repeat until the vote is stable.
7. `fields`: normalize ISRC, registrant, year/date, 0–100 popularity, `rand_key`.
8. `orphans`: samples/providers without a track, artists without tracks.

The FTS triggers are dropped during the run and the index is rebuilt once at the end.

## Validation & gate
- `catalogValidator.js`: integrity, orphans, duplicate groups, anomalies, contamination (via the shared authenticity rules), statistics, and the markdown report.
- `catalogGate.js` (`evaluateCatalogGate`): the hard checks for `npm run db:validate -- --ci`. They cover duplicates, language, stored and re-derived version, popularity, duration, empty keys, unlinked/orphan rows, authenticity, uncleaned text, FTS count, and release-year/ISRC coverage ≥ 95% (thresholds can be overridden).
- `npm run db:validate` runs diagnostics, a cleanup dry run and the gate, and writes `reports/database_validation_report.md` (gitignored).
- `npm run db:sanitize` writes a `catalog.backup-cleanup-<ts>.sqlite` copy, migrates if needed, applies the cleanup, then runs ANALYZE, a WAL checkpoint and VACUUM.
- Coverage checks only pass once enrichment has run (`npm run catalog:enrich -- --albums=N`). Release years come from the album, so a song first seen on a compilation carries the compilation year.
