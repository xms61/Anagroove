# 🎵 SpotySpice

> **The Blind Audio Crossword Game** — Solve intersecting musical puzzles by listening to 30-second audio snippets without seeing track names or artists until victory!

---

## 🌟 Highlights & Features

- **🎧 Blind Hi-Fi Audio Snippets**: Select any clue to hear an instant 30-second preview. Artist names and song titles are strictly concealed until the crossword is solved.
- **📀 Floating Vinyl Turntable**: An authentic 33⅓ RPM vinyl record rotates beneath floating crossword letter tiles and responds dynamically to audio playback.
- **📚 220+ Pre-Generated Puzzles Across 11 Themes**:
  - 🎲 **Mixed All-Time Hits** (Cross-era iconic tracks)
  - 🎸 **Rock Classics** (Queen, Led Zeppelin, Pink Floyd, Nirvana, AC/DC)
  - ✨ **Pop Anthems** (Michael Jackson, Madonna, Taylor Swift, Bruno Mars)
  - 🎤 **Hip-Hop & Rap Titans** (Eminem, Drake, Kendrick Lamar, Snoop Dogg)
  - 🎧 **Electronic & Dance Floor** (Daft Punk, Avicii, Calvin Harris, David Guetta)
  - 📻 **80s & 90s Flashback** (ABBA, Prince, Wham!, Cyndi Lauper)
  - 🖤 **Pop-Punk & Alt Rock** (Blink-182, Green Day, Paramore, Fall Out Boy)
  - 🌸 **K-Pop & Asian Pop** (BTS, BLACKPINK, TWICE, NewJeans)
  - 🎬 **Anime, Soundtracks & Gaming** (Hans Zimmer, John Williams, Joe Hisaishi)
  - 🔥 **Latin & Reggaeton Hits** (Bad Bunny, Daddy Yankee, Shakira, J Balvin)
  - 🎷 **R&B, Soul & Motown** (Stevie Wonder, Aretha Franklin, Alicia Keys)
- **🗄️ Native SQLite Music Catalog & Multi-Provider Crawler**:
  - **High-Volume Local Catalog**: Built on Node.js 24 native `node:sqlite` (`DatabaseSync`) with WAL mode (`journal_mode = WAL`) and FTS5 full-text indexing, storing 100,000+ authentic tracks across 33,000+ artists for sub-millisecond puzzle generation.
  - **Multi-Vector Autonomous Harvester**: Recursively discovers tracks beyond charts through artist discography graph traversal (spanning 1950s–2020s rock, pop, hip-hop, electronic, jazz, K-Pop, anime, Latin) and high-frequency music lexicon vocabulary sweeping.
  - **100% Deterministic Cross-Referencing**: Merges multi-provider tracks across Deezer, Spotify, and Apple Music/iTunes deterministically via ISRC matching (Tier 1) and acoustic duration delta matching ($\le 3$s) with canonical title/artist normalization (Tier 2).
  - **Strict Authenticity Filter**: Screens out amateur covers, tributes, karaoke, soundalikes, lullaby/lo-fi remixes, and tracks lacking verified 30-second audio previews.
  - **Polite Token-Bucket Rate Limiting**: Built-in rate limiters honoring Deezer (5 req/s) and iTunes (15 req/min) constraints with exponential backoff on HTTP 429/503.
- **⚡ Pure & Steered Live Crossword Generator**:
  - **Pure Random Catalog Universe**: Synthesize unique, unplayed crosswords without popularity bias—from underground indies to global chart-toppers.
  - **Steered Prompt Generator**: Type natural prompts with complex constraints like *"anime from the years 2020-2026"*, *"90s grunge before 1994"*, *"k-pop after 2018"*, *"classic 70s rock ballads"*, or target specific artists (*"songs by Daft Punk"*, *"Queen"*).
  - **Temporal Range & Bound Parsing**: Automatically parses release windows (`from 2020 to 2026`, `between 1970 and 1976`), upper bounds (`before 1994`), lower bounds (`after 2018`), and single release years (`in 1999`), validating candidate tracks with release date verification.
  - **Catalog-First FTS5 Song Selection**: The local catalog is queried **first** using SQLite FTS5 full-text search on track titles, artist names, and albums — 10–100× faster than text scanning — enriched by genre JSON filtering and popularity-weighted random sampling. External APIs are used as enrichment sources, not the primary pool.
  - **Cultural Language Precision**: K-Pop prompts automatically constrain to Korean/English tracks, Japanese/City Pop prompts to Japanese/English, while all other themes default to English at the SQL level before API queries begin.
  - **Single-Artist Dedicated Puzzles**: For single-artist crosswords (*"songs by Daft Punk"*, *"Queen"*), clues asking for the artist name are strictly eliminated (0% Artist clues, 100% Song Title or Keyword clues), and multiple tracks by the artist are allowed across the puzzle.
  - **Popularity Spectrum**: Toggle between **Pure Random** (unfiltered), **Hidden Gems** (indie/underrated cuts), **Balanced** (hits & discoveries), and **Top Hits** (chart-toppers).
  - **Natural Song Title Answers (Up to 14 Characters)**: Crossword answers combine multi-word titles without spaces (e.g. `YOURLOVE`, `GETLUCKY`, `BLINDINGLIGHTS`), perfectly fitted to grid dimensions. Ampersands and plus signs expand to `AND` (e.g. `Rock & Roll` -> `ROCKANDROLL`).
  - **Collaborative Artist Separation & Single-Entity Band Preservation**: When tracks feature collaborations (e.g. `Ski Aggu & Sira`, `Drake & 21 Savage`), artists are never concatenated together like a title (`SKIAGGUSIRA`), but split into individual clue candidates (`Ski Aggu` or `Sira`). For unitary single-entity bands containing `&` (e.g. `Above & Beyond`, `Mumford & Sons`, `Simon & Garfunkel`), the ampersand is expanded to `AND` (`ABOVEANDBEYOND`, `MUMFORDANDSONS`).
  - **Multi-Crossing Variety Engine (1–3 Intersections Per Word)**: Crossword layouts dynamically interlock words so each word crosses other words between 1 and 3 times (with balanced distribution among 1, 2, and 3 crossings), completely eliminating solitary starburst/telephone-pole single spines.
  - **Dynamic Responsive Cell Geometry**: Crossword grid dynamically computes optimal cell dimensions and pixel grid tracks using `ResizeObserver`, preventing tile squishing or column overlap when rendering wide puzzles across desktop and mobile screens.
  - **Balanced Clue Variety**: Puzzles offer an engaging mix of **Song Title**, **Artist Name**, and **Title Keyword** questions rather than being dominated by a single clue type.
  - **Language Precision & Regional Storefronts**: Strict English language enforcement across general categories, with automatic regional storefront steering for international prompts (Japan, South Korea, France, Germany, Brazil, Jamaica, Nigeria, UK, US).
  - **Thematic Homonym & Semantic Guardrails**: Rejects Western artist collisions matching nationality adjectives (e.g. *The Japanese House*, *French Montana*, *German Brigante*) and filters prefix stem collisions across themes (e.g. *Animal Collective*, *Animosity*, and *Os Abelhudos* for anime; *The Game* for gaming; *Daft Punk* for pop-punk; *Dance Gavin Dance* for EDM; *Latin Quarter* for Latin). Specifically blocks Deezer Artist ID `147485` (Italian hardcore DJ *AniMe* / *Anime*) and her hardcore collaborator network (*Broken Minds*, *Masters of Hardcore*) from Japanese anime puzzles.
  - **Universal Remaster & Reissue Vintage Parser**: Detects original recording stamps (e.g. `(YYYY Remaster)`, `(Remastered YYYY)`, `(Live YYYY)`) to prevent legacy re-releases from falsely qualifying as contemporary releases for temporal prompts (`2020-2026`).
  - **Multi-Endpoint Provider Discovery**: Concurrent harvesting across Deezer advanced queries and iTunes Search API for 100% preview availability and rich catalog depth with distinct provider badges (Apple Music, Deezer, Spotify).
  - **Deterministic Seed Sharing**: Share exact puzzle seeds (e.g. `party-game-42`) with friends using deterministic SHA-256 hash ranking without server bloat.
  - **Anti-Repetition & Variety Sampling**: Tiered play-frequency sampling guarantees $\le 3$ repetitions per song across 50 consecutive crosswords, enforces max 1 track per artist, and respects player history and blacklists.
- **👥 Real-Time Multiplayer Lounge**:
  - **Co-Op Mode**: Two or more players solve the identical puzzle in real time with live keystroke synchronization.
  - **Versus Race Mode**: Race to complete the puzzle first with live real-time progress bars.
  - **Zero-Account Guarantee**: Player isolation works seamlessly using anonymous, tab-isolated session tokens with no registration required.
- **☁️ Anonymous Server Persistence**:
  - Grid letter entries, check validities, completed puzzle histories, and blacklists are persisted server-side via unique anonymous tokens.
- **🚫 Crate Blacklist**:
  - Block specific artists or tracks from ever appearing in your crosswords.
- **💡 Multi-Tier Hint System & Hotkeys**:
  - **Interactive Hotkeys**: Press <kbd>Space</kbd> to instantly reveal and validate the letter at the active cursor cell, press <kbd>Tab</kbd> to solve and complete the entire active word, or press <kbd>Shift + Tab</kbd> to solve and reveal the whole puzzle.
  - **Modal Assistance**: Visual hints modal offering single letter reveal, active word reveal, or whole puzzle reveal with live co-op multiplayer synchronization.
- **⚙️ Lounge Settings Screen & Playback Customization**:
  - Direct settings modal accessible from both the toolbar gear button and slide-over menu.
  - Optional toggle for word-correct spring bounce celebrations (`enableWordAnimations`).
  - Master default volume slider (comfortably set to 15% by default) with local storage persistence.
- **🎧 Audio Sample Scrubber & Preamp Deck**:
  - Full playback control with an interactive click-to-seek progress bar, timestamp displays (`0:14 / 0:30`), `-5s` / `+5s` quick skipping, and dual animated VU meters.
- **🧩 Dense Interlocking Layout Engine & Varied Answer Lengths**:
  - Multi-crossing layout optimization creates compact, tightly woven puzzles maximizing interlocking letters.
  - Dynamic answer lengths (2 to 14 letters) with rotating short (3–5), medium (6–8), and long (9–14) answer buckets.
- **🎯 Zero-Spoiler Clue Discipline & 0% Artist Anime Clues**:
  - Clue generation guarantees 0 answer leaks (`containsAnswerLeak`).
  - For anime crosswords, clues enforce **0% Artist name clues** and **100% Song title or Keyword clues** (e.g. `ED1 of "Jigoku Shoujo Futakomori" by Mamiko Noto (2006)` for song title `AIDA`). The performer is credited cleanly for context, avoiding obscure seiyuu name puzzles.
- **✨ Targeted Keyphrase Deduplication & Solution Blacklisting**:
  - Prompts targeting specific franchises or artists (e.g. `anime gundam`, `country songs by dolly parton`) permit multiple tracks without deduplication rejection.
  - The target keyphrase tokens (e.g. `GUNDAM`, `DOLLY`, `PARTON`) are blacklisted from grid answers in `seenAnswers` so players are never asked to solve the prompt itself.
- **🎨 Anime Victory Screen Artwork & AniList GraphQL Integration**:
  - Dynamic JIT cover art resolution via AniList GraphQL batch queries (`https://graphql.anilist.co`), cached directly in SQLite `anime_tracks.image_url`.
  - Offline-safe victory modal featuring theme badges (`OP1`, `ED1`), full artist credits, and stylized card fallbacks.
  - Dedicated CLI backfill utility: `npm run anime:images`.
- **🎬 Dedicated Anime OP/ED Sourcing & Local Multi-Sample Pipeline**:
  - Independent SQLite engine isolating authentic anime openings (OP) and endings (ED) from general-music catalog collisions.
  - Slices high-fidelity 20s preview segments across multiple song timestamps (e.g. 5s, 35s, 65s offsets) via headless FFmpeg for varied playback rotation.
  - Zero external API downtime: Serves instant local static streaming via `/audio/anime/...`.
- **🛡️ SQLite Database Health, Integrity & Sanitization Engine**:
  - Automated relational and structural audits (`PRAGMA integrity_check`, foreign key validation, soft-duplicate cluster merging, contamination purging).
  - Generates comprehensive markdown audit reports (`reports/database_validation_report.md`) detailing 500k+ canonical tracks and 99.36% verified sample coverage.
  - Staggered spring bounce celebration animation when a typed word matches correctly (with toggle switch in settings).
  - Generation era parsing for K-Pop (*"new gen kpop"*, *"4th gen"*, *"3rd gen"*) and authentic soundalike/workout remix filtration.
- **🎵 Seamless Word Field Audio Integration**:
  - Clicking any word field, cell, or clue instantly triggers audio playback for that track, automatically restarting playback even if the preview had finished or was previously paused.
- **🎯 Non-Destructive Hint System & Dedicated Shortcut Field**:
  - Revealing letters or words via hints now validates only the revealed cells without prematurely checking or revealing uninspected cells on the board.
  - Hint modal separates keyboard shortcuts into a clear, unified dedicated cheat-sheet card (`Space` for Letter, `Tab` for Word, `Shift + Tab` for Puzzle).
- **🔄 Input-Preserving Puzzle Progression**:
  - Clicking "Next Puzzle" automatically generates a fresh puzzle retaining the exact current custom prompt, preset theme, target word count, and popularity tier, with a real-time loading spinner on the button.
- **🛡️ Cross-Session Anti-Repetition Memory & Artist Throttling**:
  - Persists recent song IDs and normalized artist keys across sessions in `localStorage`, throttling recently heard performers and deep-offsetting catalog search queries (0–175) to prevent repetitive tracks.
- **🏆 Unclipped Victory Showcase & Auto-Silence**:
  - Confetti celebration, full song breakdown with album cover artwork, track titles, full non-clipped multi-line artist names, and direct preview playback.
  - Automatically cuts off background preview music the moment the puzzle is solved or fully revealed (via hint modal or `Shift+Tab`).

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, TailwindCSS, Lucide React, Canvas Confetti |
| **Backend** | Node.js, Express, WebSocket (`ws`), Native HTTP Fetch |
| **Database** | SQLite via Node 24 `node:sqlite`: music catalog, anime catalog, user store |
| **Accessibility** | Shared dialog shell (focus trap, Esc, labelled), WCAG AA text contrast, self-hosted fonts |
| **Testing** | `node:test` + c8 (server/shared), Vitest + React Testing Library (frontend), Playwright smoke test on an offline fixture catalog |
| **Audio Engine** | Deezer API & iTunes preview resolver with dynamic fallback self-healing |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (`v20+` or `v24` recommended)
- **npm**: v9.0.0 or higher

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/yourusername/SpotySpice.git
cd SpotySpice
npm install
```

### 3. Environment Configuration (Optional)
SpotySpice needs no API keys. All settings are optional overrides:
```bash
cp .env.example .env
# PORT, VITE_PORT, CORS_ALLOWED_ORIGINS, SPOTYSPICE_DATA_DIR, LOG_LEVEL
```
*Note: Never commit your `.env` file.*

### 4. Running in Development
Start both the Express/WebSocket backend and the Vite frontend dev server concurrently:
```bash
npm run dev
```

- **Frontend Client**: [http://localhost:3000](http://localhost:3000)
- **Backend API & WebSockets**: [http://localhost:3001](http://localhost:3001)

You can also run them independently:
```bash
npm run dev:client # Starts Vite only on port 3000
npm run dev:server # Starts Node.js backend on port 3001
```

### 5. Building for Production
```bash
npm run build
```
Production assets are output to the `dist/` directory.

### 6. Creating & Populating the SQLite Music Catalog
The SQLite database file (`server/data/catalog.sqlite`) is excluded from Git tracking via `.gitignore` to keep the repository lightweight and avoid storing binary blobs. When cloning the repository fresh, you can initialize and populate your local database in seconds:

#### Automatic Initialization
SpotySpice uses Node.js 24's native `node:sqlite` (`DatabaseSync`) with WAL mode (`journal_mode = WAL`) and FTS5 full-text indexing. The schema (`artists`, `tracks`, `track_samples`, `track_providers`, `crawl_queue`, `tracks_fts`) and indexes are created automatically the first time the catalog is accessed.

#### Populating the Catalog
Run the autonomous crawler to harvest canonical tracks, authentic metadata, and verified 30-second playable audio previews:

```bash
# 1. Inspect the current database status (shows 0 tracks if new)
npm run crawl:status

# 2. Quick seed: Ingest 5,000 canonical tracks (~30 seconds)
node scripts/crawl_catalog.js --target=5000

# 3. Standard catalog: Ingest 25,000 canonical tracks (~2 minutes)
node scripts/crawl_catalog.js --target=25000

# 4. Massive 100k-500k catalog: Ingest hundreds of thousands of tracks
npm run crawl
# or with explicit CLI target:
node scripts/crawl_catalog.js --target=500000

# 5. Playlists-only crawl: Harvest curated genre & historical playlists exclusively
npm run crawl:playlists

# 6. Prepare and fetch dataset files (Anna's Top 10k & directories setup)
npm run fetch:datasets

# 7. Ingest Anna's Archive Spotify Top 10k: Harvest top Spotify songs (popularity > 30)
npm run crawl:top10k

# 8. Ingest MusicMoveArr Datasets (Scenario C + Lazy JIT Preview Hydration)
# Stream-ingest bulk base CSV dumps or incremental SQL diffs (popularity > 30):
npm run ingest:dataset -- --csv-file=./data/deezer_tracks.csv --provider=deezer
# or stream compressed incremental diffs:
npm run ingest:dataset -- --sql-file=./data/changes_2026_03.sql.gz --provider=deezer
# or batch-ingest an entire directory of base tables:
npm run ingest:dataset -- --base-dir=./data/base_tables/ --min-popularity=31

# 9. Fill in missing metadata (release years by album, ISRC/rank by track, artist fans & genres, strict iTunes links)
#    Resumable: rerun to continue. Also recomputes artist/track languages.
npm run catalog:enrich
# or one step with a limit:
npm run catalog:enrich -- --albums=5000

# 10. Inspect database status (including country codes & detected languages)
npm run crawl:status
```

#### MusicMoveArr Ingestion & Lazy JIT Preview Hydration
SpotySpice features a hybrid high-performance music ingestion architecture:
- **Scenario C Ingestion**: Stream-ingest millions of tracks from the [MusicMoveArr Datasets](https://github.com/MusicMoveArr/Datasets) (Deezer, Spotify, Tidal, MusicBrainz base dumps and compressed incremental diffs) with zero RAM bloat.
- **Popularity & Authenticity Filtering**: Ingests high-quality music filtered strictly by `popularity > 30` (or configurable `--min-popularity=31`) and `isAuthenticCandidate`, preventing amateur covers, karaoke, and noise from polluting the database.
- **Stable Preview Links**: Deezer preview URLs are signed and expire within minutes, so puzzles never embed them. Each clue carries a stable `/api/preview/<provider>:<id>` path (`deezer`, `itunes`, or `catalog`). When a clue is played, the **Preview Resolver** (`server/services/previewResolver.js`) redirects (302) to a freshly minted URL: the Deezer track API first, then Deezer search, then iTunes. Resolved URLs are cached in memory until shortly before they expire.

#### Crawler & Ingestion Flags
| Flag | Default | Description |
| :--- | :--- | :--- |
| `--target=<n>` | `500000` | Stops crawling as soon as the total canonical track count in SQLite reaches `<n>`. |
| `--playlists-only` | `false` | Spider curated playlists exclusively (skips decades, artists, and lexicon vectors). |
| `--playlists=<n>` | `100` | Maximum number of curated genre & historical playlists to spider (Vector 1). Set to `0` to skip. |
| `--decades=<n>` | `105` | Maximum decade × genre queries to spider (Vector 2). Set to `0` to skip. |
| `--artists=<n>` | `250` | Maximum foundation artists to spider discographies and related artist graphs for (Vector 3). |
| `--lexicon=<n>` | `1500` | Maximum high-frequency vocabulary keywords to sweep across paginated offsets (Vector 4). |
| `--min-popularity=<n>` | `31` | Minimum track popularity score for Spotify/MusicMoveArr ingestion (`popularity > 30`). |
| `--csv-file=<path>` | `null` | Path to CSV/TSV table file for MusicMoveArr streaming ingestion. |
| `--sql-file=<path>` | `null` | Path to plain `.sql` or compressed `.sql.gz` incremental diff file. |
| `--base-dir=<dir>` | `null` | Directory containing base CSV/TSV tables to ingest sequentially. |
| `--incremental-dir=<dir>` | `null` | Directory containing incremental `.sql.gz` diffs. |
| `--dry-run` | `false` | Parse and evaluate candidates without writing to SQLite. |
| `--status` | `false` | Displays formatted counts of unique artists, canonical tracks, audio samples, country codes, languages, and cross-referenced merges without crawling. |

#### Schema Migrations
The catalog schema is versioned (`PRAGMA user_version`). Pending migrations run automatically the first time the catalog is used, or explicitly:
```bash
# Apply pending migrations (writes a VACUUM INTO backup next to catalog.sqlite first)
npm run db:migrate
```
Migrating an existing ~500k-track catalog to v2 takes about 20 s and grows the file by the trigram search index (~140 MB).

#### Database Validation & Cleanup
The cleanup brings existing rows under the admission policy: English/Japanese/Korean only, original recordings only, one row per song and artist, authentic music, and clean text. See `server/db/CATALOG_DB.md`.
```bash
# Diagnostics, an exact cleanup dry run (rolled back), and the validation gate; writes reports/database_validation_report.md
npm run db:validate

# Back up (VACUUM INTO), apply the cleanup, then ANALYZE + VACUUM. About 1 minute on a 500k-track catalog
npm run db:sanitize

# CI gate: exits 1 on duplicates, other languages, non-original versions, orphans, or coverage under 95%
npm run db:validate -- --ci
```

#### Dedicated Anime Catalog & Preview Pipeline
Manage isolated anime OP/ED themes, metadata syncing, and FFmpeg multi-sample extraction:
```bash
# Synchronize canonical anime opening/ending themes
npm run anime:sync

# Generate 20-second audio clips via headless FFmpeg
npm run anime:samples

# Ingest themes into isolated SQLite anime catalog
npm run anime:ingest
```

#### Admission Policy, Deduplication & Integrity
- **English, Japanese & Korean only**: Every write goes through `upsertTrack`, which rejects any other language. Language comes from the script (hangul, kana, Han with a JP/KR ISRC), an artist-level vote over the artist's whole catalog and ISRC registrants, and the ELD n-gram detector for Latin titles. English titles like "Die With A Smile" stay English, and romanized songs by Japanese or Korean artists count as ja/ko.
- **Crawl sources**: Apple Music charts (US, UK, Japan, Korea) matched to Deezer, curated playlists, and artist discographies. Artists whose catalog is in another language are skipped before any album requests.
- **Original recordings only**: Live, remix, edit, extended, acoustic, instrumental, demo, re-recorded, sped-up, cover, and language versions are rejected. A remaster counts as the original recording.
- **Authenticity Filtering**: One shared rulebook (`server/policy/authenticityRules.js`) for crawler, catalog, and song selection rejects covers, karaoke, soundalikes, utility audio, and audiobooks/radio plays. Tracks shorter than 45 s or longer than 20 min are rejected too.
- **One popularity scale**: `popularity` is a 0–100 score (Spotify popularity, or the Deezer rank mapped onto it). The raw `deezer_rank` and `spotify_popularity` are kept alongside.
- **Master Deduplication**: Tracks merge across Deezer, Spotify, and Apple Music by ISRC (Tier 1), or by artist plus a Unicode-aware base title with credits and version tags stripped (Tier 2). One row per song, whatever the release.
- **Full-text search**: A trigram FTS5 index (kept in sync by triggers) gives fast substring search, including for kana, hangul, and kanji.
- **WAL Journal Compaction**: The crawler folds runtime journals into `catalog.sqlite` via `PRAGMA wal_checkpoint(TRUNCATE)` to keep the database file compact.

---

## 📁 Project Structure

```
SpotySpice/
├── AGENTS.md                   # Map of agent docs (one per area, colocated below)
├── .github/                    # CI + manual release workflows, RELEASE_PROCESS.md
├── data/                       # most_streamed_artists.csv + gitignored dataset dumps
├── scripts/                    # Crawl, ingest, anime, validation & eval CLIs (SCRIPTS_CLI.md)
│   └── tests/                  # node:test suites, fixture catalog, Playwright smoke test (TESTING.md)
├── server/                     # Node.js 24 backend (API_SECURITY.md, MULTIPLAYER_WS.md)
│   ├── crawler/                # Harvester, authenticity filter, rate limiter (CRAWLER.md)
│   ├── data/                   # Runtime data (gitignored): catalog.sqlite, anime_catalog.sqlite, users.sqlite
│   ├── db/                     # sqliteCatalog, animeCatalog, userStore, cleanup & gate (CATALOG_DB.md)
│   ├── middleware/             # Rate limiter
│   ├── http/                   # Security middleware, live puzzle store
│   ├── policy/                 # Authenticity & selection policy
│   ├── routes/                 # REST routes (music, user state)
│   ├── selection/              # Song pool, catalog sampler, picker (TRACK_SELECTION.md)
│   ├── services/               # Providers, preview resolver, query planner, crossword judge
│   ├── ws/                     # Multiplayer rooms
│   ├── db.js                   # User store (SQLite, lazy)
│   ├── paths.js                # DATA_DIR (override with SPOTYSPICE_DATA_DIR)
│   ├── server.js               # App composition (middleware, routes, WS)
│   └── validators.js           # Endpoint & WebSocket payload validators
├── shared/                     # Identity keys, answer/clue extraction, grid engine (CROSSWORD_ENGINE.md)
└── src/                        # React 19 frontend (FRONTEND_UI.md)
    ├── components/             # Grid, clues, audio deck, drawer & modals
    ├── hooks/                  # useCrosswordGame, useBlacklist
    ├── services/               # apiClient, socketService, dynamicMusicService
    └── types/                  # Puzzle types
```

---

## 🎮 How to Play

1. **Select a Clue**: Click any clue in the sidebar or click any cell on the grid.
2. **Listen to the Track**: The floating player deck plays a 30-second blind snippet.
3. **Type Your Answer**:
   - Type `A-Z` to enter letters.
   - Use `Backspace` to delete.
   - Use `Arrow Keys` to navigate between cells.
   - Press `Space` or click again to toggle direction (Across $\leftrightarrow$ Down).
4. **Use Hints if Stuck**: Click **Hint** to solve the selected letter, solve the entire word, or reveal the crossword.
5. **Check Answers**: Click **Check** to test cell validity (correct letters turn green, incorrect turn red).
6. **Victory**: When all letters are filled correctly, celebrate with confetti and view the full tracklist with album art and audio replays!

---

## 👥 Multiplayer Protocol (WebSockets)

SpotySpice uses a lightweight JSON WebSocket protocol on `/ws`:

| Action | Sent Payload | Description |
| :--- | :--- | :--- |
| `create_room` | `{ playerId, playerName, mode, livePuzzleToken }` | Creates a room for a server-generated puzzle with a code like `VINYL-4821`. The reply includes a private `resumeToken`. |
| `join_room` | `{ roomCode, playerId, playerName, resumeToken? }` | Joins a lobby. With the `resumeToken`, it reclaims your seat after a dropped connection (held for 30 s). |
| `start_game` | `{ roomCode }` | Host only (the sender's socket must hold the host seat). Broadcasts the puzzle to all players. |
| `coop_cell_update` | `{ roomCode, row, col, char }` | Co-op rooms only. Broadcasts a typed character to teammates in real time. |
| `race_progress_update` | `{ roomCode, progress }` | Updates opponent progress bars in Versus mode. |
| `puzzle_solved` | `{ roomCode }` | Announces the sender as the winner. |

The server binds each player to its socket on create/join and ignores any `playerId` in later messages. Room actions from sockets that haven't joined are rejected.

---

## 🧪 Testing & Code Quality

Run automated CI-friendly test suites and linters (details in [scripts/tests/TESTING.md](scripts/tests/TESTING.md)):

```bash
# Server & shared tests on node:test (parallel, isolated temp data dirs; never touches server/data)
npm test

# Same with c8 coverage thresholds for server/db, server/policy and shared
npm run test:coverage

# Frontend hook tests (Vitest + React Testing Library)
npm run test:web

# Playwright smoke test: offline fixture catalog, generate -> type -> solve (build first)
npm run build && npm run test:e2e

# Run the live multi-prompt crossword verification suite (14 diverse genres, eras, temporal windows & single-artist puzzles)
npm run test:prompts

# Run all test suites combined (server + frontend + multi-prompt verification)
npm run test:all

# Run ESLint across TypeScript, server, scripts, and shared modules
npm run lint

# Run the CI checks locally (lint, typecheck, coverage, frontend tests, fixture DB gate)
npm run test:ci

# Format codebase with Prettier
npm run format

# Manual two-player live sync check (needs `npm run dev:server` on :3001)
node scripts/test_multiplayer_live_sync.js
```

---

## 🚀 Manual CI/CD Release Workflow

SpotySpice provides a manual GitHub Actions release pipeline (`.github/workflows/manual-release.yml`) triggered on-demand via **Workflow Dispatch**:

1. **Validation**: Executes `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:web`. Optionally runs the live 10-genre prompt evaluation suite when `run_prompt_suite` is enabled.
2. **Containerization**: Sets up Docker Buildx and builds a production-optimized container (`spotyspice:<tag>`).
3. **Automated Tagging**: Creates and pushes the semantic version git tag (e.g. `v1.3.0` or custom).
4. **Release Notes & Publishing**: Automatically extracts version-specific notes from `CHANGELOG.md` and publishes the GitHub Release.

To run it:
- Navigate to **Actions** $\rightarrow$ **Manual Test, Lint, Build & Release** on GitHub.
- Click **Run workflow**, optionally specify a version tag (or leave blank to use `package.json`), toggle pre-release / prompt suite, and launch.

---

## 📊 Extended Server Logging & Diagnostics

SpotySpice features a structured, high-visibility server logging system (`server/logger.js`) providing detailed telemetry into music harvesting, candidate sampling, and multiplayer rooms:

| Category | Description | Example Log Output |
| :--- | :--- | :--- |
| `[STARTUP]` | Server initialization & port status | `🎵 SpotySpice Backend API & WebSocket running on port 3001 [env: development, log: info]` |
| `[API]` | HTTP request method, path, status, latency | `[API] GET /api/puzzles/live -> 200 (154ms) (user: user_123)` |
| `[HARVEST]` | External provider harvesting metrics | `Aggregator returned 40 candidate tracks in 180ms` |
| `[SAMPLING]` | Candidate evaluation & rejection telemetry | `Evaluated 40 tracks -> 10 accepted (4 Title, 4 Artist, 2 Keyword) \| Filtered: 8 language, 6 duplicateArtist, 4 duplicateTitle` |
| `[CROSSWORD]` | Layout generation duration & grid dimensions | `Layout generated for "⚡ Live: Synth-pop": 10/10 words placed across 18x18 in 42ms` |
| `[STORE]` | Token generation, consumption, and eviction | `Token created: 7f3b8a1c... (active: 3)` |
| `[WS]` / `[ROOM]` | Multiplayer room creation, join, & disconnects | `Room created: VINYL-42 [mode: coop, host: Alex]` |

### Log Level Configuration

Configure log verbosity via the `LOG_LEVEL` environment variable:

```bash
# Available levels: debug, info (default), warn, error, none
LOG_LEVEL=debug npm run dev:server
```

---

## 🎯 Universal Multi-Query Harvesting & Repetition Cap

SpotySpice features a universal, prompt-agnostic music harvesting and sampling engine designed to discover diverse tracks without static seed lists while enforcing strict replay bounds:

1. **Dynamic Theme Variations (`queryBuilder.js`)**: Automatically expands any user prompt into compound, de-spaced (`citypop`, `synthwave`), and decade-specific search variations while preserving cultural prefixes (e.g. `Japanese`, `French`, `Korean`).
2. **Catalog-First Weighted Sampling (`server/selection/`)**: Draws a random window of up to 400 theme-matched tracks from the local catalog in milliseconds, weighted by popularity (uniform for "obscure", squared for "mainstream"). Deezer and iTunes are only asked when the catalog is thin, and what they return is added to the catalog.
3. **Multi-Pass Tiered Frequency Sampling**:
   - **Tier 0 (Unplayed)**: Fresh tracks are always prioritized first.
   - **Tier 1, 2, 3+ (Played before)**: Filled in that order, only when fresh tracks can't fill the puzzle.
4. **Verified Performance**: In a 50-crossword live simulation with rolling session tracking, the engine achieved **99.5% uniqueness** (420 unique songs across 422 clues) with a maximum repetition of only **2x** per song across the entire 50-game run.

---

## 🐳 Docker Deployment

SpotySpice includes a production-ready, multi-stage Alpine Docker configuration. The image builds the React client and runs the Express backend + WebSockets server seamlessly on a single port (`3000` by default).

### Quickstart with Docker Compose

```bash
docker compose up -d
```
The game will be live at `http://localhost:3000`. User progress and the SQLite catalogs live in the Docker volume (`spotyspice_data`, mounted at `/app/server/data`). The image never contains `catalog.sqlite`, `users.sqlite` or `store.json` (see `.dockerignore`). Copy a catalog into the volume, or crawl inside the container, to populate it.

### Manual Build & Run

1. **Build the image**:
   ```bash
   docker build -t spotyspice .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     -p 3000:3000 \
     --name spotyspice \
     -v spotyspice_data:/app/server/data \
     spotyspice
   ```

3. **Deploy to any Cloud / VPS** (Render, Railway, Fly.io, Google Cloud Run, AWS ECS, DigitalOcean):
   - Simply connect your GitHub repository.
   - Set the port to `3000` (or leave as default, the server respects `$PORT`).
   - The container automatically serves the frontend, REST APIs, and WebSockets through the single exposed port.

---

## 📄 License

MIT License. Free for personal and educational use.

