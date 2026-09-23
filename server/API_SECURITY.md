# API & Security

Entry: `server/server.js` (Express 4, plus a `ws` server on `/ws`). `server/config.js` loads `.env` without overriding real env.

## Endpoints
| Route | Auth | Notes |
|---|---|---|
| `GET /api/health` | none | liveness |
| `GET /api/music/random` | optional `X-User-Id` | song pool; 30/min limit |
| `POST /api/puzzles/live` | `X-User-Id` | builds a puzzle and returns `livePuzzleToken` (5 min TTL, max 100) for `create_room`; 30/min limit |
| `GET/POST /api/progress` | `X-User-Id` | `validateProgressPayload` (≤30×30 grid) |
| `GET /api/history`, `POST /api/history/solved` | `X-User-Id` | |
| `GET/POST /api/blacklist`, `DELETE /api/blacklist/:id` | `X-User-Id` | |
| `GET /api/preview/:ref` | none | `ref` = `deezer:<id>`, `itunes:<id>`, or `catalog:<id>`. 302 to a fresh preview URL (404 if none). Own limit of 300/min and skips the general limiter |
| `/audio/anime/*` | none | static anime clips |

`X-User-Id` must match `^[A-Za-z0-9_-]{3,64}$`. It's an anonymous bearer id, so treat it as a secret.

## Validation & limits
- All input goes through `server/validators.js`. Add a validator there for any new payload.
- JSON body limit 256 kb. General API: 120 req/min per IP (`middleware/rateLimiter.js`). WS: max 20 connections per IP and 35 messages/s, 64 KB per message.
- Client IP is `req.ip`, which follows `TRUST_PROXY`. WS upgrades use `clientIpFromUpgrade` with the same rule. Never read `X-Forwarded-For` directly.
- CORS allows only origins in `CORS_ALLOWED_ORIGINS`, or localhost when that's unset. A rejected origin gets a 403 JSON response from the error handler at the end of `server.js`, which also turns bad or oversized bodies into 400/413 JSON.
- Every response gets `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and `Permissions-Policy`. Production also gets a CSP (`media-src https:` for preview redirects).
- `db.findUser` is read-only; only writes call `db.getUser`, which creates the user. Blacklist DELETE matches the item `id` only.
- Shutdown: register cleanup with `onShutdown(name, fn)` in `server/shutdown.js` (store flush, catalog WAL checkpoint). Never add your own SIGINT/SIGTERM handlers.

## Env vars (see `.env.example`)
`PORT`, `VITE_PORT`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `SPOTYSPICE_DATA_DIR`, `LOG_LEVEL`, `NODE_ENV`. No third-party API keys are used. Never commit `.env`.

## Known gaps
- `X-User-Id` is an unauthenticated bearer id. There are no accounts.
