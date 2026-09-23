# Scripts & CLI

Flags go after `--` (`npm run db:migrate -- --no-backup`). Every script rejects unknown flags and prints its usage; run it with a wrong flag to see the options.

| Command | What it does |
|---|---|
| `npm run dev` | API (:3001) + Vite (:3000) together. `dev:server` / `dev:client` run each separately |
| `npm run build` / `start` / `preview` | `tsc` + Vite build / production server (serves `dist/` on :3000) / Vite preview |
| `npm run lint` / `lint:fix` / `format` | ESLint / autofix / Prettier |
| `npm test` | Server/shared tests on `node:test`, one temp data dir per process (see `scripts/tests/TESTING.md`) |
| `npm run test:coverage` | `npm test` under c8 with coverage thresholds for `server/db`, `server/policy`, `shared` |
| `npm run test:web` / `test:e2e` | Vitest frontend tests / Playwright smoke test (after `npm run build`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:gate:fixture` | Build the fixture catalog in a temp dir and run the validation gate on it |
| `npm run test:ci` | lint + typecheck + test:coverage + test:web + db:gate:fixture |
| `npm run crawl -- --all` | Crawl: Apple charts, then Deezer vectors. Name vectors to run only those (`-- --artists=250`; flags in `server/crawler/CRAWLER.md`) |
| `npm run catalog:enrich -- --all` | Fill release years by album, ISRC/year/rank by track, artist fans/genres, and strict iTunes links. Name steps to run only those (`-- --albums=N --deezer=N --artists=N --itunes=N`) |
| `npm run catalog:recompute` | Local, after crawls and enrichment: re-vote artist/track languages, then recompute the per-language popularity percentiles (`-- --db=path`) |
| `npm run catalog:genres` | Apply curated artist genre clusters |
| `npm run crawl:artists` / `crawl:playlists` / `crawl:status` | Artist-only / playlist-only / catalog metrics |
| `npm run crawl:top10k` | Ingest Anna's Archive Spotify top‑10k |
| `npm run fetch:datasets` / `ingest:dataset` | Prepare dataset dirs / stream-ingest MusicMoveArr dumps |
| `npm run db:migrate` | Apply pending catalog schema migrations (backup first; `-- --no-backup`, `-- --db=path`) |
| `npm run db:validate` | Diagnostics + cleanup dry run + validation gate; report in `reports/`. `-- --ci` exits 1 when the gate fails |
| `npm run db:sanitize` | Backup (`VACUUM INTO`), apply the cleanup, ANALYZE + VACUUM (`-- --no-backup --no-vacuum --steps=a,b --db=path`) |
| `npm run anime:sync` / `anime:samples` / `anime:ingest` / `anime:images` | Anime OP/ED pipeline |

Manual scripts with no npm alias: `scripts/test_multiplayer_live_sync.js` (needs a running server on :3001), `scripts/build_recognized_artists.js`, `scripts/populate_artist_genres.js`, `scripts/backfill_anime_images.js`.
