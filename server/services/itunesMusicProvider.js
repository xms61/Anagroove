import { fetchWithTimeout } from './fetchWithTimeout.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const itunesCache = new Map();

function cacheGet(key) {
  const cached = itunesCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.value;
  itunesCache.delete(key);
  return null;
}

function cacheSet(key, value) {
  itunesCache.delete(key);
  while (itunesCache.size >= MAX_CACHE_ENTRIES) {
    itunesCache.delete(itunesCache.keys().next().value);
  }
  itunesCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function resetItunesCachesForTesting() {
  itunesCache.clear();
}

export function mapItunesTrack(track) {
  if (!track?.trackId || !track?.trackName || !track?.artistName || !track?.previewUrl) {
    return null;
  }

  const albumArt = (track.artworkUrl100 || '')
    .replace('100x100bb', '600x600bb')
    .replace('100x100', '600x600');

  return {
    id: `itunes:${track.trackId}`,
    provider: 'itunes',
    providerTrackId: String(track.trackId),
    providerArtistId: String(track.artistId || ''),
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName || 'Single',
    albumArt,
    audioUrl: track.previewUrl,
    providerUrl: track.trackViewUrl || '',
    rank: 0,
    fans: 0,
    selection: {
      source: 'itunes',
      genre: track.primaryGenreName || '',
      releaseDate: track.releaseDate || '',
    },
  };
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, {}, 6000, 2);
  if (!response.ok) throw new Error(`iTunes returned ${response.status}`);
  return response.json();
}

export const itunesMusicProvider = {
  name: 'itunes',

  async getCandidateTracks({ query = '', limit = 50, country = 'US' } = {}) {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) return [];

    // For anime and kpop, don't restrict to US storefront so Japanese/Korean OSTs are discoverable
    const isSpecialGenre = /\b(anime|kpop|k-pop|japanese|korean)\b/i.test(trimmed);
    const countryParam = isSpecialGenre || !country ? '' : `&country=${country}`;
    const cacheKey = `${trimmed}:${limit}:${countryParam}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&entity=song&limit=${Math.min(100, Math.max(10, limit))}${countryParam}`;
      const data = await fetchJson(url);
      const results = Array.isArray(data?.results) ? data.results : [];

      const candidates = results
        .map(mapItunesTrack)
        .filter(Boolean);

      return cacheSet(cacheKey, candidates);
    } catch (err) {
      console.warn(`[iTunes Provider] Search query "${trimmed}" failed:`, err.message);
      return [];
    }
  },
};
