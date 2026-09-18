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
- **⚡ Pure & Steered Live Crossword Generator**:
  - **Pure Random Catalog Universe**: Synthesize unique, unplayed crosswords without popularity bias—from underground indies to global chart-toppers.
  - **Steered Prompt Generator**: Type natural prompts with complex constraints like *"anime from the years 2020-2026"*, *"90s grunge before 1994"*, *"k-pop after 2018"*, *"classic 70s rock ballads"*, or target specific artists (*"songs by Daft Punk"*, *"Queen"*).
  - **Temporal Range & Bound Parsing**: Automatically parses release windows (`from 2020 to 2026`, `between 1970 and 1976`), upper bounds (`before 1994`), lower bounds (`after 2018`), and single release years (`in 1999`), validating candidate tracks with release date verification.
  - **Single-Artist Dedicated Puzzles**: For single-artist crosswords (*"songs by Daft Punk"*, *"Queen"*), clues asking for the artist name are strictly eliminated (0% Artist clues, 100% Song Title or Keyword clues), and multiple tracks by the artist are allowed across the puzzle.
  - **Popularity Spectrum**: Toggle between **Pure Random** (unfiltered), **Hidden Gems** (indie/underrated cuts), **Balanced** (hits & discoveries), and **Top Hits** (chart-toppers).
  - **Natural Song Title Answers (Up to 14 Characters)**: Crossword answers combine multi-word titles without spaces (e.g. `YOURLOVE`, `GETLUCKY`, `BLINDINGLIGHTS`), perfectly fitted to grid dimensions.
  - **Balanced Clue Variety**: Puzzles offer an engaging mix of **Song Title**, **Artist Name**, and **Title Keyword** questions rather than being dominated by a single clue type.
  - **Language Precision & Regional Storefronts**: Strict English language enforcement across general categories, with automatic regional storefront steering for international prompts (Japan, South Korea, France, Germany, Brazil, Jamaica, Nigeria, UK, US).
  - **Thematic Homonym & Semantic Guardrails**: Rejects Western artist collisions matching nationality adjectives (e.g. *The Japanese House*, *French Montana*, *German Brigante*) and filters prefix stem collisions across themes (e.g. *Animal Collective*, *Animosity*, and *Os Abelhudos* for anime; *The Game* for gaming; *Daft Punk* for pop-punk; *Dance Gavin Dance* for EDM; *Latin Quarter* for Latin).
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
  - **Interactive Hotkeys**: Press <kbd>Space</kbd> to instantly reveal and validate the letter at the active cursor cell and advance, or press <kbd>Tab</kbd> to solve and complete the entire active word and advance to the next clue.
  - **Modal Assistance**: Visual hints modal offering single letter reveal, active word reveal, or whole puzzle reveal with live co-op multiplayer synchronization.
- **🏆 Victory Showcase**:
  - Confetti celebration, full song breakdown with album cover artwork, track titles, artist details, and direct preview playback.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, TailwindCSS, Lucide React, Canvas Confetti |
| **Backend** | Node.js, Express, WebSocket (`ws`), Native HTTP Fetch |
| **Database** | Lightweight file-backed JSON database (`server/db.js`) |
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

### 3. Running in Development
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

### 4. Building for Production
```bash
npm run build
```
Production assets are output to the `dist/` directory.

---

## 📁 Project Structure

```
SpotySpice/
├── data/                       # Master music pools & metadata
│   ├── master_song_pool.json
│   └── music_pool.json
├── scripts/                    # Generation, test & verification scripts
│   ├── build_recognized_artists.js
│   ├── fetch_all_previews.js
│   ├── generate_all_themes.js
│   ├── test_features.js        # Core API & persistence tests
│   ├── test_multiplayer_live_sync.js # E2E two-player live sync test
│   └── test_randomizer.js      # Recognizable pool entropy test
├── server/                     # Express & WebSocket backend
│   ├── data/
│   │   ├── recognized_artists.json # 105+ iconic artists with >= 250k fans
│   │   ├── store.json              # Anonymous user session store
│   │   └── tracks_cache.json       # Cached preview URLs & track rank
│   ├── db.js                   # JSON persistence helper
│   ├── server.js               # REST endpoints & WebSocket room manager
│   ├── validators.js           # Endpoint and WebSocket payload validators
│   └── services/
│       ├── deezerMusicProvider.js # Deezer candidate harvesting & catalog taxonomy
│       ├── itunesMusicProvider.js # iTunes candidate harvesting & fallback previews
│       ├── musicService.js     # Unified random pool, variety & seed selection
│       └── queryBuilder.js     # Prompt parser & multi-endpoint query planner
├── shared/                     # Cross-environment shared logic
│   ├── liveCrossword.js        # On-the-fly crossword grid layout algorithm
│   ├── musicIdentity.js        # Identity keys, diacritic folding & blacklist matching
│   ├── musicKeywords.js        # Combined song title & answer keyword extractor (<= 16 chars)
│   └── shuffle.js              # Fisher-Yates shuffle
├── src/                        # React 19 Frontend
│   ├── components/
│   │   ├── AudioPlayerBar.tsx  # Floating Hi-Fi console audio deck
│   │   ├── BlacklistModal.tsx  # Blacklist management dialog
│   │   ├── ClueList.tsx        # Across & Down clues with jewel-toned badges
│   │   ├── CrosswordGrid.tsx   # Floating physical letter tiles over rotating vinyl
│   │   ├── EndScreenModal.tsx  # Victory screen & track showcase
│   │   ├── HintModal.tsx       # 3-tier hint options
│   │   ├── LiveGeneratorModal.tsx # On-the-fly randomizer UI
│   │   ├── LoungeDrawer.tsx    # Unified slide-over menu
│   │   ├── MultiplayerModal.tsx # Room creation & code entry
│   │   └── PuzzlePickerModal.tsx# 20-puzzle catalog browser
│   ├── hooks/
│   │   ├── useBlacklist.ts     # Client & server blacklist synchronization
│   │   └── useCrosswordGame.ts # Game state, keyboard navigation & co-op sync
│   ├── services/
│   │   ├── apiClient.ts        # REST client with X-User-Id header support
│   │   └── socketService.ts    # WebSocket client with reconnection logic
│   ├── types/
│   │   └── crossword.ts        # TypeScript interfaces for puzzles, clues, themes
│   ├── utils/
│   │   ├── audioResolver.ts    # Self-healing audio fallback resolver
│   │   └── liveGenerator.ts    # On-the-fly crossword grid layout algorithm
│   ├── App.tsx                 # Main application container
│   ├── index.css               # Tailwind & custom vinyl animations
│   └── main.tsx                # React root mount
├── tailwind.config.js          # Custom theme tokens
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite server & proxy configuration
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
| `create_room` | `{ playerId, playerName, mode, puzzle }` | Creates a new room with a random 6-character code (e.g., `VINYL-89`). |
| `join_room` | `{ roomCode, playerId, playerName }` | Joins an existing lobby. |
| `start_game` | `{ roomCode, playerId, puzzle }` | Host triggers game start; resets grids and broadcasts puzzle to all players. |
| `coop_cell_update` | `{ roomCode, row, col, char, playerId }` | Broadcasts typed character to teammates in real time. |
| `race_progress_update` | `{ roomCode, progress, playerId }` | Updates opponent percentage progress bars in Versus mode. |

---

## 🧪 Testing & Code Quality

Run automated CI-friendly test suites and linters:

```bash
# Run the complete automated test suite (155 unit & integration tests)
npm test

# Run the live multi-prompt crossword verification suite (14 diverse genres, eras, temporal windows & single-artist puzzles)
npm run test:prompts

# Run all test suites combined (unit/integration + multi-prompt verification)
npm run test:all

# Run ESLint across TypeScript, server, scripts, and shared modules
npm run lint

# Run full CI pipeline validation (Lint + Unit/Integration Tests)
npm run test:ci

# Format codebase with Prettier
npm run format

# Standalone deep-dive test scripts
node scripts/test_multiplayer_live_sync.js
node scripts/test_features.js
npx tsx scripts/test_randomizer.js
```

---

## 🚀 Manual CI/CD Release Workflow

SpotySpice provides a manual GitHub Actions release pipeline (`.github/workflows/manual-release.yml`) triggered on-demand via **Workflow Dispatch**:

1. **Validation**: Executes `npm run lint` and all 130 tests via `npm test`. Optionally runs the live 10-genre prompt evaluation suite when `run_prompt_suite` is enabled.
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
| `[STARTUP]` | Server initialization & port status | `🎵 SpotySpice Backend API & WebSocket running on port 3011 [env: development, log: info]` |
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
2. **Deep Parallel Ingestion (`musicService.js`)**: Queries both Deezer and iTunes with high candidate caps (up to 250 on Deezer, 4 parallel searches of 100 on iTunes), generating deep candidate pools of 400+ tracks per theme.
3. **Multi-Pass Tiered Frequency Sampling**:
   - **Tier 0 (Unplayed)**: Fresh tracks are always prioritized first.
   - **Tier 1 & 2 (Played 1-2x)**: Only tapped once the fresh catalog is completely exhausted.
   - **Strict Cap ($\le 3$ plays)**: Tracks with 3 or more previous plays are barred from repeat entry across games.
4. **Verified Performance**: In a 50-crossword live simulation with rolling session tracking (`evaluate_city_pop_variance.js`), the engine achieved **99.5% uniqueness** (420 unique songs across 422 clues) with a maximum repetition of only **2x** per song across the entire 50-game run.

---

## 🐳 Docker Deployment

SpotySpice includes a production-ready, multi-stage Alpine Docker configuration. The image builds the React client and runs the Express backend + WebSockets server seamlessly on a single port (`3000` by default).

### Quickstart with Docker Compose

```bash
docker compose up -d
```
The game will be live at `http://localhost:3000`. User progress and cache data will be persisted in a Docker volume (`spotyspice_data`).

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

