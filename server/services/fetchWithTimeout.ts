/**
 * fetch with an AbortController timeout, retrying 5xx responses and network errors with
 * exponential backoff (backoffMs, 2×, 4×, …).
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000, retries = 2, backoffMs = 500): Promise<Response> {
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timer);

      // Retry on server errors (5xx) if retries remaining
      if (!response.ok && response.status >= 500 && attempt < retries) {
        attempt++;
        const waitTime = backoffMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timer);

      if (attempt < retries) {
        attempt++;
        const waitTime = backoffMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      throw err;
    }
  }
}
