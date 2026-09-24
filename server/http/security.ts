/**
 * HTTP hardening: proxy trust, client IPs, security headers, CORS, request logging and the
 * JSON error handler.
 */
import cors from 'cors';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { IncomingMessage } from 'http';
import { logger } from '../logger.ts';

/** Express' "trust proxy" value: off, on, a hop count or a named range. */
export type TrustProxy = boolean | number | string;

/**
 * TRUST_PROXY mirrors Express' "trust proxy" setting: a hop count ("1"), "true", or a
 * named range ("loopback"). Unset means the socket address is the client address and
 * X-Forwarded-For is ignored everywhere (it is client-controlled).
 */
export function parseTrustProxy(value: string | null | undefined): TrustProxy {
  if (value === undefined || value === null || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

export const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

/**
 * Client IP for WebSocket upgrades, applying the same trust rules as Express' req.ip.
 */
export function clientIpFromUpgrade(req: IncomingMessage, trust: TrustProxy = trustProxy): string {
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
export function securityHeaders({ production }: { production: boolean }): RequestHandler {
  return (_req, res, next) => {
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

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** CORS_ALLOWED_ORIGINS as a list, or null when unset. */
export function parseAllowedOrigins(value = process.env.CORS_ALLOWED_ORIGINS): string[] | null {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : null;
}

/**
 * Browsers send Origin on same-origin POST/DELETE too, so the page's own origin (Origin's host
 * equals Host) is always allowed. Otherwise: CORS_ALLOWED_ORIGINS, or local dev origins when
 * it is unset. Requests without Origin (curl, same-origin GET) are allowed.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined, allowedOrigins: string[] | null): boolean {
  if (!origin) return true;
  try {
    if (host && new URL(origin).host === host) return true;
  } catch {
    return false;
  }
  return allowedOrigins ? allowedOrigins.includes(origin) : LOCAL_ORIGIN.test(origin);
}

export function corsPolicy(allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS) {
  const allowedOrigins = parseAllowedOrigins(allowedOriginsEnv);
  const corsRejection = (): Error => Object.assign(new Error('Origin not allowed by CORS policy'), { status: 403 });

  // The API authenticates with the X-User-Id header, never cookies, so no credentials mode
  return cors((req, callback) => {
    const allowed = isAllowedOrigin(req.headers.origin, req.headers.host, allowedOrigins);
    callback(allowed ? null : corsRejection(), { origin: allowed });
  });
}

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  // Read before routing: inside a router mounted on /api, req.path loses its /api prefix.
  // Path only: the query string carries prompts, and the user id is a bearer secret.
  const path = req.path;
  if (path.startsWith('/api')) {
    res.on('finish', () => logger.http(req.method, path, res.statusCode, Date.now() - start));
  }
  next();
};

// JSON error handler (CORS rejections, malformed/oversized bodies) instead of Express' HTML 500 page
export const jsonErrorHandler: ErrorRequestHandler = (err: Error & { status?: number; statusCode?: number }, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error('http', `Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, err.stack);
  }
  const message = status === 403 ? err.message
    : status === 413 ? 'Request body too large'
      : status === 400 ? 'Malformed request body'
        : 'Internal server error';
  res.status(status).json({ error: message });
};
