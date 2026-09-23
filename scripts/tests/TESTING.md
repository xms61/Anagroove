# Testing

| Command | What | Where |
| :-- | :-- | :-- |
| `npm test` | Server + shared tests on `node:test`, one process per file, in parallel (~5 s). Dot reporter: failures print in full, passes as dots | `scripts/tests/*.test.js` |
| `npm run test:coverage` | `npm test` under c8, then gates `server/db`, `server/policy`, `shared` at lines/functions ≥ 85 %, branches ≥ 75 % | `.c8rc.json`, report in `coverage/` |
| `npm run test:web` | Frontend hooks/components on Vitest + React Testing Library (jsdom) | `src/**/*.test.ts(x)` |
| `npm run test:e2e` | Playwright smoke test against the production build (`npm run build` first) | `scripts/tests/e2e/*.spec.ts` |
| `npm run db:gate:fixture` | Builds the fixture catalog in a temp dir and runs `db:validate --ci` on it | `scripts/tests/fixtures/` |
| `npm run test:ci` | lint + typecheck + test:coverage + test:web + db:gate:fixture (CI also builds and runs e2e) | `.github/workflows/ci.yml` |

`npm run test:prompts` and `npm run eval:crosswords` are live quality suites (real catalog + network), not unit tests.

## Server tests (`node:test`)
- **Isolation:** `setup_env.js` is preloaded with `--import`. It gives each test process its own temp `SPOTYSPICE_DATA_DIR`, so `users.sqlite`, `catalog.sqlite` and `anime_catalog.sqlite` are throwaway. **Never** run a test file without the preload, or it writes to the real `server/data/`. Run one file with:
  `node --import ./scripts/tests/setup_env.js --test --test-force-exit scripts/tests/<file>.test.js`
- Use `import assert from 'node:assert/strict'` and `test()` from `node:test`. Prefer table-driven tests for rule corpora (see `languageCorpus.test.js`).
- **No network:**
  - Stub music providers with `setMusicProviderForTesting(mock)`, which also bypasses the catalog.
  - Stub preview lookups with `setPreviewFetchForTesting(fn)`.
  - Deezer provider tests replace `globalThis.fetch`.
  - `SPOTYSPICE_OFFLINE=1` turns off all live fallbacks (`offline.test.js`).
- **Catalogs:** use `new SqliteCatalog(':memory:')` or a temp path, never the singleton for writes.
  - Legacy rows that `upsertTrack` would refuse (other languages, live versions, entity-encoded titles) are inserted with raw SQL. The cleanup and gate tests (`catalogCleanup.test.js`) build their fixtures this way.
  - CLI tests run the script with `spawnSync` against a catalog in `os.tmpdir()`.
- **HTTP/WS:** import `server` from `server/server.js` and `listen(0)`. `helpers.js` has `wsTestClient`, `mockJsonResponse` and `routedFetch`.

| File | Covers |
| :-- | :-- |
| `crosswordEngine`, `musicKeywords`, `clueSystem`, `animeArt` | grid placement, answer extraction, zero-spoiler clues |
| `queryBuilder`, `selectionPolicy`, `deezerProvider` | prompt parsing, query plans, language/year rules, provider caching |
| `validators`, `apiIntegration`, `hardening` | input validation, REST + WS flows, preview 302, CORS/CSP, WS authz and resume |
| `sqliteCatalog`, `unicodeDedupe`, `popularity`, `languageCorpus` | schema, admission policy, CJK dedupe, 0-100 calibration, classifier corpus |
| `catalogValidator`, `catalogCleanup`, `crawler`, `musicMoveArr`, `animeCatalog` | validator, cleanup idempotence, gate, enrichment, ingest |
| `blacklist`, `crosswordJudge`, `offline`, `fixtureCatalog` | blacklist matching, judge heuristics, offline mode, CI fixture |

## Frontend tests (Vitest)
- `vitest.config.ts` extends `vite.config.ts` with jsdom. Test files sit next to the code (`useCrosswordGame.test.ts`). Shared fixtures are in `src/test/`.
- Mock `../services/apiClient`, `../services/socketService` and `canvas-confetti` with `vi.mock`. Use `renderHook` + `act`, and `vi.useFakeTimers()` for the debounced progress save.

## Fixture catalog & smoke test
- `fixtures/fixtureCatalog.js` builds 92 clean tracks (80 en, 6 ja, 6 ko) with years, ISRCs and Deezer ids through `upsertTrack`. It throws if the admission policy rejects any row, so a rule change that drops ordinary titles fails loudly. SQLite files are never committed; the fixture is always generated.
- `e2e/server.js` builds the fixture into a temp dir and starts the server in production mode with `SPOTYSPICE_OFFLINE=1` on port 3101 (`E2E_PORT`).
- `smoke.spec.ts`:
  - loads the app, which generates a puzzle
  - types every answer through the keyboard, expects the end screen and checks the solve in `/api/history`
  - checks there's no horizontal scroll at 375 px
- **Browsers:** CI runs `npx playwright install --with-deps chromium`. Locally, either install Chromium the same way or set `PLAYWRIGHT_CHANNEL=msedge` (or `chrome`) to use an installed browser.
