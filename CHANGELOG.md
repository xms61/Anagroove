# Changelog

All notable changes to the **Anagroove** project (formerly SpotySpice) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.31.0] - 2026-09-25

### Added
- **Two enrichment steps give the language vote more evidence.** `catalog:recompute` reads both, and migration v9 adds their columns.
  - `catalog:enrich -- --discography=N` reads each artist's Deezer release titles, plus top tracks when there are few releases.
    - It covers artists without a vote first, then English-voted artists with fewer than 10 catalog titles.
    - One catalog song is too little to vote on; the releases usually are enough. "QURL" has one song in the catalog and 15 French singles on Deezer.
  - `catalog:enrich -- --lyrics=N` looks up the lyrics of songs by artists voted a language the catalog doesn't keep (LRCLIB, 1 request/s) and stores the language they are sung in.
    - A Spanish-voted act keeps its English songs (Becky G "Shower"); an English title sung in French stays French (Aya Nakamura "Baby").
    - Only the language is stored, never the lyrics. Run it after a recompute: it picks songs by the current votes.
  - A sample run of 40 artists and 40 songs on a copy of the catalog:
    - the release titles voted 14 artists French (Bigflo & Oli, Christophe Maé, Barbara Pravi), 2 Spanish (Aventura) and 23 English
    - the lyrics kept Miriam Bryant's "Black Car" English and showed 32 English-titled songs are sung in another language

### Changed
- The table-column helper of the migrations is shared (`tableColumns.ts`), so the language recompute that migration v3 replays can check for the v9 columns.

---

## [1.30.2] - 2026-09-25

### Fixed
- **French, Spanish, German, Italian and Portuguese songs no longer pass as English.**
  - An artist whose titles leaned another language by less than the 0.15 margin was voted English. An artist with too few titles got no vote, so its songs counted as English.
  - SCH, Damso, Aya Nakamura, RAF Camora, Capo Plaza, KAROL G, Prince Royce and Bad Bunny were among them.
  - The vote now also reads album names.
  - A narrow lead counts when most of the artist's country-coded ISRCs come from a country of that language, or when a Latin or Brazilian genre backs it.
  - A clearly foreign 2–3-word title overrules an English vote when its ISRC comes from that language's country ("Dans mon café", FR).
  - On a copy of the 2026-09-25 catalog, 8,926 tracks change language: 4,349 to French, 1,469 to German, 1,452 to Spanish, 584 to Portuguese and 576 to Italian. English-singing acts from other countries (Daft Punk, Scorpions, ABBA, Roxette, Måneskin) stay English.
- The crawler's vote on a new artist's top tracks reads their album titles too.

### Added
- **`npm run catalog:recompute` prints what the language votes changed:** the transitions (`en→fr 4,349`) and the 30 most-followed artists whose vote changed.
  - `-- --dry-run` recomputes only the languages and rolls them back, so the changes can be reviewed before they apply.

---

## [1.30.1] - 2026-09-25

### Fixed
- **The end screen shows covers and "Open on Deezer" links again.** Songs from the local catalog never carried either. Before 1.30.0 most puzzles also held live Deezer results, which did. Since themes are served from the catalog alone, the tracklist showed only placeholders.
  - The catalog window now reads each track's provider page and the Deezer album id stored with it.
  - The cover is Deezer's album picture, or the artist's picture when the album is unknown (about half the rows). Both are redirects to Deezer's image CDN.

---

## [1.30.0] - 2026-09-24

### Changed
- **Live Deezer/iTunes lookups only for prompts that name an artist.** Themes and every other prompt are served from the local catalog alone. A named artist the catalog has too few rows of is still looked up, and the results are stored in the catalog as before.
  - Both providers search the artist and keep only tracks credited to that artist, so "songs by Queen" no longer brings ABBA's "Dancing Queen".
  - With an empty catalog, only artist prompts produce puzzles.
- **The K-pop, J-pop and anime themes only use Korean or Japanese songs.** Before, they also took English songs by any artist with the theme's genre tag. On 2026-09-24 more than half of the K-pop pool was Western acts: Drake, Radiohead and Queen were its three biggest artists.
- **A named artist is served in every language.** "songs by YOASOBI" found no songs before, because artist prompts only allowed English.
- Two theme playlist seeds, "top south korea" and "top japan", are gone. They are country charts of mostly Western hits and were the main source of the wrong genre tags.

### Fixed
- **K-pop and J-pop acts vote Korean or Japanese.** Deezer romanizes their titles and many of their ISRCs are US codes, so TWICE, Stray Kids, BTS, NewJeans and about 85 more voted English, and 2NE1 and TREASURE voted Japanese.
  - A K-Pop, Japanese, J-Pop, City Pop or Anime genre from a theme playlist now counts when evidence backs it: Deezer's Asian Music genre, at least one KR ISRC, or a fifth of the ISRCs from JP.
  - Western acts on those playlists stay English.
  - `npm run catalog:recompute` applies it, and removes these genres from artists the vote puts in another language. On the 2026-09-24 catalog, 1,558 tracks moved to Korean and 161 wrong genre tags were removed.
  - K-pop and J-pop acts with none of that evidence still vote English: LE SSERAFIM and the BTS solo acts.

### Removed
- **The K-pop artist blocklist** in the thematic rules. The language rule above does its job.
- **The per-genre live search setup:**
  - `DEEZER_GENRE_TAXONOMY`
  - the theme search variations, the K-pop and anime seed artists, and the year searches in the query plan
  - the fan and rank thresholds
  - the iTunes storefront guessing
  - the iTunes genre guards in the thematic rules
- **The `minFans` option** of `GET /api/music/random` and `POST /api/puzzles/live`. It only steered the genre search and is now ignored if sent.

---

## [1.29.0] - 2026-09-24

### Security
- **WebSocket frames over 64 KiB are refused while they arrive** (`maxPayload`, close 1009). The old check ran after `ws` had buffered up to its 100 MiB default, and an oversized frame's `error` event, which had no listener, crashed the process.
- **Dead sockets are dropped:** a socket that misses a 30 s ping is terminated, which frees its seat and its per-IP connection slot.
- **Room codes can't be guessed in bulk:** `join_room` allows 10 unknown codes per minute per IP.
- **The anonymous user id stays out of logs and URLs.** It is read from `X-User-Id` only, the request log records the path without the query string, and free text (prompt, artist, album, decade, player name) loses control characters.
- **Workflows run with read-only tokens** unless a job needs more. The release version input is validated, a separate job holds the write token, third-party actions are pinned to commit SHAs, and Dependabot proposes updates for them.
- **The runtime image's code is read-only to the app user**, which owns only `server/data`. A `HEALTHCHECK` is added.

### Fixed
- **Hidden artists stay hidden.** An artist hidden from a live Deezer song came back in catalog songs, which carry no provider artist id. Catalog rows now carry the artist's Deezer id, and when a song has no comparable id, the name decides.
- **Theme prompts keep their full-text matches.** Under 10 trigram matches were replaced by a `LIKE` for the literal text "tok1 OR tok2", which found nothing for prompts with two keywords (8 matches became 0 tracks).
- **English live candidates are no longer rejected as foreign:** "Die With A Smile", "Son of a Preacher Man" and "Don’t Start Now". From 3 words the language classifier decides, and typographic punctuation counts as Latin text.
- **"Drake" no longer covers "Nick Drake"** in the one-track-per-artist rule for artist prompts.
- **A production deployment accepts its own POST and DELETE requests.** Browsers send `Origin` on them, and without `CORS_ALLOWED_ORIGINS` they got 403. The page's own origin is now always allowed, for HTTP and WebSocket.
- **API requests handled by the routers are logged.** The request log read `req.path` after routing had removed the `/api` prefix.
- **A crawl no longer freezes the server.** The server opens the catalogs with a 250 ms busy timeout (scripts keep 10 s), so its best-effort writes give up instead of blocking the event loop for up to 10 s.
- **The iTunes text search only plays a result by the same artist** with the same base title.
- **A seed reproduces the grid layout too**, not only the songs.

### Changed
- **Preview lookups stay within the provider budget.** Concurrent requests for one ref share a lookup, a ref without a preview is not looked up again for 10 minutes, outbound calls time out, and an exhausted budget answers 503 with `Retry-After`. The 10 s live-fallback timeout now also stops the Deezer and iTunes requests still running.
- **Per-user limits:** up to 500 hidden artists and songs (the next add answers 409 with a message the client shows), and the newest 1,000 solved puzzles.
- **Catalog schema v8:** `artist_genres` (kept in sync by triggers) and a NOCASE index on artist names. On a 500k-track test catalog, a genre without matching artists went from 415 ms to 0.2 ms and an artist prompt from 16 ms to 0.2 ms. Artist prompts treat `%` and `_` as plain characters.
- **Faster grids:** a trial stops once a pass places nothing, crossings are looked up through owner grids, and the best trial is rendered once. 15-word grids: 51 → 12 ms; a target that can't be reached: 171 → 10 ms.
- **Selection policy per request:** `createLanguagePolicy` and `createThematicPolicy` resolve the request's rules once. The homonym guards are rows of `THEMATIC_RULES`. `canonicalMusicKey` memoizes its result.
- Docker compose mounts the anime clips and documents `TRUST_PROXY` and `CORS_ALLOWED_ORIGINS`.

### Added
- **Race wins are checked by the server:** `puzzle_solved` carries the player's grid, and only the first correct claim in a started room counts.

---

Older releases (1.28.12 and earlier): [docs/CHANGELOG-archive.md](docs/CHANGELOG-archive.md).
