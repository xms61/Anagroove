# SpotySpice — Code Review & Implementation Plan (2026-09-23, v1.13.0)

Baseline at review time: `npm run lint` clean, `npm test` 462/462 passing, `main` clean.
Catalog snapshot (`server/data/catalog.sqlite`): **498,000 tracks / 93,527 artists** (docs still say 285k).

Severity: 🔴 critical (wrong behaviour today) · 🟠 high · 🟡 medium · ⚪ low/cleanup

---

## 1. Findings

### 1.1 🔴 Critical

| # | Finding | Evidence |
|---|---|---|
| C1 | **Every stored Deezer preview URL has expired.** Deezer previews are signed (`hdnea=exp=…`) and valid for only minutes to hours. All 494,790 `track_samples` rows were written 2026‑09‑18/19 with `http_status=200` and never rechecked. `resolveTrackPreview` returns any stored `http…` URL as an "instant hit", so the catalog path serves dead audio. | `server/services/previewResolver.js:68-77`, sample `exp=1789817437` ≈ crawl time; `server/data/tracks_cache.json` has the same problem |
| C2 | **FTS5 index is broken.** `tracks_fts` is declared `content='tracks'` with columns `title, artist, album`, and `tracks` has none of those columns. `SELECT COUNT(*) FROM tracks_fts` → `no such column: T.title`. The `MATCH` error is swallowed, so every themed query falls back to `LIKE '%term%'` across 498k rows. There are also no update/delete triggers. | `server/db/sqliteCatalog.js:179-185`, `:707-733` |
| C3 | **Japanese/Korean titles are silently dropped at ingest.** `normalizeDedupeTitle` strips everything outside `[a-z0-9]`, so a pure‑kana/hangul/kanji title canonicalizes to `''`, and `upsertTrack` returns `null`. The whole catalog has only 572 `ja` and 427 `ko` tracks. | `sqliteCatalog.js:18-26`, `:418-419` |
| C4 | **Popularity uses mixed scales.** The harvester stores raw Deezer `rank` (0–999,858), `ingest_musicmovearr` stores `rank/10000`, and Spotify stores 0–100. 489,740 rows are above 100. As a result the "popularity > 30" invariant does nothing, `minPopularity: 20` does nothing, and `ORDER BY popularity*3 + RANDOM()%100` is effectively a fixed popularity sort, so each theme returns the same top tracks. | `harvester.js:229`, `ingest_musicmovearr.js:90-91`, `sqliteCatalog.js:723,874` |
| C5 | **Multiplayer trusts the client‑supplied `playerId`.** (a) Anyone who knows the host id (it's broadcast to the room) can `start_game`. (b) `coop_cell_update`/`puzzle_solved`/`race_progress_update` are accepted for any room code, even from sockets that never joined, and there are only 16×90 = 1,440 possible codes. (c) `join_room` with an existing `playerId` takes over that player's socket. (d) After a reconnect, the old socket's `close` removes the player, and the client never rejoins. | `server/server.js:501-506, 545-547, 569-629, 636-661`; `src/services/socketService.ts:85-96` |
| C6 | **Tests are not isolated.** `run_tests.js` imports `server/db.js` and the `sqliteCatalog` singleton, so it writes to the real `server/data/store.json` (120 users, mostly `test-user-*`/`tab1-*`) and opens the real 480 MB catalog. | `server/db.js:49-52`, `sqliteCatalog.js:921` |

### 1.2 🟠 High

- **H1 Language classification is unreliable.** It is title‑regex only and defaults to `en`, which covers 464,320 rows including FR/DE/BR‑registered ISRCs. Kanji‑only Japanese titles come out as `zh` (211 JP‑ISRC tracks). The crawler has no language gate: `es/fr/de` lexicon seeds and the "latin hits"/"reggaeton" playlists feed it non‑target languages.
- **H2 Many columns are empty.** `release_year` NULL 286,113 (57%) · `isrc` NULL 48,855 · `country_code` NULL 48,908 · `duration_ms=0` 741 · artists: `genres_json` NULL 99.3%, `fans_count=0` 97.5%, `itunes_artist_id` set on 1 artist. The Deezer search/playlist/album‑track payloads don't include `isrc` or per‑track `release_date`; those fields come only from `/track/{id}` and `/album/{id}`. `scripts/populate_artist_genres.js` exists but nothing calls it. Note also that `QZ/QM/QT/TC` are **registrant** prefixes, not countries. The ISRC prefix tells you who registered the recording, not what language or nationality it is.
- **H3 Duplicates.** There are 9,260 groups (19,739 rows) with the same `artist_id + canonical_title` whose durations differ by more than 3 s (live, extended, and remix cuts; e.g. Tiësto "The Tube" ×18, Gloria Gaynor "I Will Survive" ×10). Title normalization removes bracketed tags but not Deezer's `" - 2011 Remaster"` / `" - Live"` suffixes. 53,107 tracks carry more than one Deezer id, with no "primary" id.
- **H4 Contamination.** The catalog contains audiobook chapters ("Kapitel 190 - Tintenherz…") and about 45k live/remix/instrumental/acoustic titles. There are three blocklists that have drifted apart: `crawler/authenticityFilter.js`, `musicService.isAuthenticTrack`, and `catalogValidator` `JUNK_*`.
- **H5 Sanitizer purge patterns never match.** The contamination purge uses space‑less tokens (`'%benjaminblumchen%'`, `'%funffreunde%'`, `'%johnsinclair%'`) against space‑separated canonical names, so they never match. `'%drei%'` over‑matches. Deletes also don't maintain FTS. See `server/db/catalogValidator.js:268-270, 687-689`.
- **H6 The iTunes cross‑reference creates duplicates.** It accepts the first result within 3 s with no title/artist check. It then upserts under the iTunes artist name, which creates new artist and track rows when the names differ. Its unordered `NOT IN` batch re‑selects the same unmatched tracks forever. Only 3 iTunes rows exist. See `harvester.js:496-553`.
- **H7 Runtime/config drift.**
  - Node versions disagree: Dockerfile `node:20`, CI Node 22, `engines >=24`, while `node:sqlite` is what the app uses.
  - `.dockerignore` doesn't exclude `*.sqlite*`, `store.json*`, or the 88 MB of dumps, so the catalog and **user data get baked into the image**.
  - Ports disagree across files: `.env.example` 3001, docs 3000/3001, server 3011, Vite 3010.
  - `GEMINI_API_KEY`/Spotify creds are documented, but no code reads them.
- **H8 Crawler performance.** `getStats()` runs COUNT plus a GROUP BY over 568k provider rows, and it runs on every progress tick and every `isTargetReached()` check.

### 1.3 🟡 Security (beyond C5)

- A CORS rejection throws an `Error`, which gives Express's default 500 response (with a stack trace outside production). It should return a clean 403. See `server.js:114-132`.
- There are no security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) and no `app.set('trust proxy', …)`. The WS limiter trusts a raw `X-Forwarded-For`, which can be spoofed to bypass the per‑IP cap (`server.js:413`).
- Any new `X-User-Id` creates a persisted user, even on read‑only GETs. That means `store.json` can grow without bound, at 120 requests/min per IP. User ids are bearer secrets made with `Math.random` (`src/services/apiClient.ts`).
- `db.js` registers SIGINT/SIGTERM handlers that call `process.exit`. That preempts any other shutdown work, so the catalog never runs `wal_checkpoint(TRUNCATE)`.
- `removeBlacklistItem` also deletes any item whose canonical *name* equals the id string (`server/db.js:267-273`).
- WS messages don't check that the sender is in the room (C5). Room codes are short enough to brute‑force, so use 6 random chars from an unambiguous alphabet.
- Spotify `preview_url` has been deprecated for new apps since Nov 2024. Don't plan to get audio from Spotify; use it only for metadata (popularity, ISRC).

### 1.4 Track selection

- Every request fans out to the Deezer API, up to 4 iTunes searches, **and** the catalog, but the catalog contributes only 60–100 rows. It isn't really "catalog‑first", and it burns the external rate limits.
- Ordering is deterministic (C4). The seeded sort computes SHA‑256 inside the comparator, which is O(n log n) hashes.
- `isTemporalPermitted` rejects tracks with a NULL year (57% of the catalog) and mutates the track object.
- Tier fallback: pass 3 only runs if tier 0 **and** tier 1 are completely empty, so a small tier 0 plus a leftover tier 1 can under‑fill the pool (`musicService.js:942-956`).
- Language policy is implemented three times: SQL `language`, the `isLanguagePermitted` regex, and `detectTrackLanguage`.
- Hundreds of hardcoded artist‑name regex guardrails (Daft Punk, Billy Idol, Hozier…) are whack‑a‑mole in code. They should be data, applied at ingest.
- `LEFT JOIN track_samples` returns one row per sample, which produces duplicate candidates.

### 1.5 Architecture

- `musicService.js` (998 lines) mixes language, thematic, and authenticity policy with sampling and clue building. `server.js` (688 lines) mixes HTTP routes, the WS room engine, and static serving.
- There are three persistence layers: the JSON `store.json`, `catalog.sqlite`, and `anime_catalog.sqlite`. User state belongs in SQLite.
- The Deezer→candidate mapping is copy‑pasted 4× in `harvester.js`, even though `deezerMusicProvider.mapDeezerTrack` already exists.
- Migrations are ad‑hoc `try { ALTER … } catch {}`, with no `PRAGMA user_version`.
- `agents.md` is stale (321 tests vs 462, 285k vs 498k tracks) and overlaps with `.agents/skills/*`.

### 1.6 Unneeded files

| File | Status | Action |
|---|---|---|
| `server/data/tracks_cache.json` (15k lines, 900 KB, **tracked**) | unreferenced, expired URLs | delete |
| `src/utils/liveGenerator.ts` | only used by `scripts/test_randomizer.js` | delete both, or move into tests |
| `scripts/inspect_crossword_batch.js`, `refresh_audio_pool.js`, `test_live_generator.js`, `verify_all_themes.js`, `verify_puzzles.js` | not referenced anywhere | delete |
| `scripts/evaluate_city_pop_variance.js`, `test_features.js`, `test_randomizer.js`, `fetch_all_previews.js`, `generate_puzzles.js` | one‑off / dev only | delete, or fold into `scripts/dev/` |
| `scripts/populate_artist_genres.js` | unreferenced but **needed** | wire into the enrichment pipeline (Phase 3) |
| `data/master_song_pool.json`, `data/music_pool.json` | only used by scripts; contain expired audio URLs | **delete (D3 confirmed)**, along with the scripts that depend only on them |
| `reports/*.md` (1,200 lines) | generated output | gitignore; publish as CI artifacts |
| `.agents/skills/*` | duplicates `agents.md` | fold into section docs (Phase 0) |
| Untracked local clutter: `data/spotify_top10k.html` 32 MB, `animethemes_dump.json` 38 MB, `store.json.bak`, `dist/` | already gitignored | exclude in `.dockerignore` |

### 1.7 UI & design

- **Accessibility:** none of the 7 modals has `role="dialog"`, `aria-modal`, or a focus trap. Only `LoungeDrawer` closes on Esc.
- **Design tokens aren't used.** A `kissa` palette is defined in `tailwind.config.js`, but components hardcode `bg-[#131722]`/`bg-[#171a25]`. The multiplayer victory modal uses an off‑palette gray/yellow. `index.html` body is `#181818` while CSS says `#0b0e14`, which causes a flash on load.
- **Readability:** heavy `text-xs` + `text-slate-400` on near‑black. Audit for WCAG AA contrast and use at least 14px for clue text.
- **Mobile:** the race leaderboard is a non‑wrapping row that overflows with more than 3 players.
- **Broken menu item:** "Solved History" opens the current puzzle's end screen. `/api/history` exists, but no view uses it.
- **Fragile storage:** `localStorage` reads in `App.tsx` init and `apiClient.ts` aren't guarded, so they throw when storage is blocked. Settings are parsed separately in 3 components; a single `useSettings()` hook would fix that.
- **Stale restore:** a persisted live puzzle restores expired audio URLs (fixed by C1's preview endpoint).
- **Fonts:** Google Fonts are render‑blocking. Self‑host via `@fontsource/*`.
- **Branding:** "SpotySpice" + Spotify green (`#1db954`) is a trademark risk if the app goes public.

### 1.8 Testing

The suite is healthy but monolithic: one 2,207‑line runner (it has a TODO to split), no coverage, no frontend tests, and no DB‑invariant tests. It also isn't isolated (C6). CI runs Node 22 while the engine requires 24.

---

## 2. Target design decisions

### 2.1 Catalog schema v2 (migrations via `PRAGMA user_version`)

```sql
tracks(
  id, isrc TEXT UNIQUE CHECK (isrc IS NULL OR isrc GLOB '[A-Z][A-Z][A-Z0-9][A-Z0-9][A-Z0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  base_title TEXT NOT NULL,            -- Unicode-aware, version suffixes stripped
  display_title TEXT NOT NULL,
  version_type TEXT NOT NULL DEFAULT 'original'
      CHECK (version_type = 'original'),   -- D2: originals only (remaster tag stripped → original)
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  album_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 45000 AND 1200000),
  release_year INTEGER CHECK (release_year BETWEEN 1900 AND 2100),
  release_date TEXT,
  language TEXT NOT NULL CHECK (language IN ('en','ja','ko')),
  language_confidence REAL,
  isrc_registrant TEXT,                -- renamed from country_code (it is not a country)
  deezer_rank INTEGER, spotify_popularity INTEGER,
  popularity_score INTEGER NOT NULL CHECK (popularity_score BETWEEN 0 AND 100),
  primary_deezer_id INTEGER,
  is_explicit INTEGER NOT NULL DEFAULT 0,
  rand_key REAL NOT NULL DEFAULT (abs(random()) / 9.2233720368547758e18),
  UNIQUE(artist_id, base_title)        -- one playable version per song (decision D2)
);
CREATE INDEX idx_tracks_pick ON tracks(language, popularity_score, rand_key);
```

- **`track_samples` → `preview_cache(track_id, provider, provider_track_id, url, expires_at)`.** Parse `exp=` from Deezer URLs. iTunes URLs are stable, so give them a long TTL.
- **FTS:** rebuild as a regular FTS5 table with `tokenize='trigram'`, which handles CJK and substring search. Keep it in sync with `AFTER INSERT/UPDATE/DELETE` triggers. Queries shorter than 3 characters (e.g. `사랑`) fall back to indexed `LIKE`.
- **Artists** gain `primary_language`, `genres_json CHECK (json_valid(genres_json))`, `fans_count`, and `last_enriched_at`.
- **Normalization:** `base_title` = NFKC → lowercase → strip `(…)`/`[…]` **and** ` - <version marker>` suffixes → keep `\p{L}\p{N}`. That is the same approach `shared/musicIdentity.canonicalMusicKey` already uses, so reuse it.

### 2.2 Language policy: en / ja / ko only

Combine these signals into one `classifyLanguage({title, album, artist, artistTitles, isrc})` in `shared/`:

1. **Script:**
   - Any Hangul → `ko`.
   - Any Kana → `ja`.
   - Han with no Kana → `ja` only if the artist is `ja` or the ISRC is `JP`; otherwise reject.
   - Other non‑Latin scripts → reject.
2. **Artist‑level vote:** run an n‑gram detector (e.g. `eld` or `franc`) on the artist's concatenated titles. That is far more reliable than one short title, and it classifies romanized J/K titles ("Gurenge", "Kaikai Kitan") by artist.
3. **Priors:** ISRC registrant `JP`/`KR`, the storefront or chart the track came from, and curated seed artist lists.
4. Keep the track only if the result is in `{en, ja, ko}` with confidence ≥ threshold. Everything else is rejected and never inserted (D1). There is no review queue; rejects are only counted per reason in the crawl logs.

**Crawler seeds:**
- Drop the `es/fr/de` lexicon seeds and the latin/reggaeton/"French house" playlists.
- Add JP/KR sources:
  - Deezer country chart playlists.
  - iTunes Search with `country=jp|kr`.
  - Apple Marketing RSS `rss.applemarketingtools.com/api/v2/{us,gb,jp,kr}/music/most-played/100/songs.json`, which is a clean, public, popularity‑ranked feed.

### 2.3 Popularity normalization

- Store the raw provider values (`deezer_rank`, `spotify_popularity`) plus a computed `popularity_score` 0–100.
- Calibrate `score = f(log10(deezer_rank))` against the **9,904 tracks that already have both** a Spotify link and a Deezer rank, using a simple monotone fit.
- The `> 30` rule then applies uniformly. Recompute the score in the migration.

### 2.4 Track selection algorithm v2

1. **Prefilter in SQL on indexed columns:** `language IN (…)`, `popularity_score >= floor(tier)`, year range (NULL year allowed unless a decade was requested), theme via FTS/genre, and excluding recent catalog ids.
2. **Random window:** `WHERE rand_key >= ?random ORDER BY rand_key LIMIT 400` (wrapping around). This is O(log n) instead of `ORDER BY RANDOM()` over the whole table.
3. **Weighted sampling without replacement** (Efraimidis–Spirakis: key = `u^(1/w)`, with `w = popularity_score^α`). The popularity slider maps to α: `obscure` = 0, `mainstream` = 2. With a seed, use a seeded PRNG; don't hash in a comparator.
4. **Diversity pass** (keep the existing rules): 1 track per artist, answer‑length buckets, clue‑type rotation, no duplicate answers, and the blacklist.
5. **External APIs only when the catalog yields fewer than N candidates** (rare themes, or a specific artist not in the catalog). Newly found tracks are upserted, so the catalog learns.
6. **Preview:** the client receives `audioUrl: /api/preview/:trackId`. The server issues a 302 to a cached, still‑valid URL, or re‑mints one via Deezer `/track/{id}` with an iTunes fallback. This fixes C1 for live play, multiplayer, and restored puzzles.
7. **One policy module:** move `isLanguagePermitted`, `isThematicallyPermitted`, and `isAuthenticTrack` into `server/policy/`. Move the guardrail data (blocked artist names, homonyms) into `server/policy/rules.json`, shared by the crawler, validator, and selection.

---

## 3. Implementation plan (one PR per phase, following AGENTS release rules)

### Phase 0: Agent docs, hygiene, isolation (patch)
- **Restructure `agents.md` for token cost (requested):**
  - **`AGENTS.md` becomes a map only** (about 15 lines, down from 150 lines / ~2.7k tokens). Each line gives a doc path and **when to read it**, e.g. `server/db/CATALOG_DB.md — read before touching schema, ingest, dedupe or sanitizer`. There is no other content. Guardrails (never push `main`, never commit `*.sqlite`/`.env`) live in the release doc, and the map entry for it says "read before any commit/PR".
  - **Colocated section docs with distinct names**, so a search or an agent pulls only the one it needs:

    | File | Scope (only this) |
    |---|---|
    | `server/db/CATALOG_DB.md` | schema v2, migrations, dedupe tiers, language/popularity invariants, sanitizer, WAL |
    | `server/crawler/CRAWLER.md` | providers, rate limits, seeds, authenticity rules, ingest scripts, enrichment |
    | `server/services/TRACK_SELECTION.md` | selection pipeline, preview resolution, query plan |
    | `server/MULTIPLAYER_WS.md` | WS protocol, room lifecycle, authz rules |
    | `server/API_SECURITY.md` | REST endpoints, validation, rate limits, CORS, secrets/env vars |
    | `shared/CROSSWORD_ENGINE.md` | keyword extraction, clue types, grid generator |
    | `src/FRONTEND_UI.md` | component map, design tokens, a11y rules, state/storage |
    | `scripts/SCRIPTS_CLI.md` | npm scripts table |
    | `scripts/tests/TESTING.md` | test layout, isolation env vars, fixtures, coverage |
    | `.github/RELEASE_PROCESS.md` | branching, version bump, changelog/README, PR, pre‑commit checklist |

  - Fold `.agents/skills/*` into these docs and delete the skills, so there is one source of truth (decision D4).
  - Move volatile numbers (test counts, catalog size) out of the docs. `npm run crawl:status` is the source.
  - Optional: add a one‑line `CLAUDE.md` containing `@AGENTS.md` so Claude Code loads the map too.
- **Test isolation:** add `SPOTYSPICE_DATA_DIR` (or `STORE_PATH`/`CATALOG_PATH`) env overrides. The test runner sets them to a temp dir. Make `sqliteCatalog` lazily constructed instead of an import‑time singleton.
- **Runtime alignment:** Node 24 in CI, the Dockerfile, and `.nvmrc`. `.dockerignore` excludes `server/data/*`, `data/*.json` dumps, `*.sqlite*`, `reports/`, `.gemini`, and `.idea`. Pick one port pair (e.g. API 3001 / Vite 3000) across `.env.example`, `vite.config.ts`, and the server. Remove `GEMINI_API_KEY` from `.env.example` unless the judge actually uses it.
- **Deletions:** remove the unused files in §1.6, including the offline pools and their scripts (D3), and `.agents/skills/` once its content is folded in (D4). Remove `GEMINI_API_KEY` and `SPOTIFY_*` references from `.env.example` and the docs (D5).

### Phase 1: Correctness hot‑fixes (patch)
- **C1:** add the `GET /api/preview/:trackId` 302 endpoint plus the `preview_cache` expiry check. `resolveTrackPreview` must ignore an expired `exp=`. The frontend uses the endpoint URL.
- **C5 multiplayer:** the server binds `playerId` to the socket on create/join, ignores message‑supplied `playerId` for authz, and requires `currentRoomCode === data.roomCode`. `start_game` is host‑only by socket identity. Reconnect uses a per‑player `resumeToken` (random 128‑bit, returned on join), with a 30 s grace period before a disconnected player is removed. The client rejoins on reconnect. Room codes become 6 chars.
- **Security basics:**
  - CORS rejection → 403 JSON.
  - Set `trust proxy` from env; use `req.ip` everywhere, including WS.
  - Add a minimal security‑headers middleware (CSP for the prod static build).
  - Don't create users on GET: `getUser` becomes read‑only, with a separate `ensureUser` for writes.
  - Replace `db.js`'s signal handlers with a single `server/shutdown.js` that flushes the store and runs `wal_checkpoint(TRUNCATE)`.
  - Fix `removeBlacklistItem` to delete by id only.
  - Generate client ids with `crypto.randomUUID()`.

### Phase 2: Schema v2 & ingest core (minor)
- Add a migration framework (`server/db/migrations/NNN_*.js`, tracked by `user_version`, wrapped in a transaction, preceded by a `VACUUM INTO` backup).
- Implement §2.1:
  - Unicode `base_title` + `version_type`, which fixes C3.
  - `popularity_score` + the calibration script, which fixes C4.
  - Trigram FTS + triggers, which fixes C2.
  - Rename `country_code` → `isrc_registrant`.
- **`upsertTrack` v2:**
  - Validate every field against the CHECKs before insert, and reject with a reason counter instead of `return null`.
  - Add a version classifier (in the shared rules module) that looks at the title suffix, the brackets, and the album title. Any non‑original version is rejected before upsert (D2).
  - Tier 2 dedupe on `(artist_id, base_title)` regardless of duration. The original release beats a remaster, then the highest `popularity_score` wins.
  - Set a primary Deezer id.
  - Handle multi‑artist credits: primary artist plus a `track_artists` join table, so `"A, B"` artist rows go away (1,236 exist today).

### Phase 3: Crawler en/ja/ko + enrichment (minor)
- Build `shared/languageClassifier.js` (§2.2) with its test corpus (en/ja/ko positives; es/fr/de/zh/romanized negatives).
- Crawler:
  - Replace the seeds per §2.2.
  - Run language and authenticity gates **before** upsert.
  - Deduplicate the 4 copy‑pasted mappers into one `mapDeezerTrack`.
  - Cache stats (O(1) counters in a `crawl_state` table) instead of calling `getStats()` per tick.
- **Enrichment jobs** (resumable through `crawl_queue`, rate‑limited to Deezer's ~50 req/5 s):
  - `/album/{id}` → `release_date`, `genres`. One call per album, which covers most of the 286k missing years.
  - `/track/{id}` → `isrc`, `rank`, contributors, for the 48.9k tracks without an ISRC.
  - `/artist/{id}` → `nb_fan`. Wire in `populate_artist_genres.js` here.
  - iTunes cross‑ref v2: search by ISRC first; otherwise require `canonical(artist)` + `base_title` equality **and** Δduration ≤ 3 s. Attach to the existing track id; never upsert a new one. Order candidates by `last_enriched_at`.
- **Authenticity:** one rules module shared by the crawler, validator, and selection. Add audiobook/hörspiel/"Kapitel N", live, remix, instrumental, and demo patterns.

### Phase 4: Migrate & sanitize the existing DB (minor)
Rewrite `validate_and_sanitize_db.js` as idempotent steps, each with a dry‑run diff and counts:
1. Back up with `VACUUM INTO`.
2. Recompute `base_title`/`version_type`. **Delete every non‑original version** (about 45k live/remix/instrumental/acoustic titles are candidates). Merge the remaining duplicate groups (from the 9,260): re‑point providers and samples to the kept original, and delete the rest. A group with no original is deleted entirely (D2).
3. Re‑classify language and **delete all non en/ja/ko tracks**, then delete artists left with no tracks (D1). Re‑ingest JP/KR titles that were dropped before (C3) through the Phase 3 crawler.
4. Purge contamination using the shared rules (this fixes the H5 patterns).
5. Enforce NOT NULL/CHECK columns by running enrichment; delete what still can't be filled (e.g. `duration_ms=0`).
6. Rebuild FTS, then `ANALYZE`, `wal_checkpoint(TRUNCATE)`, `VACUUM`.
7. **Validation gate:** add `npm run db:validate -- --ci`, which fails when:
   - duplicate groups > 0,
   - `language ∉ {en,ja,ko}`,
   - `version_type ≠ 'original'`, or a title still matches a non‑original version pattern,
   - `popularity_score` is outside 0–100,
   - release year coverage < 95%,
   - ISRC coverage < 95%,
   - any orphans exist,
   - the FTS row count ≠ the track count.

### Phase 5: Track selection v2 (minor)
- Implement §2.4.
- Split `musicService.js` into `selection/`, `policy/`, and `clues/`. Split `server.js` into `routes/` and `ws/rooms.js`.
- Remove the external API fan‑out from the hot path (fallback only).
- Fix the tier pass logic: fill from tier 0 → 1 → 2 → 3 until `count` is reached.
- Precompute seeded sort keys.
- Move user state (`store.json`) into SQLite tables (`users`, `progress`, `history`, `blacklist`), with a one‑time import.

### Phase 6: UI & design (patch/minor)
- Add a shared `<Modal>` with `role="dialog"`, `aria-modal`, a focus trap, Esc to close, and focus restore. Migrate all 7 modals to it.
- Replace hardcoded hex colors with Tailwind tokens. Fix the `index.html` background flash. Restyle the victory modal to match the palette.
- Contrast/type pass: WCAG AA, clue text ≥ 14px.
- Make the race leaderboard wrap or scroll on mobile.
- Build a real history view on `/api/history`.
- Add `useSettings()` with guarded storage. Self‑host fonts.
- Show language badges (EN/JA/KO) in the live generator as a filter, since the catalog now supports it.

### Phase 7: Testing (continuous; restructure in Phase 0/1)
- Split `run_tests.js` into `scripts/tests/*.test.js` on the built‑in `node:test`, with `c8` coverage. Target ≥ 80% on `server/db`, `server/policy`, and `shared`.
- **New suites:**
  - Unicode dedupe (kana/hangul/kanji titles survive).
  - FTS trigger consistency.
  - Popularity calibration.
  - Language classifier corpus.
  - Preview expiry + the 302 endpoint (mocked fetch).
  - WS authz (spoofed host, non‑member messages, reconnect with `resumeToken`).
  - Migration up‑path on a fixture DB.
  - Sanitizer idempotence (run twice → zero diff).
- **Frontend:** Vitest + React Testing Library for `useCrosswordGame`/`useBlacklist`; one Playwright smoke test (generate → type → solve).
- **CI:** Node 24; `lint`, `tsc --noEmit`, `test`, `build`; `db:validate --ci` against a small committed fixture DB.

---

## 4. Decisions (confirmed 2026-09-23)

- **D1 — Languages:** delete every track that isn't en/ja/ko. There is no `hidden` flag. This applies to the existing DB (Phase 4, after a `VACUUM INTO` backup) and to ingest (Phase 3 gate: any other language is rejected and never inserted). Artists left with no tracks are deleted too.
- **D2 — Versions:** keep one version per song, and **only the original**.
  - `version_type` is limited to `'original'`. Live, remix, edit, extended, acoustic, instrumental, demo, re‑recorded ("Taylor's Version"), sped‑up/slowed, karaoke, and cover versions are rejected at ingest and deleted in Phase 4.
  - A **remaster** is the same original recording, so it's accepted: the remaster tag is stripped from `base_title` and the track is stored as `original`. When both exist, keep the non‑remaster release first, then the one with the highest `popularity_score`. (Flag this if remasters should be excluded too.)
  - A duplicate group with no original version is deleted entirely.
- **D3 — Offline pools:** delete `data/master_song_pool.json`, `data/music_pool.json`, and the scripts that only exist to build or read them (`generate_puzzles.js`, `refresh_audio_pool.js`, `fetch_all_previews.js`, `test_live_generator.js`, `generate_all_themes.js`/`verify_all_themes.js` if they depend only on the pools). Remove the related npm scripts and README/doc references.
- **D4 — Agent skills:** fold `.agents/skills/*` into the section docs (catalog-crawler → `CRAWLER.md` + `CATALOG_DB.md`, crossword-engine → `CROSSWORD_ENGINE.md`, release-discipline → `RELEASE_PROCESS.md`), then delete `.agents/skills/`.
- **D5 — Spotify:** metadata only, from the existing dumps (Anna's Archive top‑10k, MusicMoveArr). No Spotify Web API integration and no Spotify credentials. Spotify data feeds `spotify_popularity` (used to calibrate `popularity_score`) and ISRCs. Remove `SPOTIFY_*` from the docs.

## 5. Suggested order & sizing

| Phase | Version | Size | Depends on |
|---|---|---|---|
| 0 docs/hygiene/isolation | patch | S | — |
| 1 previews + WS authz + security basics | patch | M | 0 |
| 2 schema v2 | minor | L | 0 |
| 3 crawler en/ja/ko + enrichment | minor | L | 2 |
| 4 migrate/sanitize existing DB | minor | M (+ long‑running jobs) | 2, 3 |
| 5 selection v2 + refactor | minor | L | 2, 4 |
| 6 UI/a11y | patch/minor | M | 1 |
| 7 tests | continuous | — | each phase adds its own |
