/**
 * In-memory sliding window rate limiter middleware for Express and WebSocket throttling.
 */
import type { RequestHandler } from 'express';

/** An Express sliding-window rate limiter: at most `max` requests per IP in `windowMs`. */
export function createRateLimiter({ windowMs = 60000, max = 100, message = 'Too many requests, please try again later.' }: {
  windowMs?: number;
  max?: number;
  message?: string;
} = {}): RequestHandler {
  const hits = new Map<string, number[]>();

  // Periodic cleanup every minute
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    // req.ip honours Express 'trust proxy'; never read X-Forwarded-For directly (spoofable)
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    const timestamps = hits.get(ip) || [];
    const windowStart = now - windowMs;
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      res.status(429).json({ error: message });
      return;
    }

    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

/**
 * Failures per key (an IP) in a sliding window: `allow` is false once `max` failures are recent.
 * Stale keys are swept every window; `stop` ends the sweep.
 */
export function createFailureCounter({ windowMs, max }: { windowMs: number; max: number }) {
  const failures = new Map<string, number[]>();
  const recent = (key: string): number[] => (failures.get(key) || []).filter(t => Date.now() - t < windowMs);

  const sweep = setInterval(() => {
    for (const key of failures.keys()) {
      const kept = recent(key);
      if (kept.length === 0) failures.delete(key);
      else failures.set(key, kept);
    }
  }, windowMs);
  sweep.unref();

  return {
    allow: (key: string): boolean => recent(key).length < max,
    record: (key: string): void => {
      failures.set(key, [...recent(key), Date.now()]);
    },
    stop: (): void => clearInterval(sweep),
  };
}

/**
 * WebSocket IP connection tracker
 */
const ipConnections = new Map<string, number>();

export const wsRateLimiter = {
  checkConnection(ip: string, max = 15): boolean {
    const count = ipConnections.get(ip) || 0;
    if (count >= max) return false;
    ipConnections.set(ip, count + 1);
    return true;
  },

  releaseConnection(ip: string): void {
    const count = ipConnections.get(ip) || 0;
    if (count <= 1) {
      ipConnections.delete(ip);
    } else {
      ipConnections.set(ip, count - 1);
    }
  },

  /**
   * Tracks message frequency per socket
   */
  createMessageTracker(maxPerSec = 30): () => boolean {
    let windowStart = Date.now();
    let messageCount = 0;

    return () => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        messageCount = 1;
        return true;
      }
      messageCount++;
      return messageCount <= maxPerSec;
    };
  }
};
