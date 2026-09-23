# Multiplayer WebSocket

Server: `server/server.js` (`WebSocketServer` on `/ws`, rooms kept in an in-memory `Map`). Client: `src/services/socketService.ts` (auto-reconnect with backoff up to a max). Validation: `validateWsMessage` in `server/validators.js`.

## Client → server actions
| Action | Payload | Effect |
|---|---|---|
| `create_room` | `livePuzzleToken`, `playerId`, `playerName`, `mode` (`coop`\|`race`) | Consumes the token from `POST /api/puzzles/live`, creates code `WORD-NN`, and replies `room_created` |
| `join_room` | `roomCode`, `playerId`, `playerName` | Max 8 players. Replies `room_joined` and broadcasts `player_joined` |
| `start_game` | `roomCode`, `playerId` (must be the host) | Broadcasts `game_started` with the puzzle and shared grid |
| `coop_cell_update` | `roomCode`, `row`, `col` (0–30), `char` (1 char) | Updates `sharedGrid` and broadcasts |
| `race_progress_update` | `roomCode`, `progress` (0–100) | Broadcasts the leaderboard |
| `puzzle_solved` | `roomCode`, `playerId`, `playerName` | Broadcasts the winner |

Server-only events: `error`, `player_left` (includes `newHostId` when the host leaves). An empty room is deleted.

## Rules
- Every room plays the same server-generated puzzle. Clients never send their own puzzle.
- Player colors cycle through `PLAYER_COLORS`.

## Known gaps (Phase 1 of the plan)
- Identity comes from the message's `playerId`, not from the socket, and the sender isn't checked for room membership.
- A reconnect doesn't rejoin the room. The old socket's close handler removes the player.
- Room codes are guessable (16 words × 90 numbers).
