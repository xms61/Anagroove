# Anagroove

The music crossword (anagram + groove). A blind audio crossword: every clue is a 30-second song preview. Guess the title, artist or a keyword from the title, without seeing either until the puzzle is solved. Play solo, co-op or versus.

## Features
- **Live puzzles** from a local SQLite catalog of English, Japanese and Korean original recordings. You can pick one of 16 themes (pop, rock, indie, hip-hop, R&B, EDM, metal, country, jazz, K-pop, J-pop, anime, …), or type a prompt such as "80s synth-pop", "songs by Queen" or "rock before 1990".
- **Popularity control:** top hits, balanced, hidden gems or pure random. Recently played songs and artists are avoided.
- **Zero-spoiler clues**: an answer never appears in its own clue.
- **Multiplayer** over WebSockets: co-op (shared grid) and versus (race).
- **Anime OP/ED catalog** with its own audio clips and cover art.
- **Three themes** (Tokyo Rain, Berlin Concrete, Vinyl Room), switched in Settings.
- History, a blacklist (artists or songs you never want to see), and accessible dialogs with keyboard play.

## Quickstart
Requires **Node.js 24** (`.nvmrc`). No API keys are needed.

```bash
npm install
cp .env.example .env   # optional overrides: ports, CORS origins, data dir, log level
npm run dev            # API + WebSockets on :3001, Vite UI on :3000
```

Puzzles come from the local catalog. With an empty catalog only prompts that name an artist work (they look the artist up on Deezer/iTunes). To build a catalog, see [Populating the catalog](#populating-the-catalog).

Production: `npm run build && npm start` serves `dist/` and the API on `:3000`.

## How to play
1. Select a clue (sidebar or grid cell), and its preview starts playing.
2. Type letters; use Backspace, the arrow keys, and Space to toggle direction.
3. Use **Hint** to reveal a letter, a word or the whole puzzle, and **Check** to mark wrong cells.
4. Solving the grid shows the full tracklist with cover art and replays.

## Populating the catalog
Catalog files live in `server/data/` (gitignored; override with `SPOTYSPICE_DATA_DIR`). Schema migrations run automatically.

```bash
npm run crawl -- --all                      # Apple charts + Deezer vectors (flags: server/crawler/CRAWLER.md)
npm run catalog:enrich -- --all             # release years, artist fans/genres, ISRC/rank, iTunes links, language evidence
npm run catalog:recompute                   # languages + popularity percentiles (local)
npm run db:validate                         # diagnostics + cleanup dry run + gate report
npm run db:sanitize                         # apply the cleanup (writes a backup first)
npm run catalog:coverage                    # can every theme and benchmark prompt be served? (offline)
```

Flags always go after `--` (`npm run catalog:enrich -- --albums=5000`). Without it, npm swallows them. Every command is listed in [scripts/SCRIPTS_CLI.md](scripts/SCRIPTS_CLI.md).

## Tests
```bash
npm test            # server + shared (node:test, isolated temp data dirs)
npm run test:web    # frontend hooks (Vitest)
npm run test:ci     # lint + typecheck + coverage + frontend + fixture catalog gate
npm run test:e2e    # Playwright smoke test (run `npm run build` first)
```
Details: [scripts/tests/TESTING.md](scripts/tests/TESTING.md).

## Documentation
| Area | Doc |
| :-- | :-- |
| Catalog schema, admission policy, dedupe, popularity | [server/db/CATALOG_DB.md](server/db/CATALOG_DB.md) |
| Crawler, enrichment, ingest scripts | [server/crawler/CRAWLER.md](server/crawler/CRAWLER.md) |
| Song selection, themes, previews | [server/selection/TRACK_SELECTION.md](server/selection/TRACK_SELECTION.md) |
| Answers, clues, grid | [shared/CROSSWORD_ENGINE.md](shared/CROSSWORD_ENGINE.md) |
| REST API, security, env vars | [server/API_SECURITY.md](server/API_SECURITY.md) |
| Multiplayer protocol | [server/MULTIPLAYER_WS.md](server/MULTIPLAYER_WS.md) |
| Frontend | [src/FRONTEND_UI.md](src/FRONTEND_UI.md) |
| Branching, versioning, PRs | [.github/RELEASE_PROCESS.md](.github/RELEASE_PROCESS.md) |

## Docker
```bash
docker compose up -d        # http://localhost:3000, data in the spotyspice_data volume (the old name, kept so existing data stays)
```
The image never contains catalog or user databases (`.dockerignore`). Copy a catalog into the volume, or crawl inside the container. The server honours `$PORT`. Anime clips are mounted from `./data/anime_samples`. Behind a reverse proxy, set `TRUST_PROXY` (see `.env.example`), or every player shares the proxy's rate limits.

Releases are cut with the manual **Release** workflow (`.github/workflows/manual-release.yml`). It runs the checks, builds the image, tags the version and publishes notes from `CHANGELOG.md`.

## License
Apache License 2.0. See [LICENSE](LICENSE).
