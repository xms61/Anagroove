import './config.js';
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db.js';
import { getRandomSongPool } from './selection/songPool.js';
import { generateLiveCrossword } from '../shared/liveCrossword.js';
import {
  validateUserId,
  validateProgressPayload,
  validateHistoryPayload,
  validateBlacklistPayload,
  validateLivePuzzlePayload,
  validateMusicQuery,
  validateWsMessage,
  validatePreviewRef
} from './validators.js';
import { createRateLimiter, wsRateLimiter } from './middleware/rateLimiter.js';
import { resolvePreviewRef } from './services/previewResolver.js';
import { peekSqliteCatalog } from './db/sqliteCatalog.js';
import { onShutdown } from './shutdown.js';
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
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * TRUST_PROXY mirrors Express' "trust proxy" setting: a hop count ("1"), "true", or a
 * named range ("loopback"). Unset means the socket address is the client address and
 * X-Forwarded-For is ignored everywhere (it is client-controlled).
 */
export function parseTrustProxy(value) {
  if (value === undefined || value === null || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
app.set('trust proxy', trustProxy);
app.disable('x-powered-by');

/**
 * Client IP for WebSocket upgrades, applying the same trust rules as Express' req.ip.
 */
export function clientIpFromUpgrade(req, trust = trustProxy) {
  const socketIp = req.socket?.remoteAddress || 'unknown';
  if (!trust) return socketIp;
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (forwarded.length === 0) return socketIp;
  if (typeof trust === 'number') {
    // Each trusted hop appends one entry; the client is the entry just before them
    return forwarded[Math.max(0, forwarded.length - trust)] || socketIp;
  }
  return forwarded[0];
}

// Baseline security headers (CSP only for the production static bundle; Vite dev needs inline scripts)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (IS_PRODUCTION) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "media-src 'self' https:",
      "connect-src 'self' ws: wss:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
  }
  next();
});

// Configurable CORS Policy
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;

const corsRejection = () => Object.assign(new Error('Origin not allowed by CORS policy'), { status: 403 });

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins) {
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(corsRejection());
    }
    // Default development & local allowance
    if (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://localhost:')
    ) {
      return callback(null, true);
    }
    return callback(corsRejection());
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

// Audio previews get their own budget: a single puzzle issues one request per clue play
const previewApiLimiter = createRateLimiter({
  windowMs: 60000,
  max: 300,
  message: 'Audio preview rate limit exceeded. Please wait a moment.'
});

app.use('/api', (req, res, next) => (req.path.startsWith('/preview/') ? next() : generalApiLimiter(req, res, next)));
app.use('/api/preview', previewApiLimiter);
app.use('/api/music/random', musicApiLimiter);
app.use('/api/puzzles/live', musicApiLimiter);

// Local audio preview streaming for generated anime OP/ED samples
const ANIME_SAMPLES_DIR = path.join(__dirname, '../data/anime_samples');
app.use('/audio/anime', express.static(ANIME_SAMPLES_DIR));

// Public health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Stable audio preview redirect. Puzzles embed /api/preview/<provider>:<id> because Deezer's
// signed preview URLs expire within minutes; each play is redirected to a freshly minted URL.
app.get('/api/preview/:ref', async (req, res) => {
  const ref = validatePreviewRef(req.params.ref);
  if (!ref) {
    return res.status(400).json({ error: 'Invalid preview reference' });
  }
  try {
    const url = await resolvePreviewRef(ref);
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(404).json({ error: 'No audio preview available for this track' });
    }
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.redirect(302, url);
  } catch (err) {
    logger.warn('preview', `Preview resolution failed for ${ref}: ${err.message}`);
    return res.status(502).json({ error: 'Audio preview provider unavailable' });
  }
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
  if (req.path === '/health' || req.path === '/music/random' || req.path.startsWith('/preview/')) {
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
const MAX_PLAYERS_PER_ROOM = 8;
// A dropped socket keeps its seat this long so the client can resume with its token
const RECONNECT_GRACE_MS = 30 * 1000;

// Generate random friendly room code with collision avoidance (16 words x 9,000 numbers)
function generateRoomCode() {
  const adjectives = ['BEAT', 'GROOVE', 'SPICE', 'VINYL', 'BASS', 'CHORD', 'SOLO', 'FUNK',
                       'TEMPO', 'RIFF', 'DROP', 'LOOP', 'VIBE', 'TUNE', 'WAVE', 'ECHO'];
  let code;
  let attempts = 0;
  do {
    const num = crypto.randomInt(1000, 10000);
    const prefix = adjectives[crypto.randomInt(adjectives.length)];
    code = `${prefix}-${num}`;
    attempts++;
  } while (rooms.has(code) && attempts < 50);
  return code;
}

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
    newHostId: room.hostId
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
  // Identity is bound to this socket on create/join; later messages never choose who they act as
  let currentPlayer = null;
  let currentRoomCode = null;

  const sendError = (message) => ws.send(JSON.stringify({ type: 'error', message }));

  function leaveCurrentRoom() {
    if (currentRoomCode && currentPlayer) {
      removePlayerFromRoom(currentRoomCode, currentPlayer);
    }
    currentPlayer = null;
    currentRoomCode = null;
  }

  function memberRoom(roomCode) {
    if (!currentPlayer || !currentRoomCode || currentRoomCode !== roomCode) return null;
    const room = rooms.get(roomCode);
    if (!room || !room.players.includes(currentPlayer) || currentPlayer.ws !== ws) return null;
    return room;
  }

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

      const parsed = JSON.parse(raw.toString());
      const validation = validateWsMessage(parsed);
      if (!validation.valid) {
        sendError(validation.error);
        return;
      }

      const data = validation.data;
      logger.ws(`Action: ${data.action} (Player: ${currentPlayer?.id || data.playerId || 'anonymous'}, Room: ${data.roomCode || 'new'})`);

      switch (data.action) {
        case 'create_room': {
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
            sharedGrid: livePuzzle.puzzle.rows && livePuzzle.puzzle.cols
              ? Array.from({ length: Math.min(30, livePuzzle.puzzle.rows) }, () => Array(Math.min(30, livePuzzle.puzzle.cols)).fill(''))
              : null,
            isStarted: false,
            players: [currentPlayer]
          };

          rooms.set(roomCode, room);

          ws.send(JSON.stringify({
            type: 'room_created',
            resumeToken: currentPlayer.resumeToken,
            room: roomSnapshot(room)
          }));
          break;
        }

        case 'join_room': {
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

          // Send complete room payload including puzzle & sharedGrid to joining player
          ws.send(JSON.stringify({
            type: 'room_joined',
            resumed: Boolean(existing),
            resumeToken: currentPlayer.resumeToken,
            room: roomSnapshot(room)
          }));

          // Notify all participants in room
          broadcastToRoom(roomCode, {
            type: 'player_joined',
            player: { id: currentPlayer.id, name: currentPlayer.name, color: currentPlayer.color, progress: currentPlayer.progress },
            players: publicPlayers(room)
          });
          break;
        }

        case 'start_game': {
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
            room: roomSnapshot(room)
          });
          break;
        }

        case 'coop_cell_update': {
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

          if (!room.sharedGrid && room.puzzle && room.puzzle.rows && room.puzzle.cols) {
            room.sharedGrid = Array.from({ length: Math.min(30, room.puzzle.rows) }, () => Array(Math.min(30, room.puzzle.cols)).fill(''));
          }
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
            playerColor: currentPlayer.color
          });
          break;
        }

        case 'race_progress_update': {
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
            players: publicPlayers(room)
          });
          break;
        }

        case 'puzzle_solved': {
          const room = memberRoom(data.roomCode);
          if (!room) {
            sendError('You are not a member of this room.');
            return;
          }
          broadcastToRoom(room.code, {
            type: 'puzzle_solved',
            winnerId: currentPlayer.id,
            winnerName: currentPlayer.name
          });
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

    // Ignore sockets that were already replaced by a resumed connection
    if (!currentRoomCode || !currentPlayer || currentPlayer.ws !== ws) return;

    const player = currentPlayer;
    const roomCode = currentRoomCode;
    player.ws = null;
    player.disconnectTimer = setTimeout(() => removePlayerFromRoom(roomCode, player), RECONNECT_GRACE_MS);
    player.disconnectTimer.unref?.();
  });
});

// Catch-all 404 for unmatched API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
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

// JSON error handler (CORS rejections, malformed/oversized bodies) instead of Express' HTML 500 page
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error('http', `Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, err.stack);
  }
  const message = status === 403 ? err.message
    : status === 413 ? 'Request body too large'
      : status === 400 ? 'Malformed request body'
        : 'Internal server error';
  res.status(status).json({ error: message });
});

// Export for test runner
export { app, server };

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  onShutdown('catalog-wal-checkpoint', () => {
    // Only checkpoint if the catalog was actually opened in this process
    peekSqliteCatalog()?.db?.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  });
  server.listen(PORT, '0.0.0.0', () => {
    logger.info('startup', `🎵 SpotySpice Backend API & WebSocket running on port ${PORT} (http://0.0.0.0:${PORT}) [env: ${process.env.NODE_ENV || 'development'}, log: ${process.env.LOG_LEVEL || 'info'}]`);
  });
}
