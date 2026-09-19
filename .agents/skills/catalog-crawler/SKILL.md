---
name: catalog-crawler
description: Manage, inspect, and execute the SpotySpice SQLite music crawler, backfillers, and deduplication engine.
---

# Catalog Crawler Skill

Use this skill when tasked with inspecting, crawling, backfilling, or maintaining the SpotySpice local SQLite music catalog.

## Quick CLI Reference

```bash
# Check current database metrics
npm run crawl:status

# Run full autonomous crawler toward target (default: 500,000 tracks)
npm run crawl
# or custom target:
node scripts/crawl_catalog.js --target=500000

# Spider curated playlists exclusively (skips decades, artists, lexicon)
npm run crawl:playlists

# Ingest Anna's Archive Spotify Top 10k tracks (strict popularity > 30)
npm run crawl:top10k
# or with custom popularity threshold:
node scripts/ingest_annas_spotify.js --min-popularity=31

# Targeted decade or artist discovery runs
node scripts/crawl_catalog.js --playlists=0 --decades=105 --artists=250 --lexicon=0

# Database Health, Integrity & Deduplication Sanitizer
npm run db:validate      # Non-destructive integrity, foreign keys, and soft duplicates check
npm run db:sanitize      # Live duplicate merging and invalid track/contamination purging

# Dedicated Anime OP/ED Catalog & Audio Sample Pipeline
npm run anime:sync       # Synchronize canonical anime opening/ending metadata from AnimeThemes
npm run anime:samples    # Extract 20-second multi-sample clips via headless FFmpeg
npm run anime:ingest     # Ingest themes and sample variations into server/data/anime_catalog.sqlite
```

## Operational Rules & Invariants

1. **Popularity Threshold**:
   - Always enforce `popularity > 30` (`minPopularity >= 31`). Tracks with low popularity often lack verified previews, have incomplete metadata, or represent low-quality rip uploads.

2. **Authenticity Verification**:
   - Call `isAuthenticCandidate(rawTrack, options)` from `server/crawler/authenticityFilter.js`.
   - Filters out covers, karaoke, tribute bands, lullabies, white noise, and 8-bit tracks.
   - Requires valid 30s HTTP preview URL unless `{ requireSample: false }` is explicitly passed for authoritative metadata feeds awaiting sample backfill.

3. **Two-Tier Deduplication**:
   - **Tier 1**: Exact 12-char ISRC match.
   - **Tier 2**: Exact `artist_id` + normalized `canonical_title` + duration delta $\le 3000\text{ ms}$.
   - Never insert a separate canonical track when ISRC or Tier 2 match exists; merge provider links and samples instead.

4. **Dedicated Anime OP/ED Catalog Engine (`server/db/animeCatalog.js`)**:
   - Anime themes are isolated in `server/data/anime_catalog.sqlite` to prevent homonyms and Western collisions (e.g. DJ AniMe).
   - Tracks track `theme_type` (`OP`, `ED`, `insert`), `anime_title`, `year`, and multiple audio sample variations (`offset_seconds`, `duration_seconds`).
   - Sourced locally via `/audio/anime/...` static routes with multiple 20s offsets (e.g., 5s, 35s, 65s) for audio variety across crossword plays.

5. **Database Validation & Sanitization Engine (`server/db/catalogValidator.js`)**:
   - Executes structural integrity checks (`PRAGMA integrity_check`), foreign key checks, and orphan diagnostics.
   - Detects and merges soft-duplicate clusters across normalized token fingerprints and duration windows ($\le 3$s).
   - Automatically identifies and purges short audio fragments (< 15s) and audio-drama contaminations (e.g., Gruselkabinett audiobook entries).
   - Generates formatted markdown audit reports in `reports/database_validation_report.md`.

6. **Rate Limiting**:
   - Deezer: max 5 req/sec (`deezerRateLimiter`).
   - iTunes: max 15-20 req/min (`itunesRateLimiter`).
   - Spotify: max 10-20 req/sec (`spotifyRateLimiter`).

7. **Database WAL Compaction**:
   - After completing ingestion batches, run:
     ```sql
     PRAGMA wal_checkpoint(TRUNCATE);
     ```
   - This folds `-wal` logs back into `catalog.sqlite` and resets the WAL file.

8. **Git Safety & Zero Media Bloat**:
   - **Never** stage or commit `*.sqlite*`, `*.db*`, `catalog.sqlite*`, or `anime_catalog.sqlite*`.
   - **Never** stage or commit raw audio files (`*.mp3`, `*.aac`, `*.wav`, `*.ogg`, `*.opus`, `*.m4a`) or sample folders (`data/anime_samples/`).
