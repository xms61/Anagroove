# Scripts & CLI

| Command | What it does |
|---|---|
| `npm run dev` | API (:3001) + Vite (:3000) together. `dev:server` / `dev:client` run each separately |
| `npm run build` / `start` / `preview` | `tsc` + Vite build / production server (serves `dist/` on :3000) / Vite preview |
| `npm run lint` / `lint:fix` / `format` | ESLint / autofix / Prettier |
| `npm test` | Unit/integration suite, isolated to a temp data dir (see `scripts/tests/TESTING.md`) |
| `npm run test:prompts` | Live multi-prompt crossword suite against the **real** catalog + network; report in `reports/` |
| `npm run test:all` / `test:ci` | test + test:prompts / lint + test |
| `npm run eval:crosswords` | Batch quality benchmark with `crosswordJudge`; report in `reports/` |
| `npm run crawl` | Full crawl: Apple charts, then Deezer vectors (`scripts/crawl_catalog.js`, flags in `server/crawler/CRAWLER.md`) |
| `npm run catalog:enrich` | Fill release years by album, ISRC/year/rank by track, artist fans/genres, and strict iTunes links; recompute languages (`-- --albums=N --deezer=N --artists=N --itunes=N --languages`) |
| `npm run catalog:genres` | Apply curated artist genre clusters |
| `npm run crawl:artists` / `crawl:playlists` / `crawl:status` | Artist-only / playlist-only / catalog metrics |
| `npm run crawl:top10k` | Ingest Anna's Archive Spotify top‑10k |
| `npm run fetch:datasets` / `ingest:dataset` | Prepare dataset dirs / stream-ingest MusicMoveArr dumps |
| `npm run db:migrate` | Apply pending catalog schema migrations (backup first; `-- --no-backup`, `-- --db=path`) |
| `npm run db:validate` | Diagnostics + cleanup dry run + validation gate; report in `reports/`. `-- --ci` exits 1 when the gate fails |
| `npm run db:sanitize` | Backup (`VACUUM INTO`), apply the cleanup, ANALYZE + VACUUM (`-- --no-backup --no-vacuum --steps=a,b --db=path`) |
| `npm run anime:sync` / `anime:samples` / `anime:ingest` / `anime:images` | Anime OP/ED pipeline |

Manual scripts with no npm alias: `scripts/test_multiplayer_live_sync.js` (needs a running server on :3001), `scripts/build_recognized_artists.js`, `scripts/populate_artist_genres.js`, `scripts/backfill_anime_images.js`.
