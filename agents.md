# SpotySpice — Agent Guidelines & Repository Manual

Welcome to **SpotySpice** (`xms61/SpotySpice`). This document defines the operational directives, architectural invariants, and development workflows for AI agents working in this repository.

---

## 1. Core Principles & Mandatory Directives

### 1.1 Branching & Pull Request Discipline
- **NEVER push directly to `main`**.
- Always create a descriptive feature branch (e.g., `feat/<feature-name>` or `fix/<issue-name>`).
- When ready to push, push to the feature branch and raise a Pull Request against `main` using GitHub CLI (`gh pr create`).
- If an existing PR for the feature is still open, you can update it by pushing new commits to the same branch.
- **PR Title & Description**:
  - Always provide a clear, concise title and structured summary description.
  - Highlight key features, architectural decisions, metrics, and passing test results.

### 1.2 Versioning & Documentation
- **Every commit / PR must bump either a `patch` (bug fixes / enhancements) or `minor` (new features / capabilities) version**.
- Synchronize versions across:
  1. [`package.json`](file:///C:/Users/xms/Documents/Projects/SpotySpice/package.json) (`"version"`)
  2. [`package-lock.json`](file:///C:/Users/xms/Documents/Projects/SpotySpice/package-lock.json) (`"version"` and `packages[""].version`)
  3. [`CHANGELOG.md`](file:///C:/Users/xms/Documents/Projects/SpotySpice/CHANGELOG.md) (following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/))
  4. [`README.md`](file:///C:/Users/xms/Documents/Projects/SpotySpice/README.md) (update CLI tables, features, and setup instructions)

### 1.3 Security & Secrets
- **NEVER commit API keys, tokens, or credentials to the repository**.
- `.env` must remain gitignored. Use [`.env.example`](file:///C:/Users/xms/Documents/Projects/SpotySpice/.env.example) for template definitions.
- If external credentials (`GEMINI_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`) are missing or set to placeholder/`TODO`, system modules must fail gracefully to standby mode without crashing.

### 1.4 SQLite Database Management
- **`catalog.sqlite`, `catalog.sqlite-wal`, and `catalog.sqlite-shm` must NEVER be committed to Git**. They are strictly gitignored.
- **WAL Compaction**: Always run `PRAGMA wal_checkpoint(TRUNCATE);` before finishing long ingestions or shutting down to keep disk footprint minimal.
- **Concurrency**: The database uses Node.js 24 native `node:sqlite` (`DatabaseSync`) with `PRAGMA busy_timeout = 10000;` to gracefully await concurrent access.

---

## 2. Technical Stack & Architecture

- **Frontend**:
  - React 19, TypeScript, Vite.
  - Tailwind CSS, Lucide icons, Canvas Confetti.
  - Port: `3000` (development via `npm run dev:client`).
- **Backend**:
  - Node.js 24, Express 4, WebSocket (`ws`).
  - Native SQLite (`node:sqlite` `DatabaseSync`) with WAL mode and FTS5 full-text search.
  - Port: `3001` (development via `npm run dev:server`).
- **Data Stores**:
  - `server/data/catalog.sqlite`: Massive local music catalog (>285,000 tracks, >93,000 artists).
  - `data/master_song_pool.json` & `data/music_pool.json`: Bundled static puzzle pools for offline mode.

---

## 3. SQLite Music Catalog & Crawler Invariants

### 3.1 Authenticity Filtering (`server/crawler/authenticityFilter.js`)
All candidate tracks ingested into the catalog must satisfy [`isAuthenticCandidate`](file:///C:/Users/xms/Documents/Projects/SpotySpice/server/crawler/authenticityFilter.js#L71):
- **Excluded Content**: Covers, karaoke versions, tribute bands, lullabies, white noise, workout mixes, 8-bit chip tunes, and amateur fan re-uploads.
- **Duration Guard**: Standard musical recordings between 45s and 1200s (20 mins).
- **Audio Previews**: Active, playable 30-second audio preview URL (`http*`), with optional bypass (`{ requireSample: false }`) for authoritative metadata feeds awaiting backfill.

### 3.2 Popularity Threshold
- Enforce `popularity > 30` (strict `minPopularity >= 31`) across Deezer, Spotify, and iTunes candidates to prevent obscure low-quality noise.

### 3.3 Two-Tier Deduplication & Cross-Referencing
Tracks are deduplicated inside [`sqliteCatalog.upsertTrack`](file:///C:/Users/xms/Documents/Projects/SpotySpice/server/db/sqliteCatalog.js):
- **Tier 1 (ISRC)**: Exact match on standard 12-character International Standard Recording Code.
- **Tier 2 (Compound Key)**: Match on `artist_id` + `canonical_title` + acoustic duration window ($\Delta \le 3000\text{ ms}$).
- When a track matches across providers (e.g. Deezer + Spotify + iTunes), provider links and sample URLs are merged into `track_providers` and `track_samples`, increasing the cross-referenced track tally.

### 3.4 Metadata Classification
- **Country Codes**: Extracted from the 2-letter ISO 3166-1 prefix of 12-character ISRCs (`country_code`).
- **Language Detection**: Automated Unicode script classification (`ko`, `ja`, `zh`, `ru`, `ar`) and linguistic regex markers (`es`, `fr`, `de`, `it`, `pt`, `en`) populated in `language`.

---

## 4. Key Scripts & CLI Reference

| Command | Description |
| :--- | :--- |
| `npm test` | Runs the automated test suite in [`scripts/run_tests.js`](file:///C:/Users/xms/Documents/Projects/SpotySpice/scripts/run_tests.js) (291+ tests). |
| `npm run test:prompts` | Runs prompt steering and theme precision tests. |
| `npm run test:all` | Runs both `npm test` and `npm run test:prompts`. |
| `npm run lint` | Runs ESLint across all JavaScript and TypeScript files. |
| `npm run lint:fix` | Automatically fixes auto-fixable ESLint errors. |
| `npm run dev` | Runs Vite frontend (`:3000`) and Express backend (`:3001`) concurrently. |
| `npm run crawl` | Runs autonomous catalog crawler toward target goal (default: 500,000 tracks). |
| `npm run crawl:playlists` | Spider curated genre & historical playlists exclusively (`--playlists-only`). |
| `npm run crawl:top10k` | Streams and ingests Anna's Archive Spotify Top 10k songs (`popularity > 30`). |
| `npm run crawl:status` | Prints formatted catalog metrics (artists, tracks, samples, countries, languages, merges). |
| `npm run generate:themes` | Precomputes static crossword themes into `data/`. |

---

## 5. Crossword Generation & Gameplay Rules

### 5.1 Keyword Extraction & Clue Types
- **Single-Word Titles**: Used directly as answer (e.g. `BLINDING` -> `BLINDING`).
- **Multi-Word Titles**: Combined without spaces up to 14 characters (e.g. `DIE WITH A SMILE` -> `DIEWITHASMILE`).
- **Collaborations**: Collaborating artists (e.g. `ROSÉ & Bruno Mars`) are never concatenated into a single word; individual collaborator candidates (`ROSE`, `BRUNOMARS`) are extracted independently.
- **Single-Entity Ampersands**: Bands with ampersands (e.g. `Above & Beyond`, `Mumford & Sons`) expand `&` to `AND` (`ABOVEANDBEYOND`).
- **Clue Variety**: Crosswords balance clue types between **Song Title**, **Artist Name**, and **Keyword**. When an artist prompt is provided (e.g. "songs by Daft Punk"), the engine enforces 0% artist clues and 100% song title/keyword clues.

### 5.2 Grid Generation Engine
- Fast backtracking placement engine ([`server/services/crosswordGenerator.js`](file:///C:/Users/xms/Documents/Projects/SpotySpice/server/services/crosswordGenerator.js)).
- Words must intersect between 1 and 3 times with varied crossing density.
- Bounding box rows and columns are computed dynamically.

### 5.3 Live Multiplayer WebSocket Protocol
- Connected clients send and receive structured JSON messages over WebSocket:
  - `create_room`: Host creates a 4-letter room code (e.g. `BASS-21`).
  - `join_room`: Guest joins room by code.
  - `start_game`: Host starts synchronized countdown.
  - `coop_cell_update`: Synchronizes individual letter placements in co-op mode.
  - `race_progress_update`: Broadcasts completion percentage and score in race mode.

---

## 6. Pre-Commit Checklist for Agents

Before completing any task, creating a commit, or opening a PR:
1. [ ] **Run Linter**: `npm run lint` (ensure 0 errors, 0 warnings).
2. [ ] **Run Test Suite**: `npm test` (ensure all tests pass).
3. [ ] **Verify Git Status**: `git status` (ensure `catalog.sqlite*`, `.env`, and temporary files are NOT staged).
4. [ ] **Bump Version**: Bump `version` in `package.json` and `package-lock.json`.
5. [ ] **Update Documentation**: Add entry to `CHANGELOG.md` and update `README.md` if applicable.
6. [ ] **Branch & PR**: Ensure work is on a dedicated feature branch; push and create/update PR with clear summary.

---

## 7. Agent Skills (`.agents/skills/`)

Modular skills are provided in `.agents/skills/` to streamline specialized tasks:

| Skill | Location | Purpose |
| :--- | :--- | :--- |
| **`catalog-crawler`** | [`.agents/skills/catalog-crawler/SKILL.md`](file:///C:/Users/xms/Documents/Projects/SpotySpice/.agents/skills/catalog-crawler/SKILL.md) | Procedures for crawling, ingesting, backfilling, and maintaining the SQLite music catalog. |
| **`crossword-engine`** | [`.agents/skills/crossword-engine/SKILL.md`](file:///C:/Users/xms/Documents/Projects/SpotySpice/.agents/skills/crossword-engine/SKILL.md) | Guidelines for grid layout placement, keyword extraction, homonym prevention, and LLM judge rules. |
| **`release-discipline`** | [`.agents/skills/release-discipline/SKILL.md`](file:///C:/Users/xms/Documents/Projects/SpotySpice/.agents/skills/release-discipline/SKILL.md) | Step-by-step checklist for safe commits, version bumps, changelog/readme updates, and PR creation. |

