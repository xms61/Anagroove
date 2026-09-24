# Crawler & Ingest

## Modules
- `harvester.ts` (`MusicHarvester`): all Deezer payloads go through one mapper, `toCatalogCandidate`. The fetch function is injectable (`{ fetchImpl }`) for tests.
  - Vectors, in order, each bounded by its limit (0 = off); `runFullHarvest` also stops at the target track count:
    1. `charts`: **Apple Music "most played"** (`harvestAppleCharts`: us/gb/jp/kr), matched to Deezer tracks.
    2. `playlists`: theme playlists (`PLAYLIST_SEEDS`, the `seeds` in `shared/themes.ts`). Every artist on a theme playlist gets the theme's first genre.
    3. `decades`: decade playlists (`DECADE_PLAYLIST_SEEDS`: 60s–2020s × hits/rock/pop/soul/hip hop/dance/country), tagged with the style's genre. Text searches ("1987 funk") are not used, because they match years in titles.
    4. `cjk`: the Deezer Asian Music chart, then discographies of the catalog's Japanese/Korean artists (by Deezer id, most fans first) and their related artists (≥ 20,000 fans), keeping to artists that vote ja/ko.
    5. `artists`: discographies of the foundation artists, then their related artists (≥ 100,000 fans). The limit counts every discography, related ones included.
    6. `lexicon`: single-word title searches.
  - `harvestArtistDiscography` skips an artist with fewer than 5,000 fans (`MIN_ARTIST_FANS`: the cleanup would drop most of their tracks), and one whose language is outside the allowed ones, before any album or related-artist request.
  - The language (`_artistLanguage`) is the stored `primary_language` of a catalog artist (matched by Deezer id). Otherwise it is voted on the top tracks. Their payloads carry no ISRCs, and Deezer romanizes Japanese and Korean titles ("Usseewa"), so a vote outside the allowed languages is repeated with the ISRCs of the first 3 top tracks (`/track/{id}`) before the artist is skipped.
  - Seeds target English, Japanese, and Korean music. There are no Spanish/French/German lexicon words and no Latin/reggaeton playlists.
- `enricher.ts` (`CatalogEnricher`) fills in metadata. Each step picks its own worklist with SQL and stamps what it has tried (`tracks.enriched_at`, `tracks.itunes_checked_at`, `artists.enriched_at`), so runs are resumable and never loop.
  - `enrichAlbums`: `/album/{id}` (album id from the stored Deezer payload) → release date for every catalog track on the album, including tracks matched through the album's track list. About 9 tracks per request. Run it before `enrichDeezerTracks`.
  - `enrichDeezerTracks`: `/track/{id}` → ISRC, release date, rank. An ISRC already owned by another row counts as a duplicate conflict and is left for merging.
  - Tracks known only from the Spotify dumps (no Deezer link, but an ISRC) are looked up with `/track/isrc:{ISRC}` in the same step. The match adds the Deezer link, its album id, and the artist's Deezer id, so previews resolve without a search and the artist step can reach the artist. A Deezer id already linked to another row is a duplicate, left for merging (`linkConflicts`).
  - `enrichArtists`: `/artist/{id}` for fans and one `/album/{id}` for genres. Genres are stored by Deezer genre id as English names (`DEEZER_GENRE_NAMES`): the API localizes names by the caller's location.
  - `crossReferenceItunes`: strict. Artist key, base title, and duration within 3 s must all match; the match is attached to the existing row and never creates a track.
  - Languages and popularity are recomputed locally by `npm run catalog:recompute` (`recomputeCatalogLanguages`, `recomputeCatalogPopularity`).
- `authenticityFilter.ts` (`isAuthenticCandidate(raw, { requireSample })`) checks the preview and duration (45 s–1200 s), then applies the shared rules in `server/policy/authenticityRules.ts`.
- `rateLimiter.ts`: token buckets plus `politeFetch` (User-Agent, retry on 429/503). Deezer: 5 req/s, burst 8. iTunes/Apple: 0.25 req/s, burst 3.

## Shared rules (`server/policy/authenticityRules.ts`)
`checkAuthenticity({ title, artist, album })` → `{ authentic, reason }`, where the reason is `spoken_word`, `cover`, `utility`, `artist`, or `album`. It's the single source for the crawler, `upsertTrack` (`inauthentic` rejections), and song selection (`isAuthenticTrack`). It catches covers, karaoke, soundalikes, workout/sleep/utility audio, and audiobooks/radio plays ("Kapitel 12 - …", Gruselkabinett, Hörspiel, ungekürzt). **Add new junk patterns here.**

## Language (`server/db/languageClassifier.ts`)
1. Script: hangul → ko, kana → ja. Han-only text is ja/ko with a JP/KR ISRC or artist, otherwise zh.
2. Artist vote (`artists.primary_language`, from `classifyArtistLanguage`): hangul/kana titles or a majority of JP/KR ISRCs make an artist ja/ko; otherwise ELD runs on their joined titles. Japanese and Korean artists keep romanized or English-titled songs.
3. Title text via ELD (`eld/medium`). Without an artist vote, a non-English verdict needs at least 2 words; overruling a known artist language needs at least 4. Either way it must beat the English score by `requiredMargin(words)` (0.3 for 2 words, 0.2 for 3, 0.15 for 4+), and 2-word titles can only be ruled es/pt/fr/de/it. Words have 2+ letters, so dotted acronyms don't count. Artist **names** are never run through the text detector.

Artist votes on text need 6+ words and a 0.15 lead over English (otherwise `en`). Non-CJK scripts count only when they make up at least half the letters ("KoЯn" is not Russian). Deletion is irreversible, so doubtful titles stay English.

After crawls and enrichment, run `npm run catalog:recompute` (languages, then popularity percentiles).

## Ingest scripts
| Script | Source |
|---|---|
| `scripts/crawl_catalog.ts` | Live crawl. Only named vectors run: `--charts=N --playlists=N --decades=N --cjk=N --artists=N --lexicon=N`, or `--all` for the defaults (overrides allowed). Also `--target=N --playlists-only --status` |
| `scripts/enrich_catalog.ts` | Enrichment. Only named steps run: `--albums=N --deezer=N --artists=N --itunes=N`, or `--all` for every step with default limits (overrides allowed). Then `scripts/recompute_catalog.ts` (`npm run catalog:recompute`) |
| `scripts/ingest_annas_spotify.ts` | Anna's Archive Spotify top‑10k (`--min-popularity=31`) |
| `scripts/ingest_musicmovearr.ts` | MusicMoveArr dumps + `changes_*.sql.gz` diffs, streamed (readline + gunzip, 2,000/txn), `requireSample:false` |
| `scripts/fetch_datasets.ts` | Prepares `data/base_tables`, `data/changes`, `data/downloads` |
| `scripts/populate_artist_genres.ts` (`npm run catalog:genres`), `scripts/build_recognized_artists.ts` | Curated artist genre clusters and recognized artists |

Dumps under `data/` are gitignored and must never be committed.

All scripts parse flags strictly (`scripts/lib/cli.ts`, Node's `util.parseArgs`): an unknown flag, a bad value, or no step at all prints the usage and exits 1. `--name=value` and `--name value` both work. Through npm, flags must follow `--` (`npm run catalog:enrich -- --albums=500`). Without it npm takes them as its own config, and the script reports that instead of running.

## Provider rules
- **Deezer:** search results include `isrc` and `rank`; playlist and album-track payloads may not. `/track/{id}` is authoritative. The advanced `artist:"…" track:"…"` search currently returns unrelated or empty results, so use plain `artist title` queries and match the results on artist key plus base title. Preview URLs expire: store ids, not URLs.
- **Apple Music charts:** `https://rss.marketingtools.apple.com/api/v2/{storefront}/music/most-played/{10|25|50|100}/songs.json`. There are no previews or durations, so entries are matched to Deezer tracks.
- **iTunes:** match on artist, base title, and duration, and only attach to existing rows.
- **Spotify:** metadata only, from the dumps (popularity, ISRC). No Web API and no previews.

## Ingest policy
`sqliteCatalog.upsertTrack` enforces it for every writer: only `en`/`ja`/`ko`, original recordings (a remaster counts), authentic music, and a duration of 45 s–20 min. Rejections are counted by reason (`getRejectionStats()`).
- Pass raw popularity as `deezerRank` (Deezer `rank`) or `spotifyPopularity` (0–100). The catalog keeps both and derives a per-language percentile (`server/db/catalogPopularity.ts`). Dump ingest skips rows under the popularity floor (Spotify ≥ 30 or the language's Deezer rank floor); the cleanup enforces the floor for crawled rows once artists are enriched.
- Never invent values (e.g. a default duration). Leave fields unknown so they're rejected or enriched later.
- Details: `server/db/CATALOG_DB.md`.

## Anime pipeline (`anime_catalog.sqlite`)
`npm run anime:sync` (AnimeThemes metadata) → `anime:samples` (20 s FFmpeg clips at multiple offsets into `data/anime_samples/`, gitignored) → `anime:ingest` → `anime:images` (AniList cover art). Clips are served at `/audio/anime/...`.
