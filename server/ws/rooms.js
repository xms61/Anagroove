/**
 * Multiplayer lobby over WebSocket (/ws): co-op (shared grid) and race (progress) rooms.
 * Identity is bound to the socket on create/join; later messages never choose who they act
 * as. A dropped socket keeps its seat for RECONNECT_GRACE_MS so the client can resume with
 * its secret resume token. Protocol: server/MULTIPLAYER_WS.md.
 */
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { WebSocketServer, WebSocket } from 'ws';
import { validateWsMessage } from '../validators.js';
import { wsRateLimiter } from '../middleware/rateLimiter.js';
import { clientIpFromUpgrade } from '../http/security.js';
import { logger } from '../logger.js';

const MAX_PLAYERS_PER_ROOM = 8;
const RECONNECT_GRACE_MS = 30 * 1000;
const ROOM_WORDS = ['BEAT', 'GROOVE', 'SPICE', 'VINYL', 'BASS', 'CHORD', 'SOLO', 'FUNK',
  'TEMPO', 'RIFF', 'DROP', 'LOOP', 'VIBE', 'TUNE', 'WAVE', 'ECHO'];
const PLAYER_COLORS = [
  '#1db954', // Spotify Green
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
];

function newResumeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string' || expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function publicPlayers(room) {
  return room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress }));
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    puzzle: room.puzzle,
    sharedGrid: room.sharedGrid,
    isStarted: room.isStarted,
    players: publicPlayers(room),
  };
}

function emptyGrid(puzzle) {
  return puzzle?.rows && puzzle?.cols
    ? Array.from({ length: Math.min(30, puzzle.rows) }, () => Array(Math.min(30, puzzle.cols)).fill(''))
    : null;
}

/**
 * Attaches the multiplayer WebSocket server to an HTTP server.
 * @param {import('http').Server} server
 * @param {{ livePuzzles: ReturnType<typeof import('../http/livePuzzleStore.js').createLivePuzzleStore> }} deps
 */
export function attachMultiplayer(server, { livePuzzles }) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const rooms = new Map();

  // Friendly room codes with collision avoidance (16 words x 9,000 numbers)
  function generateRoomCode() {
    let code;
    let attempts = 0;
    do {
      code = `${ROOM_WORDS[crypto.randomInt(ROOM_WORDS.length)]}-${crypto.randomInt(1000, 10000)}`;
      attempts++;
    } while (rooms.has(code) && attempts < 50);
    return code;
  }

  function broadcastToRoom(roomCode, message) {
    const room = rooms.get(roomCode);
    if (!room) return;
    const payload = JSON.stringify(message);
    room.players.forEach(p => {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
    });
  }

  function removePlayerFromRoom(roomCode, player) {
    const room = rooms.get(roomCode);
    if (!room || !player) return;
    clearTimeout(player.disconnectTimer);
    room.players = room.players.filter(p => p !== player);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
      logger.info('room', `Room deleted: ${roomCode} (all players left)`);
      return;
    }
    if (room.hostId === player.id) {
      room.hostId = room.players[0].id;
    }
    broadcastToRoom(roomCode, {
      type: 'player_left',
      playerId: player.id,
      players: publicPlayers(room),
      newHostId: room.hostId,
    });
  }

  wss.on('connection', (ws, req) => {
    const ip = clientIpFromUpgrade(req);
    if (!wsRateLimiter.checkConnection(ip, 20)) {
      ws.close(1008, 'Too many concurrent connections from this IP');
      return;
    }

    logger.ws(`Client connected: ${ip}`);
    const allowMessage = wsRateLimiter.createMessageTracker(35);
    let currentPlayer = null;
    let currentRoomCode = null;

    const sendError = (message) => ws.send(JSON.stringify({ type: 'error', message }));

    function leaveCurrentRoom() {
      if (currentRoomCode && currentPlayer) removePlayerFromRoom(currentRoomCode, currentPlayer);
      currentPlayer = null;
      currentRoomCode = null;
    }

    function memberRoom(roomCode) {
      if (!currentPlayer || !currentRoomCode || currentRoomCode !== roomCode) return null;
      const room = rooms.get(roomCode);
      if (!room || !room.players.includes(currentPlayer) || currentPlayer.ws !== ws) return null;
      return room;
    }

    const handlers = {
      create_room(data) {
        const livePuzzle = livePuzzles.consume(data.livePuzzleToken);
        if (!livePuzzle) {
          sendError('Live puzzle has expired. Generate a new puzzle before creating a room.');
          return;
        }
        leaveCurrentRoom();

        const roomCode = generateRoomCode();
        currentPlayer = {
          id: data.playerId,
          name: data.playerName || 'Host',
          color: PLAYER_COLORS[0],
          progress: 0,
          ws,
          resumeToken: newResumeToken(),
          disconnectTimer: null,
        };
        currentRoomCode = roomCode;

        const room = {
          code: roomCode,
          hostId: data.playerId,
          mode: data.mode === 'race' ? 'race' : 'coop',
          puzzle: livePuzzle.puzzle,
          sharedGrid: emptyGrid(livePuzzle.puzzle),
          isStarted: false,
          players: [currentPlayer],
        };
        rooms.set(roomCode, room);

        ws.send(JSON.stringify({ type: 'room_created', resumeToken: currentPlayer.resumeToken, room: roomSnapshot(room) }));
      },

      join_room(data) {
        const roomCode = (data.roomCode || '').toUpperCase().trim();
        const room = rooms.get(roomCode);
        if (!room) {
          sendError('Room not found. Check your code!');
          return;
        }

        const existing = room.players.find(p => p.id === data.playerId);
        if (existing) {
          // Taking over an existing seat requires the secret token issued to that seat
          if (!tokensMatch(existing.resumeToken, data.resumeToken)) {
            sendError('That player is already in this room.');
            return;
          }
          if (currentRoomCode && currentRoomCode !== roomCode) leaveCurrentRoom();
          clearTimeout(existing.disconnectTimer);
          existing.disconnectTimer = null;
          if (existing.ws && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
            existing.ws.close(4000, 'Session resumed from another connection');
          }
          existing.ws = ws;
          if (data.playerName) existing.name = data.playerName;
          currentPlayer = existing;
        } else {
          if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
            sendError(`Room is full (max ${MAX_PLAYERS_PER_ROOM} players).`);
            return;
          }
          if (currentRoomCode && currentRoomCode !== roomCode) leaveCurrentRoom();
          currentPlayer = {
            id: data.playerId,
            name: data.playerName || `Player ${room.players.length + 1}`,
            color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
            progress: 0,
            ws,
            resumeToken: newResumeToken(),
            disconnectTimer: null,
          };
          room.players.push(currentPlayer);
        }
        currentRoomCode = roomCode;

        ws.send(JSON.stringify({
          type: 'room_joined',
          resumed: Boolean(existing),
          resumeToken: currentPlayer.resumeToken,
          room: roomSnapshot(room),
        }));
        broadcastToRoom(roomCode, {
          type: 'player_joined',
          player: { id: currentPlayer.id, name: currentPlayer.name, color: currentPlayer.color, progress: currentPlayer.progress },
          players: publicPlayers(room),
        });
      },

      start_game(data) {
        const room = memberRoom(data.roomCode);
        if (!room) {
          sendError('You are not a member of this room.');
          return;
        }
        if (room.hostId !== currentPlayer.id) {
          sendError('Only the host can start the game.');
          return;
        }
        room.isStarted = true;
        broadcastToRoom(room.code, {
          type: 'game_started',
          roomCode: room.code,
          puzzle: room.puzzle,
          sharedGrid: room.sharedGrid,
          mode: room.mode,
          room: roomSnapshot(room),
        });
      },

      coop_cell_update(data) {
        const room = memberRoom(data.roomCode);
        if (!room) {
          sendError('You are not a member of this room.');
          return;
        }
        if (room.mode !== 'coop') {
          sendError('Cell updates are only shared in co-op rooms.');
          return;
        }
        const char = data.char !== undefined ? data.char : '';
        const { row, col } = data;
        if (!room.sharedGrid) room.sharedGrid = emptyGrid(room.puzzle);
        if (room.sharedGrid && row < room.sharedGrid.length && col < room.sharedGrid[0].length) {
          room.sharedGrid[row][col] = char;
        }
        broadcastToRoom(room.code, {
          type: 'coop_cell_update',
          roomCode: room.code,
          row,
          col,
          char,
          value: char,
          playerId: currentPlayer.id,
          senderId: currentPlayer.id,
          playerName: currentPlayer.name,
          playerColor: currentPlayer.color,
        });
      },

      race_progress_update(data) {
        const room = memberRoom(data.roomCode);
        if (!room) {
          sendError('You are not a member of this room.');
          return;
        }
        currentPlayer.progress = data.progress;
        broadcastToRoom(room.code, {
          type: 'race_progress_update',
          playerId: currentPlayer.id,
          progress: data.progress,
          players: publicPlayers(room),
        });
      },

      puzzle_solved(data) {
        const room = memberRoom(data.roomCode);
        if (!room) {
          sendError('You are not a member of this room.');
          return;
        }
        broadcastToRoom(room.code, { type: 'puzzle_solved', winnerId: currentPlayer.id, winnerName: currentPlayer.name });
      },
    };

    ws.on('message', (raw) => {
      try {
        if (raw.length > 65536) {
          sendError('Message payload too large (max 64KB)');
          return;
        }
        if (!allowMessage()) {
          sendError('Message rate limit exceeded');
          return;
        }

        const validation = validateWsMessage(JSON.parse(raw.toString()));
        if (!validation.valid) {
          sendError(validation.error);
          return;
        }

        const data = validation.data;
        logger.ws(`Action: ${data.action} (Player: ${currentPlayer?.id || data.playerId || 'anonymous'}, Room: ${data.roomCode || 'new'})`);
        handlers[data.action]?.(data);
      } catch (err) {
        logger.error('ws', `WebSocket message parsing error: ${err.message}`, err.stack);
      }
    });

    ws.on('close', () => {
      wsRateLimiter.releaseConnection(ip);
      logger.ws(`Client disconnected: ${ip} (Player: ${currentPlayer?.name || 'anonymous'})`);

      // Ignore sockets that were already replaced by a resumed connection
      if (!currentRoomCode || !currentPlayer || currentPlayer.ws !== ws) return;

      const player = currentPlayer;
      const roomCode = currentRoomCode;
      player.ws = null;
      player.disconnectTimer = setTimeout(() => removePlayerFromRoom(roomCode, player), RECONNECT_GRACE_MS);
      player.disconnectTimer.unref?.();
    });
  });

  return { wss, rooms };
}
