import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db.js';
import { getRandomSongPool } from './services/musicService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001);

app.use(cors());
app.use(express.json());

// Public health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Truly randomized recognizable music pool
app.get('/api/music/random', async (req, res) => {
  try {
    const genre = String(req.query.genre || 'all');
    const minFans = parseInt(req.query.minFans) || 250000;
    const count = parseInt(req.query.count) || 25;
    const recentIds = req.query.recent ? String(req.query.recent).split(',') : [];
    const userId = req.headers['x-user-id'] || req.query.userId;
    
    let userBlacklist = [];
    if (userId) {
      userBlacklist = db.getBlacklist(String(userId));
    }

    const songs = await getRandomSongPool({
      genre,
      minFans,
      count,
      blacklist: userBlacklist,
      recentIds
    });

    res.json({ success: true, count: songs.length, songs });
  } catch (err) {
    console.error('Error generating random music pool:', err);
    res.status(500).json({ error: 'Failed to generate recognizable song pool' });
  }
});

// Anonymous User ID Middleware for stateful endpoints
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/music/random') {
    return next();
  }
  const userId = req.headers['x-user-id'] || req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Missing X-User-Id header' });
  }
  req.userId = String(userId);
  next();
});

// Progress persistence
app.get('/api/progress', (req, res) => {
  const progress = db.getProgress(req.userId);
  res.json({ progress });
});

app.post('/api/progress', (req, res) => {
  const { puzzleId, themeId, userLetters, validity } = req.body;
  if (!puzzleId || !userLetters) {
    return res.status(400).json({ error: 'Missing progress payload' });
  }
  const saved = db.saveProgress(req.userId, {
    puzzleId,
    themeId: themeId || 'mixed',
    userLetters,
    validity: validity || []
  });
  res.json({ success: true, progress: saved });
});

// Solved puzzles history
app.get('/api/history', (req, res) => {
  const history = db.getSolvedHistory(req.userId);
  res.json({ history });
});

app.post('/api/history/solved', (req, res) => {
  const { puzzleId, title, cluesCount, timeSeconds } = req.body;
  if (!puzzleId) {
    return res.status(400).json({ error: 'Missing puzzleId' });
  }
  const history = db.recordSolvedPuzzle(req.userId, {
    puzzleId,
    title: title || 'Untitled Puzzle',
    cluesCount: cluesCount || 0,
    timeSeconds: timeSeconds || 0
  });
  res.json({ success: true, history });
});

// Blacklist API
app.get('/api/blacklist', (req, res) => {
  const blacklist = db.getBlacklist(req.userId);
  res.json({ blacklist });
});

app.post('/api/blacklist', (req, res) => {
  const { name, type } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Missing name or type' });
  }
  const list = db.addBlacklistItem(req.userId, { name, type });
  res.json({ success: true, blacklist: list });
});

app.delete('/api/blacklist/:id', (req, res) => {
  const list = db.removeBlacklistItem(req.userId, req.params.id);
  res.json({ success: true, blacklist: list });
});

// -------------------------------------------------------------
// WebSocket Server for Multiplayer Lobby (Co-op & Versus Race)
// -------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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
  '#06b6d4', // Cyan
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

wss.on('connection', (ws) => {
  let currentPlayer = null;
  let currentRoomCode = null;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.action) {
        case 'create_room': {
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
            mode: data.mode || 'coop', // 'coop' | 'race'
            puzzle: data.puzzle || null,
            sharedGrid: data.puzzle
              ? Array.from({ length: data.puzzle.rows }, () => Array(data.puzzle.cols).fill(''))
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
            if (data.puzzle) {
              room.puzzle = data.puzzle;
              room.sharedGrid = Array.from({ length: data.puzzle.rows }, () => Array(data.puzzle.cols).fill(''));
            }
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
            const char = data.char !== undefined ? data.char : (data.value !== undefined ? data.value : '');
            const playerId = data.playerId || data.senderId;
            const playerName = data.playerName || 'Player';
            const playerColor = data.playerColor || '#f59e0b';
            const { row, col } = data;

            if (!room.sharedGrid && room.puzzle) {
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
              winnerName: data.playerName
            });
          }
          break;
        }
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.players = room.players.filter(p => p.id !== currentPlayer?.id);
        if (room.players.length === 0) {
          rooms.delete(currentRoomCode);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 SpotySpice Backend API & WebSocket running on port ${PORT} (http://0.0.0.0:${PORT})`);
});
