# API & Security

Entry: `server/server.ts` composes the app (Express 4, plus a `ws` server on `/ws`). `server/config.ts` loads `.env` without overriding real env.
- `server/http/`: `security.ts` (proxy trust, client IP, headers/CSP, CORS, request log, JSON error handler) and `livePuzzleStore.ts`.
- `server/routes/`: `music.ts` (preview, random pool, live puzzle; public) and `user.ts` (progress, history, blacklist, behind `requireUserId`).
- `server/ws/rooms.ts`: multiplayer (see `MULTIPLAYER_WS.md`).

## Endpoints
| Route | Auth | Notes |
|---|---|---|
| `GET /api/health` | none | liveness |
| `GET /api/music/random` | optional `X-User-Id` | song pool; optional `languages=en,ja` filter; 30/min limit |
| `POST /api/puzzles/live` | `X-User-Id` | builds a puzzle and returns `livePuzzleToken` (5 min TTL, max 100) for `create_room`. Optional `languages: ["en"\|"ja"\|"ko"]` (`parseLanguageFilter`); 30/min limit |
| `GET/POST /api/progress` | `X-User-Id` | `validateProgressPayload` (≤30×30 grid) |
| `GET /api/history`, `POST /api/history/solved` | `X-User-Id` | |
| `GET/POST /api/blacklist`, `DELETE /api/blacklist/:id` | `X-User-Id` | |
| `GET /api/preview/:ref` | none | `ref` = `deezer:<id>`, `itunes:<id>`, or `catalog:<id>`. 302 to a fresh preview URL (404 if none, 503 with `Retry-After` when the shared provider budget is exhausted). Own limit of 300/min and skips the general limiter. One lookup per ref at a time; misses are cached for 10 min |
| `/audio/anime/*` | none | static anime clips |

`X-User-Id` must match `^[A-Za-z0-9_-]{3,64}$`. It's an anonymous bearer id, so treat it as a secret: it is read from the header only (never the query string) and never logged. The request log records method, path (no query string), status and time.

## Validation & limits
- All input goes through `server/validators.ts`. Add a validator there for any new payload.
- JSON body limit 256 kb. General API: 120 req/min per IP (`middleware/rateLimiter.ts`). WS: max 20 connections per IP and 35 messages/s. `maxPayload` refuses a frame over 64 KiB while it arrives (close 1009), and a socket that misses a 30 s ping is terminated. Wrong room codes are limited to 10 per minute per IP.
- Client IP is `req.ip`, which follows `TRUST_PROXY`. WS upgrades use `clientIpFromUpgrade` with the same rule. Never read `X-Forwarded-For` directly.
- CORS (`isAllowedOrigin`) always allows the page's own origin (the `Origin` host equals `Host`: browsers send `Origin` on same-origin POST and DELETE), then origins in `CORS_ALLOWED_ORIGINS`, or local dev origins when that's unset. WebSocket upgrades apply the same rule. Free text that reaches logs or other players (prompt, artist, album, decade, player name) has its control characters replaced. A rejected origin gets a 403 JSON response from `jsonErrorHandler` (`http/security.ts`), which also turns bad or oversized bodies into 400/413 JSON.
- Every response gets `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and `Permissions-Policy`. Production also gets a CSP (`media-src https:` for preview redirects, `font-src 'self'`, since fonts are self-hosted).
- **User store:** `server/db.ts` → `UserStore` (`server/db/userStore.ts`), SQLite `DATA_DIR/users.sqlite` (tables `users`, `progress`, `solved_history`, `blacklist`, `meta`), opened lazily.
  - The old `store.json` (or its `.bak`) is imported once on first open, recorded in `meta`, and then no longer read.
  - Reads (`findUser`, `get*`) never create users; writes do.
  - Blacklist rows are unique per (user, type, identity key), and DELETE matches the item `id` only.
  - A user can hide up to 500 items (`MAX_BLACKLIST_ITEMS`; the next add answers 409), and the solved history keeps the newest 1,000 entries (`MAX_HISTORY_ITEMS`). Every write returns the whole list.
- Shutdown: register cleanup with `onShutdown(name, fn)` in `server/shutdown.ts` (user store and catalog WAL checkpoints). Never add your own SIGINT/SIGTERM handlers.

## Env vars (see `.env.example`)
`PORT`, `VITE_PORT`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `SPOTYSPICE_DATA_DIR`, `LOG_LEVEL`, `NODE_ENV`, `SPOTYSPICE_OFFLINE` (`1` = catalog only: no Deezer/iTunes lookups for named artists, previews answer 404; used by the smoke test). No third-party API keys are used. Never commit `.env`.

## Known gaps
- `X-User-Id` is an unauthenticated bearer id. There are no accounts.
