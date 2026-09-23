/**
 * In-memory sliding window rate limiter middleware for Express and WebSocket throttling.
 */

/**
 * Creates an Express sliding-window rate limiter middleware.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests allowed in the window
 * @param {string} [options.message] - Custom error message
 */
export function createRateLimiter({ windowMs = 60000, max = 100, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map();

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
      return res.status(429).json({ error: message });
    }

    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

/**
 * WebSocket IP connection tracker
 */
const ipConnections = new Map();

export const wsRateLimiter = {
  checkConnection(ip, max = 15) {
    const count = ipConnections.get(ip) || 0;
    if (count >= max) return false;
    ipConnections.set(ip, count + 1);
    return true;
  },

  releaseConnection(ip) {
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
  createMessageTracker(maxPerSec = 30) {
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
