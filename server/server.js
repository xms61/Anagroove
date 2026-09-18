import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db.js';
import { getRandomSongPool } from './services/musicService.js';
import { generateLiveCrossword } from '../shared/liveCrossword.js';
import {
  validateUserId,
  validateProgressPayload,
  validateHistoryPayload,
  validateBlacklistPayload,
  validateLivePuzzlePayload,
  validateMusicQuery,
  validateWsMessage
} from './validators.js';
import { createRateLimiter, wsRateLimiter } from './middleware/rateLimiter.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const LIVE_PUZZLE_TTL_MS = 5 * 60 * 1000;
const MAX_LIVE_PUZZLES = 100;

export function createLivePuzzleStore({
  ttlMs = LIVE_PUZZLE_TTL_MS,
  maxEntries = MAX_LIVE_PUZZLES,
  createToken = crypto.randomUUID,
} = {}) {
  const puzzles = new Map();
  const capacity = Math.max(1, maxEntries);

  function remove(token) {
    const record = puzzles.get(token);
    if (!record) return null;
    clearTimeout(record.expiryTimer);
    puzzles.delete(token);
    return record;
  }

  function expire(token) {
    const record = puzzles.get(token);
    if (!record) return;
    const remainingMs = record.expiresAt - Date.now();
    if (remainingMs > 0) {
      record.expiryTimer = setTimeout(() => expire(token), remainingMs);
      record.expiryTimer.unref?.();
      return;
    }
    puzzles.delete(token);
  }

  function removeExpired() {
    for (const [token, record] of puzzles) {
      if (record.expiresAt <= Date.now()) remove(token);
    }
  }

  return {
    add(puzzle) {
      removeExpired();
      while (puzzles.size >= capacity) {
        const evicted = puzzles.keys().next().value;
        remove(evicted);
        logger.store('evicted', evicted, '(capacity reached)');
      }

      const token = createToken();
      const record = {
        puzzle,
        expiresAt: Date.now() + ttlMs,
        expiryTimer: null,
      };
      puzzles.set(token, record);
      record.expiryTimer = setTimeout(() => expire(token), ttlMs);
      record.expiryTimer.unref?.();
      logger.store('created', token, `(active: ${puzzles.size})`);
      return token;
    },
    consume(token) {
      const record = puzzles.get(token);
      if (!record || record.expiresAt <= Date.now()) {
        remove(token);
        logger.store('expired_on_consume', token);
        return null;
      }
      logger.store('consumed', token);
      return remove(token);
    },
    clear() {
      for (const token of puzzles.keys()) remove(token);
    },
    get size() {
      removeExpired();
      return puzzles.size;
    },
  };
}

const livePuzzles = createLivePuzzleStore();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3011);

// Configurable CORS Policy
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins) {
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin blocked by CORS policy'));
    }
    // Default development & local allowance
    if (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://localhost:')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Body parser with size limits
app.use(express.json({ limit: '256kb' }));

// Extended API request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      const latency = Date.now() - start;
      const user = req.userId || req.headers['x-user-id'];
      const userContext = user ? `user: ${user}` : '';
      logger.http(req.method, req.originalUrl || req.url, res.statusCode, latency, userContext);
    }
  });
  next();
});

// Apply Sliding-Window Rate Limiters to APIs
const generalApiLimiter = createRateLimiter({ windowMs: 60000, max: 120 });
const musicApiLimiter = createRateLimiter({
  windowMs: 60000,
  max: 30,
  message: 'Music pool generation rate limit exceeded. Please wait a moment.'
});

app.use('/api', generalApiLimiter);
app.use('/api/music/random', musicApiLimiter);
app.use('/api/puzzles/live', musicApiLimiter);

// Public health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Truly randomized recognizable music pool with input validation
app.get('/api/music/random', async (req, res) => {
  try {
    const validatedQuery = validateMusicQuery(req.query);
    const rawUserId = req.headers['x-user-id'] || req.query.userId;
    const userId = rawUserId ? validateUserId(rawUserId) : null;

    let userBlacklist = [];
    if (userId) {
      userBlacklist = db.getBlacklist(userId);
    }

    const songs = await getRandomSongPool({
      genre: validatedQuery.genre,
      minFans: validatedQuery.minFans,
      count: validatedQuery.count,
      blacklist: userBlacklist,
      recentIds: validatedQuery.recentIds,
      prompt: validatedQuery.prompt,
      artist: validatedQuery.artist,
      album: validatedQuery.album,
      decade: validatedQuery.decade,
      popularity: validatedQuery.popularity,
      seed: validatedQuery.seed,
    });

    res.json({ success: true, count: songs.length, songs });
  } catch (err) {
    console.error('Error generating random music pool:', err);
    res.status(500).json({ error: 'Failed to generate recognizable song pool' });
  }
});

// Builds one complete puzzle on the server so every multiplayer participant
// receives the host's same, already-selected tracks and grid.
app.post('/api/puzzles/live', async (req, res) => {
  const rawUserId = req.headers['x-user-id'] || req.query.userId;
  const userId = validateUserId(rawUserId);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid or missing X-User-Id header (must be 3-64 alphanumeric/dash/underscore chars)' });
  }

  const validation = validateLivePuzzlePayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const {
      genre,
      minFans,
      targetWords,
      recentIds,
      prompt,
      artist,
      album,
      decade,
      popularity,
      seed,
    } = validation.data;

    logger.info('puzzle', `Generating live puzzle for user "${userId || 'anonymous'}" | genre: ${genre}, popularity: ${popularity}, prompt: "${prompt || ''}"`);
    const genStart = Date.now();

    const songs = await getRandomSongPool({
      genre,
      minFans,
      count: Math.min(40, targetWords + 12),
      blacklist: db.getBlacklist(userId),
      recentIds,
      prompt,
      artist,
      album,
      decade,
      popularity,
      seed,
    });

    if (songs.length < 6) {
      logger.warn('puzzle', `Insufficient eligible tracks (${songs.length}) for request`);
      return res.status(422).json({
        error: 'Not enough eligible tracks are currently available for this selection. Try broader settings or another prompt.',
        available: songs.length,
      });
    }

    const puzzleTitle = prompt
      ? `⚡ Live: ${prompt.slice(0, 30)}`
      : artist
        ? `⚡ Live: ${artist}`
        : `⚡ Live: ${genre === 'all' ? (popularity === 'pure' ? 'Pure Universe' : 'Eclectic Hits') : genre}`;

    const puzzle = generateLiveCrossword(songs, puzzleTitle, targetWords);
    if (!puzzle) {
      logger.warn('puzzle', `Crossword generator could not place words from ${songs.length} candidates`);
      return res.status(422).json({
        error: 'Eligible tracks could not form an intersecting crossword. Please try again.',
        available: songs.length,
      });
    }

    const livePuzzleToken = livePuzzles.add(puzzle);
    const gridSize = `${puzzle.grid?.length || 0}x${puzzle.grid?.[0]?.length || 0}`;
    logger.puzzle(puzzleTitle, puzzle.clues?.length || 0, targetWords, gridSize, Date.now() - genStart);

    res.json({
      success: true,
      puzzle,
      livePuzzleToken,
      selection: {
        provider: 'deezer',
        candidateCount: songs.length,
        genre,
        minFans,
        popularity,
        artist,
        album,
        prompt,
        seed,
      },
    });
  } catch (err) {
    logger.error('puzzle', `Error generating live puzzle: ${err.message}`, err.stack);
    res.status(503).json({ error: 'Live music discovery is temporarily unavailable. Please try again.' });
  }
});

// Anonymous User ID Middleware for stateful endpoints with strict validation
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/music/random') {
    return next();
  }
  const rawUserId = req.headers['x-user-id'] || req.query.userId;
  const validatedId = validateUserId(rawUserId);
  if (!validatedId) {
    return res.status(400).json({
      error: 'Invalid or missing X-User-Id header (must be 3-64 alphanumeric/dash/underscore chars)'
    });
  }
  req.userId = validatedId;
  next();
});

// Progress persistence
app.get('/api/progress', (req, res) => {
  const progress = db.getProgress(req.userId);
  res.json({ progress });
});

app.post('/api/progress', (req, res) => {
  const validation = validateProgressPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const saved = db.saveProgress(req.userId, validation.data);
  res.json({ success: true, progress: saved });
});

// Solved puzzles history
app.get('/api/history', (req, res) => {
  const history = db.getSolvedHistory(req.userId);
  res.json({ history });
});

app.post('/api/history/solved', (req, res) => {
  const validation = validateHistoryPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const history = db.recordSolvedPuzzle(req.userId, validation.data);
  res.json({ success: true, history });
});

// Blacklist API
app.get('/api/blacklist', (req, res) => {
  const blacklist = db.getBlacklist(req.userId);
  res.json({ blacklist });
});

app.post('/api/blacklist', (req, res) => {
  const validation = validateBlacklistPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const list = db.addBlacklistItem(req.userId, validation.data);
  res.json({ success: true, blacklist: list });
});

app.delete('/api/blacklist/:id', (req, res) => {
  const itemId = String(req.params.id).slice(0, 100);
  const list = db.removeBlacklistItem(req.userId, itemId);
  res.json({ success: true, blacklist: list });
});

// -------------------------------------------------------------
// WebSocket Server for Multiplayer Lobby (Co-op & Versus Race)
// -------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
server.on('close', () => livePuzzles.clear());

// In-memory rooms
const rooms = new Map();

// Generate random friendly room code
function generateRoomCode() {
  const adjectives = ['BEAT', 'GROOVE', 'SPICE', 'VINYL', 'BASS', 'CHORD', 'SOLO', 'FUNK'];
  const num = Math.floor(10 + Math.random() * 90);
  const prefix = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${prefix}-${num}`;
}

const PLAYER_COLORS = [
  '#1db954', // Spotify Green
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
];

function broadcastToRoom(roomCode, message) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const payload = JSON.stringify(message);

  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(payload);
    }
  });
}

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!wsRateLimiter.checkConnection(ip, 20)) {
    ws.close(1008, 'Too many concurrent connections from this IP');
    return;
  }

  logger.ws(`Client connected: ${ip}`);
  const allowMessage = wsRateLimiter.createMessageTracker(35);
  let currentPlayer = null;
  let currentRoomCode = null;

  ws.on('message', (raw) => {
    try {
      if (raw.length > 65536) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message payload too large (max 64KB)' }));
        return;
      }

      if (!allowMessage()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message rate limit exceeded' }));
        return;
      }

      const parsed = JSON.parse(raw.toString());
      const validation = validateWsMessage(parsed);
      if (!validation.valid) {
        ws.send(JSON.stringify({ type: 'error', message: validation.error }));
        return;
      }

      const data = validation.data;
      logger.ws(`Action: ${data.action} (Player: ${data.playerId || 'anonymous'}, Room: ${data.roomCode || 'new'})`);

      switch (data.action) {
        case 'create_room': {
          const livePuzzle = livePuzzles.consume(data.livePuzzleToken);
          if (!livePuzzle) {
            ws.send(JSON.stringify({ type: 'error', message: 'Live puzzle has expired. Generate a new puzzle before creating a room.' }));
            return;
          }
          const roomCode = generateRoomCode();
          currentPlayer = {
            id: data.playerId,
            name: data.playerName || 'Host',
            color: PLAYER_COLORS[0],
            progress: 0,
            ws
          };
          currentRoomCode = roomCode;

          const room = {
            code: roomCode,
            hostId: data.playerId,
            mode: data.mode === 'race' ? 'race' : 'coop',
            puzzle: livePuzzle.puzzle,
            sharedGrid: livePuzzle.puzzle.rows && livePuzzle.puzzle.cols
              ? Array.from({ length: Math.min(30, livePuzzle.puzzle.rows) }, () => Array(Math.min(30, livePuzzle.puzzle.cols)).fill(''))
              : null,
            isStarted: false,
            players: [currentPlayer]
          };

          rooms.set(roomCode, room);

          ws.send(JSON.stringify({
            type: 'room_created',
            room: {
              code: room.code,
              hostId: room.hostId,
              mode: room.mode,
              puzzle: room.puzzle,
              sharedGrid: room.sharedGrid,
              isStarted: room.isStarted,
              players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress }))
            }
          }));
          break;
        }

        case 'join_room': {
          const roomCode = (data.roomCode || '').toUpperCase().trim();
          const room = rooms.get(roomCode);

          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check your code!' }));
            return;
          }

          const existingIdx = room.players.findIndex(p => p.id === data.playerId);
          if (existingIdx >= 0) {
            room.players[existingIdx].ws = ws;
            room.players[existingIdx].name = data.playerName || room.players[existingIdx].name;
            currentPlayer = room.players[existingIdx];
          } else {
            currentPlayer = {
              id: data.playerId,
              name: data.playerName || `Player ${room.players.length + 1}`,
              color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
              progress: 0,
              ws
            };
            room.players.push(currentPlayer);
          }
          currentRoomCode = roomCode;

          // Send complete room payload including puzzle & sharedGrid to joining player
          ws.send(JSON.stringify({
            type: 'room_joined',
            room: {
              code: room.code,
              hostId: room.hostId,
              mode: room.mode,
              puzzle: room.puzzle,
              sharedGrid: room.sharedGrid,
              isStarted: room.isStarted,
              players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress }))
            }
          }));

          // Notify all participants in room
          broadcastToRoom(roomCode, {
            type: 'player_joined',
            player: { id: currentPlayer.id, name: currentPlayer.name, color: currentPlayer.color, progress: 0 },
            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress }))
          });
          break;
        }

        case 'start_game': {
          const room = rooms.get(data.roomCode);
          if (room && (!data.playerId || room.hostId === data.playerId)) {
            room.isStarted = true;
            broadcastToRoom(data.roomCode, {
              type: 'game_started',
              roomCode: data.roomCode,
              puzzle: room.puzzle,
              sharedGrid: room.sharedGrid,
              mode: room.mode,
              room: {
                code: room.code,
                hostId: room.hostId,
                mode: room.mode,
                puzzle: room.puzzle,
                sharedGrid: room.sharedGrid,
                isStarted: true,
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress }))
              }
            });
          }
          break;
        }

        case 'coop_cell_update': {
          const room = rooms.get(data.roomCode);
          if (room) {
            const char = data.char !== undefined ? data.char : '';
            const playerId = data.playerId || 'anonymous';
            const playerName = data.playerName || 'Player';
            const playerColor = data.playerColor || '#f59e0b';
            const { row, col } = data;

            if (!room.sharedGrid && room.puzzle && room.puzzle.rows && room.puzzle.cols) {
              room.sharedGrid = Array.from({ length: room.puzzle.rows }, () => Array(room.puzzle.cols).fill(''));
            }
            if (room.sharedGrid && row < room.sharedGrid.length && col < room.sharedGrid[0].length) {
              room.sharedGrid[row][col] = char;
            }

            broadcastToRoom(data.roomCode, {
              type: 'coop_cell_update',
              roomCode: data.roomCode,
              row,
              col,
              char,
              value: char,
              playerId,
              senderId: playerId,
              playerName,
              playerColor
            });
          }
          break;
        }

        case 'race_progress_update': {
          const room = rooms.get(data.roomCode);
          if (room) {
            const player = room.players.find(p => p.id === data.playerId);
            if (player) {
              player.progress = data.progress;
            }

            broadcastToRoom(data.roomCode, {
              type: 'race_progress_update',
              playerId: data.playerId,
              progress: data.progress,
              players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress }))
            });
          }
          break;
        }

        case 'puzzle_solved': {
          const room = rooms.get(data.roomCode);
          if (room) {
            broadcastToRoom(data.roomCode, {
              type: 'puzzle_solved',
              winnerId: data.playerId,
              winnerName: data.playerName || 'Player'
            });
          }
          break;
        }
      }
    } catch (err) {
      logger.error('ws', `WebSocket message parsing error: ${err.message}`, err.stack);
    }
  });

  ws.on('close', () => {
    wsRateLimiter.releaseConnection(ip);
    logger.ws(`Client disconnected: ${ip} (Player: ${currentPlayer?.name || 'anonymous'})`);

    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.players = room.players.filter(p => p.id !== currentPlayer?.id);
        if (room.players.length === 0) {
          rooms.delete(currentRoomCode);
          logger.info('room', `Room deleted: ${currentRoomCode} (all players left)`);
        } else {
          // If host left, assign next host
          if (room.hostId === currentPlayer?.id) {
            room.hostId = room.players[0].id;
          }
          broadcastToRoom(currentRoomCode, {
            type: 'player_left',
            playerId: currentPlayer?.id,
            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, progress: p.progress })),
            newHostId: room.hostId
          });
        }
      }
    }
  });
});

// Serve static frontend assets in production
const distPath = path.join(__dirname, '../dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Export for test runner
export { app, server };

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  server.listen(PORT, '0.0.0.0', () => {
    logger.info('startup', `🎵 SpotySpice Backend API & WebSocket running on port ${PORT} (http://0.0.0.0:${PORT}) [env: ${process.env.NODE_ENV || 'development'}, log: ${process.env.LOG_LEVEL || 'info'}]`);
  });
}
