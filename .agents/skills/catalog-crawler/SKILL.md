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

4. **Rate Limiting**:
   - Deezer: max 5 req/sec (`deezerRateLimiter`).
   - iTunes: max 15-20 req/min (`itunesRateLimiter`).
   - Spotify: max 10-20 req/sec (`spotifyRateLimiter`).

5. **Database WAL Compaction**:
   - After completing ingestion batches, run:
     ```sql
     PRAGMA wal_checkpoint(TRUNCATE);
     ```
   - This folds `-wal` logs back into `catalog.sqlite` and resets the WAL file.

6. **Git Safety**:
   - Never stage or commit `server/data/catalog.sqlite`, `catalog.sqlite-wal`, or `catalog.sqlite-shm`.
