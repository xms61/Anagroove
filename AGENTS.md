# SpotySpice — Agent Doc Map

Read only the doc(s) matching your task.

| Doc | Read when |
| :-- | :-- |
| [.github/RELEASE_PROCESS.md](.github/RELEASE_PROCESS.md) | **Before any commit, push, or PR** (branching, version bump, guardrails, checklist) |
| [server/db/CATALOG_DB.md](server/db/CATALOG_DB.md) | Touching the SQLite schema, upserts, dedupe, language/popularity rules, validator/sanitizer |
| [server/crawler/CRAWLER.md](server/crawler/CRAWLER.md) | Crawling, ingest scripts, provider APIs, rate limits, authenticity filter, anime pipeline |
| [server/selection/TRACK_SELECTION.md](server/selection/TRACK_SELECTION.md) | Song-pool selection, themes, query plans, previews, language/thematic filters |
| [shared/CROSSWORD_ENGINE.md](shared/CROSSWORD_ENGINE.md) | Answer extraction, clue text, grid generation |
| [server/API_SECURITY.md](server/API_SECURITY.md) | REST endpoints, validation, rate limits, CORS, env vars, user store |
| [server/MULTIPLAYER_WS.md](server/MULTIPLAYER_WS.md) | WebSocket rooms, co-op/race protocol |
| [src/FRONTEND_UI.md](src/FRONTEND_UI.md) | React components, hooks, styling, accessibility, browser storage |
| [scripts/SCRIPTS_CLI.md](scripts/SCRIPTS_CLI.md) | Which npm script / CLI does what |
| [scripts/tests/TESTING.md](scripts/tests/TESTING.md) | Running or writing tests |

## Always
- One server test file: `node --import ./scripts/tests/setup_env.js --test --test-force-exit scripts/tests/<file>.test.js`. Without the preload, tests write to the real `server/data/`.
- Tests never use the network or `server/data/`. Use `new SqliteCatalog(':memory:')` and the `set*ForTesting` stubs.
- Script flags go after `--`: `npm run catalog:enrich -- --albums=500`.
- `server/data/*.sqlite` is the user's real data. Open it read-only (`new DatabaseSync(path, { readOnly: true })`) for analysis, and never run write scripts against it unless asked.
- Code style: small functions, clear names instead of comments, no speculative abstractions, no emoji or marketing words in code, logs or docs. Delete dead code instead of keeping it "for later". Update the area doc in the same change.
