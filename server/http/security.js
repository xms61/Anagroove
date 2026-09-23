/**
 * HTTP hardening: proxy trust, client IPs, security headers, CORS, request logging and the
 * JSON error handler.
 */
import cors from 'cors';
import { logger } from '../logger.js';

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

export const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

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
export function securityHeaders({ production }) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) {
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
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
  };
}

// CORS_ALLOWED_ORIGINS (comma-separated) in production; localhost origins otherwise
export function corsPolicy(allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS) {
  const allowedOrigins = allowedOriginsEnv ? allowedOriginsEnv.split(',').map(s => s.trim()) : null;
  const corsRejection = () => Object.assign(new Error('Origin not allowed by CORS policy'), { status: 403 });

  return cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins) {
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(corsRejection());
      }
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('https://localhost:')
      ) {
        return callback(null, true);
      }
      return callback(corsRejection());
    },
    credentials: true,
  });
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      const user = req.userId || req.headers['x-user-id'];
      logger.http(req.method, req.originalUrl || req.url, res.statusCode, Date.now() - start, user ? `user: ${user}` : '');
    }
  });
  next();
}

// JSON error handler (CORS rejections, malformed/oversized bodies) instead of Express' HTML 500 page
export function jsonErrorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error('http', `Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, err.stack);
  }
  const message = status === 403 ? err.message
    : status === 413 ? 'Request body too large'
      : status === 400 ? 'Malformed request body'
        : 'Internal server error';
  res.status(status).json({ error: message });
}
