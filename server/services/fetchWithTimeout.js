/**
 * Resilient fetch wrapper with AbortController timeout and bounded exponential backoff retries.
 *
 * @param {string} url - Target URL to fetch
 * @param {RequestInit} [options={}] - Standard Fetch options
 * @param {number} [timeoutMs=6000] - Request timeout in milliseconds
 * @param {number} [retries=2] - Maximum number of retries on 5xx or network errors
 * @param {number} [backoffMs=500] - Initial backoff interval in milliseconds
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 6000, retries = 2, backoffMs = 500) {
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
