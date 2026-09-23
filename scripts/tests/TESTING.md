# Testing

- `npm test` runs `node --import ./scripts/tests/setup_env.js scripts/run_tests.js`.
  - `setup_env.js` points `SPOTYSPICE_DATA_DIR` at a fresh temp dir, so `users.sqlite`, `catalog.sqlite`, and `anime_catalog.sqlite` are throwaway. **Never** run the runner without this preload, or it writes to the real `server/data/`.
  - `run_tests.js` is a single custom runner (`✓`/`✗` output plus a summary; exits 1 on any failure). It covers identity/keywords/clues, the grid engine, query builder, providers (mocked), selection policies, validators, the HTTP API (server on port 0), WebSocket rooms, SQLite catalog/validator/anime catalog (`:memory:` DBs), and the preview resolver.
- Use `setMusicProviderForTesting(mock)` to stub music providers. Tests must not hit the network.
- For catalog tests, use `new SqliteCatalog(':memory:')` or a temp path. Never use the singleton for writes.
- Legacy rows that `upsertTrack` would refuse (other languages, live versions, entity-encoded titles) are inserted with raw SQL. This is how the cleanup and gate tests (`runPhase4CleanupTests`) build their fixtures. CLI tests run the script with `spawnSync` against a catalog in `os.tmpdir()`.
- `npm run test:prompts` and `npm run eval:crosswords` are live quality suites (real catalog + network), not unit tests.
- Planned: split into `scripts/tests/*.test.js` on `node:test` with `c8` coverage, and add frontend tests with Vitest + RTL.
