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
| `/audio/anime/*` | none | static anime clips |

`X-User-Id` must match `^[A-Za-z0-9_-]{3,64}$`. It's an anonymous bearer id, so treat it as a secret.

## Validation & limits
- All input goes through `server/validators.js`. Add a validator there for any new payload.
- JSON body limit 256 kb. General API: 120 req/min per IP (`middleware/rateLimiter.js`). WS: max 20 connections per IP and 35 messages/s, 64 KB per message.
- CORS allows only origins in `CORS_ALLOWED_ORIGINS`, or localhost when that's unset.

## Env vars (see `.env.example`)
`PORT`, `VITE_PORT`, `CORS_ALLOWED_ORIGINS`, `SPOTYSPICE_DATA_DIR`, `LOG_LEVEL`, `NODE_ENV`. No third-party API keys are used. Never commit `.env`.

## Known gaps (Phase 1 of the plan)
- The WS server trusts the client-supplied `playerId` (host spoofing, non-member messages). See `MULTIPLAYER_WS.md`.
- A CORS rejection returns 500, not 403. There are no security headers and no `trust proxy`, and the WS limiter trusts raw `X-Forwarded-For`.
- `db.getUser` creates a user on reads, so the store can grow without bound.
