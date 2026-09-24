import './config.ts';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRateLimiter } from './middleware/rateLimiter.ts';
import { createLivePuzzleStore } from './http/livePuzzleStore.ts';
import {
  clientIpFromUpgrade,
  corsPolicy,
  jsonErrorHandler,
  parseTrustProxy,
  requestLogger,
  securityHeaders,
  trustProxy,
} from './http/security.ts';
import { createMusicRouter } from './routes/music.ts';
import { createUserRouter } from './routes/user.ts';
import { attachMultiplayer } from './ws/rooms.ts';
import { peekSqliteCatalog } from './db/sqliteCatalog.ts';
import { onShutdown } from './shutdown.ts';
import { logger } from './logger.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 3000 : 3001);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
const livePuzzles = createLivePuzzleStore();

app.set('trust proxy', trustProxy);
app.disable('x-powered-by');
app.use(securityHeaders({ production: IS_PRODUCTION }));
app.use(corsPolicy());
app.use(express.json({ limit: '256kb' }));
app.use(requestLogger);

// Sliding-window rate limits. Audio previews get their own budget: a puzzle issues one
// request per clue play.
const generalApiLimiter = createRateLimiter({ windowMs: 60000, max: 120 });
const musicApiLimiter = createRateLimiter({
  windowMs: 60000,
  max: 30,
  message: 'Music pool generation rate limit exceeded. Please wait a moment.',
});
const previewApiLimiter = createRateLimiter({
  windowMs: 60000,
  max: 300,
  message: 'Audio preview rate limit exceeded. Please wait a moment.',
});
app.use('/api', (req, res, next) => (req.path.startsWith('/preview/') ? next() : generalApiLimiter(req, res, next)));
app.use('/api/preview', previewApiLimiter);
app.use('/api/music/random', musicApiLimiter);
app.use('/api/puzzles/live', musicApiLimiter);

// Local audio for generated anime OP/ED samples
app.use('/audio/anime', express.static(path.join(__dirname, '../data/anime_samples')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Public music routes first; everything after the user router needs X-User-Id
app.use('/api', createMusicRouter({ livePuzzles }));
app.use('/api', createUserRouter());
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Static frontend in production
if (IS_PRODUCTION) {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(jsonErrorHandler);

const server = http.createServer(app);
attachMultiplayer(server, { livePuzzles });
server.on('close', () => livePuzzles.clear());

// Exported for the test runner
export { app, server, createLivePuzzleStore, parseTrustProxy, clientIpFromUpgrade };

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  onShutdown('catalog-wal-checkpoint', () => {
    // Only checkpoint if the catalog was actually opened in this process
    peekSqliteCatalog()?.db?.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  });
  server.listen(PORT, '0.0.0.0', () => {
    logger.info('startup', `🎵 Anagroove Backend API & WebSocket running on port ${PORT} (http://0.0.0.0:${PORT}) [env: ${process.env.NODE_ENV || 'development'}, log: ${process.env.LOG_LEVEL || 'info'}]`);
  });
}
