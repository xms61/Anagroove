import { logger } from '../logger.ts';

/** A request-path caller would wait longer than it allows for a provider token. */
export class ProviderBudgetError extends Error {
  constructor() {
    super('Provider request budget exhausted');
    this.name = 'ProviderBudgetError';
  }
}

/** `refillRatePerSec` tokens are added per second, up to a burst of `maxTokens`. */
export class TokenBucketRateLimiter {
  refillRatePerSec: number;
  maxTokens: number;
  tokens: number;
  lastRefill: number;

  constructor({ refillRatePerSec = 5, maxTokens = 10 } = {}) {
    this.refillRatePerSec = refillRatePerSec;
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSec * this.refillRatePerSec);
      this.lastRefill = now;
    }
  }

  /** Waits for a token; throws ProviderBudgetError when the wait would pass `maxWaitMs`. */
  async acquireToken({ maxWaitMs = Infinity }: { maxWaitMs?: number } = {}): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Calculate sleep time needed to get at least 1 token
      const tokensNeeded = 1 - this.tokens;
      const waitMs = Math.ceil((tokensNeeded / this.refillRatePerSec) * 1000);
      if (Date.now() + waitMs > deadline) throw new ProviderBudgetError();
      await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, 25)));
    }
  }
}

// Configured rate limiters honoring provider thresholds:
// Deezer: 5 requests/sec safe limit (threshold: 10/sec)
export const deezerRateLimiter = new TokenBucketRateLimiter({
  refillRatePerSec: 5,
  maxTokens: 8,
});

// iTunes: ~15 requests/min safe limit (1 req every ~4 sec)
export const itunesRateLimiter = new TokenBucketRateLimiter({
  refillRatePerSec: 0.25,
  maxTokens: 3,
});

const DEFAULT_USER_AGENT = 'Anagroove-MusicIndexer/1.0 (+https://github.com/xms61/Anagroove)';

/** Longest Retry-After a 429 may impose before the next attempt. */
const MAX_RETRY_AFTER_SEC = 30;

export interface PoliteFetchOptions {
  rateLimiter?: TokenBucketRateLimiter | null;
  maxRetries?: number;
  /** Per attempt: a provider that stops answering fails instead of holding the caller. */
  timeoutMs?: number;
  /** Longest wait for a rate-limiter token (request paths); scripts wait as long as it takes. */
  maxWaitMs?: number;
}

/**
 * Executes a polite fetch with rate limiting, a per-attempt timeout and retry on 429/5xx.
 */
export async function politeFetch(
  url: string,
  options: RequestInit = {},
  { rateLimiter = null, maxRetries = 3, timeoutMs = 20000, maxWaitMs = Infinity }: PoliteFetchOptions = {},
): Promise<Response> {
  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    ...(options.headers as Record<string, string> | undefined),
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (rateLimiter) {
      await rateLimiter.acquireToken({ maxWaitMs });
    }

    try {
      const signals = [AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])];
      const response = await fetch(url, { ...options, headers, signal: AbortSignal.any(signals) });

      if (response.status === 429) {
        // Rate limited - inspect Retry-After header or apply backoff
        const retryAfterSec = Math.min(parseInt(response.headers.get('Retry-After') || '5', 10) || 5, MAX_RETRY_AFTER_SEC);
        const backoffMs = Math.max(retryAfterSec * 1000, 2000 * Math.pow(2, attempt)) + Math.random() * 500;
        logger.warn('rate_limiter', `HTTP 429 Too Many Requests for ${url}. Backing off for ${Math.round(backoffMs)}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        const backoffMs = 1000 * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoffMs = 1000 * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      } else {
        throw err;
      }
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts.`);
}
