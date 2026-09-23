# Crawler & Ingest

## Modules
- `harvester.js` (`MusicHarvester`) runs Deezer search/playlist/artist-discography harvesting and iTunes cross-referencing. It has the seed lists (`CURATED_PLAYLIST_SEEDS`, `DECADE_GENRE_SEEDS`, `YEAR_GENRE_SEEDS`, `MUSIC_LEXICON_SEEDS`, `BIGRAM_SEEDS`, `FOUNDATION_ARTISTS`) and `runFullHarvest` (6 vectors, stops at the target track count).
- `artistBaseline.js`: the 500 most-streamed artists, from `data/most_streamed_artists.csv`.
- `authenticityFilter.js` (`isAuthenticCandidate(raw, { requireSample })`) rejects covers, karaoke, tributes, lullabies, white noise, workout/8-bit, sped-up/nightcore, and durations outside 45 s–1200 s.
- `rateLimiter.js` has token buckets plus `politeFetch` (User-Agent, retry on 429/503). Deezer: 5 req/s, burst 8. iTunes: 0.25 req/s, burst 3.

## Ingest scripts
| Script | Source |
|---|---|
| `scripts/crawl_catalog.js` | Live Deezer crawl. Flags: `--target=N --playlists=N --decades=N --artists=N --lexicon=N --playlists-only --status` |
| `scripts/ingest_annas_spotify.js` | Anna's Archive Spotify top‑10k (`--min-popularity=31`) |
| `scripts/ingest_musicmovearr.js` | MusicMoveArr dumps + `changes_*.sql.gz` diffs, streamed (readline + gunzip, 2,000/txn), `requireSample:false` |
| `scripts/fetch_datasets.js` | Prepares `data/base_tables`, `data/changes`, `data/downloads` |
| `scripts/populate_artist_genres.js`, `scripts/build_recognized_artists.js` | Artist metadata helpers |

Dumps under `data/` are gitignored and must never be committed.

## Provider rules
- **Deezer:** search/playlist/album-track payloads **don't** include `isrc` or per-track `release_date`; use `/track/{id}` or `/album/{id}` for those. Preview URLs expire, so store ids, not URLs.
- **iTunes:** match on ISRC, or on artist + title + duration within 3 s. Never create a new track from a fuzzy match.
- **Spotify:** metadata only, from the dumps (popularity, ISRC). No Web API and no previews.

## Ingest policy (target, per the plan)
Only `en`/`ja`/`ko` and original versions, popularity score > 30, and filled metadata. See `server/db/CATALOG_DB.md`.

## Anime pipeline (`anime_catalog.sqlite`)
`npm run anime:sync` (AnimeThemes metadata) → `anime:samples` (20 s FFmpeg clips at multiple offsets into `data/anime_samples/`, gitignored) → `anime:ingest` → `anime:images` (AniList cover art). Clips are served at `/audio/anime/...`.
