# Multiplayer WebSocket

Server: `server/ws/rooms.ts` (`attachMultiplayer(server, { livePuzzles })`: `WebSocketServer` on `/ws`, rooms kept in an in-memory `Map`, one handler per action). Client: `src/services/socketService.ts` (auto-reconnect with backoff up to a max). Validation: `validateWsMessage` in `server/validators.ts`.

## Client → server actions
| Action | Payload | Effect |
|---|---|---|
| `create_room` | `livePuzzleToken`, `playerId`, `playerName`, `mode` (`coop`\|`race`) | Consumes the token from `POST /api/puzzles/live`, creates code `WORD-NNNN`, and replies `room_created` with `resumeToken` |
| `join_room` | `roomCode`, `playerId`, `playerName`, optional `resumeToken` | Max 8 players. Replies `room_joined` (`resumed: true` when a seat was reclaimed) and broadcasts `player_joined` |
| `start_game` | `roomCode` | The sender's socket must hold the host seat. Broadcasts `game_started` with the puzzle and shared grid |
| `coop_cell_update` | `roomCode`, `row`, `col` (0–30), `char` (1 char) | Co-op rooms only. Updates `sharedGrid` and broadcasts with the sender's server-assigned id, name, and color |
| `race_progress_update` | `roomCode`, `progress` (0–100) | Broadcasts the leaderboard |
| `puzzle_solved` | `roomCode` | Broadcasts the sender as the winner |

Server-only events: `error`, `player_left` (includes `newHostId` when the host leaves). An empty room is deleted.

## Rules
- Every room plays the same server-generated puzzle. Clients never send their own puzzle.
- **Identity is bound to the socket** on create/join. For every other action the server ignores the message's `playerId` and requires `currentRoomCode === roomCode` (`memberRoom()`).
- Taking over a seat whose `playerId` is already in the room requires that seat's `resumeToken` (128-bit, compared in constant time).
- A dropped socket keeps its seat for 30 s (`RECONNECT_GRACE_MS`). `socketService` resends `join_room` with the token on reconnect. After the grace period the player is removed, and the host passes to the next player.
- Player colors cycle through `PLAYER_COLORS`. Room codes are `WORD-NNNN` (16 × 9,000), generated with `crypto.randomInt`.
