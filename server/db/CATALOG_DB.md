# Catalog DB

Uses Node 24 native `node:sqlite` (`DatabaseSync`). Files live under `DATA_DIR` (`server/paths.js`, override with `SPOTYSPICE_DATA_DIR`):
- `catalog.sqlite` — main music catalog (`sqliteCatalog.js`)
- `anime_catalog.sqlite` — isolated anime OP/ED catalog (`animeCatalog.js`)
- `store.json` — user progress/history/blacklist (`server/db.js`, JSON store)

## Pragmas
WAL, `synchronous=NORMAL`, `busy_timeout=10000`, `foreign_keys=ON`. After long ingests or sanitizing, run `PRAGMA wal_checkpoint(TRUNCATE);`.

## Tables (`sqliteCatalog._createTables`)
- `artists`: `canonical_name` UNIQUE, `display_name`, and provider ids (`spotify_id`, `deezer_id`, `itunes_artist_id`) each UNIQUE, plus `genres_json` and `fans_count`.
- `tracks`: `isrc` UNIQUE, `canonical_title`, `display_title`, `artist_id`, `album_name`, `duration_ms`, `release_year`/`release_date`, `country_code` (ISRC prefix, which is the *registrant*, not the language), `language`, `popularity`, `is_explicit`.
- `track_samples`: one row per (track, provider) with the preview URL. **Deezer preview URLs are signed and expire** (`hdnea=exp=`), so treat them as a cache, never as ground truth.
- `track_providers`: `(provider, provider_track_id)` UNIQUE cross-reference.
- `crawl_queue`: crawl tasks.
- `tracks_fts`: FTS5. **Currently broken** (declared `content='tracks'` with columns `tracks` doesn't have), so queries fall back to `LIKE`.

## Upsert & dedupe (`upsertTrack`)
1. Tier 1: exact 12-char ISRC.
2. Tier 2: same `artist_id` + `canonical_title` + |Δduration| ≤ 3000 ms.

A match merges provider links and samples into the existing track and never creates a second row. Use `upsertBatch` (one transaction) for bulk writes.

## Policy (confirmed 2026-09-23; being enforced in Phases 2–4 of the plan)
- **Languages:** only `en`, `ja`, `ko`. Everything else is rejected at ingest and deleted from the DB.
- **Versions:** one version per song, **original only**. Reject live/remix/edit/acoustic/instrumental/demo/re-recorded/sped-up versions. A remaster counts as the original recording.
- **Popularity:** a single 0–100 score, and ingest requires score > 30. Raw values today are mixed (Deezer `rank` up to ~1M vs Spotify 0–100), so don't compare `popularity` across providers.
- **Completeness:** every column is filled with valid data (ISRC format, year range, duration 45 s–20 min, JSON-valid genres).

## Validation & sanitizing
`catalogValidator.js` runs integrity, orphan, duplicate, anomaly, and contamination checks.
- `npm run db:validate` is a dry run and writes `reports/database_validation_report.md` (gitignored).
- `npm run db:sanitize` applies fixes. Make a backup first (`VACUUM INTO 'backup.sqlite'`).

Known issue: the contamination purge's `LIKE` patterns don't match space-separated canonical names (see the plan, H5).
