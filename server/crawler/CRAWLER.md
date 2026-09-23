# Crawler & Ingest

## Modules
- `harvester.js` (`MusicHarvester`): all Deezer payloads go through one mapper, `toCatalogCandidate`. The fetch function is injectable (`{ fetchImpl }`) for tests.
  - Vectors, in order: **Apple Music charts** (`harvestAppleCharts`: us/gb/jp/kr), curated playlists, decade × genre, foundation-artist discographies (plus related artists), lexicon words, year × genre, bigrams. `runFullHarvest` stops at the target track count.
  - `harvestArtistDiscography` skips an artist whose top tracks vote a language outside en/ja/ko before any album or related-artist requests.
  - Seeds target English, Japanese, and Korean music. There are no Spanish/French/German lexicon words and no Latin/reggaeton playlists.
- `enricher.js` (`CatalogEnricher`) fills in metadata. Each step picks its own worklist with SQL and stamps what it has tried (`tracks.enriched_at`, `tracks.itunes_checked_at`, `artists.enriched_at`), so runs are resumable and never loop.
  - `enrichAlbums`: `/album/{id}` (album id from the stored Deezer payload) → release date for every catalog track on the album, including tracks matched through the album's track list. About 9 tracks per request. Run it before `enrichDeezerTracks`.
  - `enrichDeezerTracks`: `/track/{id}` → ISRC, release date, rank. An ISRC already owned by another row counts as a duplicate conflict and is left for merging.
  - `enrichArtists`: `/artist/{id}` for fans and one `/album/{id}` for genres.
  - `crossReferenceItunes`: strict. Artist key, base title, and duration within 3 s must all match; the match is attached to the existing row and never creates a track.
  - `recomputeLanguages`: local; runs the artist vote and re-resolves track languages.
- `authenticityFilter.js` (`isAuthenticCandidate(raw, { requireSample })`) checks the preview and duration (45 s–1200 s), then applies the shared rules in `server/policy/authenticityRules.js`.
- `rateLimiter.js`: token buckets plus `politeFetch` (User-Agent, retry on 429/503). Deezer: 5 req/s, burst 8. iTunes/Apple: 0.25 req/s, burst 3.

## Shared rules (`server/policy/authenticityRules.js`)
`checkAuthenticity({ title, artist, album })` → `{ authentic, reason }`, where the reason is `spoken_word`, `cover`, `utility`, `artist`, or `album`. It's the single source for the crawler, `upsertTrack` (`inauthentic` rejections), and song selection (`isAuthenticTrack`). It catches covers, karaoke, soundalikes, workout/sleep/utility audio, and audiobooks/radio plays ("Kapitel 12 - …", Gruselkabinett, Hörspiel, ungekürzt). **Add new junk patterns here.**

## Language (`server/db/languageClassifier.js`)
1. Script: hangul → ko, kana → ja. Han-only text is ja/ko with a JP/KR ISRC or artist, otherwise zh.
2. Artist vote (`artists.primary_language`, from `classifyArtistLanguage`): hangul/kana titles or a majority of JP/KR ISRCs make an artist ja/ko; otherwise ELD runs on their joined titles. Japanese and Korean artists keep romanized or English-titled songs.
3. Title text via ELD (`eld/medium`). Without an artist vote, a non-English verdict needs at least 2 words; overruling a known artist language needs at least 4. Either way it must beat the English score by `requiredMargin(words)` (0.3 for 2 words, 0.2 for 3, 0.15 for 4+), and 2-word titles can only be ruled es/pt/fr/de/it. Words have 2+ letters, so dotted acronyms don't count. Artist **names** are never run through the text detector.

Artist votes on text need 6+ words and a 0.15 lead over English (otherwise `en`). Non-CJK scripts count only when they make up at least half the letters ("KoЯn" is not Russian). Deletion is irreversible, so doubtful titles stay English.

After crawls add titles, run `npm run catalog:enrich -- --languages`.

## Ingest scripts
| Script | Source |
|---|---|
| `scripts/crawl_catalog.js` | Live crawl. Flags: `--target=N --charts=N --playlists=N --decades=N --artists=N --lexicon=N --playlists-only --status` |
| `scripts/enrich_catalog.js` | Enrichment: `--albums[=N] --deezer[=N] --artists[=N] --itunes[=N] --languages` (all steps by default) |
| `scripts/ingest_annas_spotify.js` | Anna's Archive Spotify top‑10k (`--min-popularity=31`) |
| `scripts/ingest_musicmovearr.js` | MusicMoveArr dumps + `changes_*.sql.gz` diffs, streamed (readline + gunzip, 2,000/txn), `requireSample:false` |
| `scripts/fetch_datasets.js` | Prepares `data/base_tables`, `data/changes`, `data/downloads` |
| `scripts/populate_artist_genres.js` (`npm run catalog:genres`), `scripts/build_recognized_artists.js` | Curated artist genre clusters and recognized artists |

Dumps under `data/` are gitignored and must never be committed.

## Provider rules
- **Deezer:** search results include `isrc` and `rank`; playlist and album-track payloads may not. `/track/{id}` is authoritative. The advanced `artist:"…" track:"…"` search currently returns unrelated or empty results, so use plain `artist title` queries and match the results on artist key plus base title. Preview URLs expire: store ids, not URLs.
- **Apple Music charts:** `https://rss.marketingtools.apple.com/api/v2/{storefront}/music/most-played/{10|25|50|100}/songs.json`. There are no previews or durations, so entries are matched to Deezer tracks.
- **iTunes:** match on artist, base title, and duration, and only attach to existing rows.
- **Spotify:** metadata only, from the dumps (popularity, ISRC). No Web API and no previews.

## Ingest policy
`sqliteCatalog.upsertTrack` enforces it for every writer: only `en`/`ja`/`ko`, original recordings (a remaster counts), authentic music, and a duration of 45 s–20 min. Rejections are counted by reason (`getRejectionStats()`).
- Pass raw popularity as `deezerRank` (Deezer `rank`) or `spotifyPopularity` (0–100). The catalog stores one 0–100 score, and ingest scripts filter on score > 30.
- Never invent values (e.g. a default duration). Leave fields unknown so they're rejected or enriched later.
- Details: `server/db/CATALOG_DB.md`.

## Anime pipeline (`anime_catalog.sqlite`)
`npm run anime:sync` (AnimeThemes metadata) → `anime:samples` (20 s FFmpeg clips at multiple offsets into `data/anime_samples/`, gitignored) → `anime:ingest` → `anime:images` (AniList cover art). Clips are served at `/audio/anime/...`.
