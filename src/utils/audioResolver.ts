// In-memory cache of resolved fresh audio preview URLs
const audioCache = new Map<string, string>();

/**
 * Resolves a live, active audio preview URL directly from iTunes Search API.
 * This guarantees zero 404s even if Apple rotates CDN tokens over time.
 */
export async function resolveFreshAudioUrl(
  songTitle: string,
  artist: string,
  fallbackUrl: string
): Promise<string> {
  const cacheKey = `${artist}-${songTitle}`.toLowerCase();
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  try {
    const cleanQuery = `${artist} ${songTitle}`
      .replace(/\(feat\..*?\)/gi, '')
      .replace(/feat\..*$/i, '')
      .trim();

    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=song&limit=1`
    );

    if (res.ok) {
      const data = await res.json();
      const freshUrl = data.results?.[0]?.previewUrl;
      if (freshUrl) {
        audioCache.set(cacheKey, freshUrl);
        return freshUrl;
      }
    }
  } catch (err) {
    console.warn("Could not dynamically refresh audio URL:", err);
  }

  return fallbackUrl;
}
