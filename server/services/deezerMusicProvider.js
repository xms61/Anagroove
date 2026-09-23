import { fetchWithTimeout } from './fetchWithTimeout.js';
import { shuffleArray } from '../../shared/shuffle.ts';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const trackCache = new Map();
const artistCache = new Map();

function cacheGet(cache, key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.value;
  cache.delete(key);
  return null;
}

function cacheSet(cache, key, value) {
  // Reinserting a key makes refreshed entries newest; eviction is FIFO.
  cache.delete(key);
  while (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function resetDeezerCachesForTesting() {
  trackCache.clear();
  artistCache.clear();
}

export function getDeezerCacheStatsForTesting() {
  return { trackEntries: trackCache.size, artistEntries: artistCache.size };
}

export function mapDeezerTrack(track, artistDetails = track.artist) {
  if (!track?.id || !track?.artist?.id || !track.preview || !track.title || !track.artist.name) return null;

  // Filter out audiobooks, spoken radio drama episodes, and raw file rips
  const lowerTitle = track.title.toLowerCase().trim();
  if (/^(kapitel|folge|chapter|hörspiel|audiobook)\s*\d+/i.test(lowerTitle)) return null;
  if (/\.(flac|mp3|wav|m4a)\b/i.test(lowerTitle)) return null;

  return {
    id: `deezer:${track.id}`,
    provider: 'deezer',
    providerTrackId: String(track.id),
    providerArtistId: String(track.artist.id),
    title: track.title,
    artist: track.artist.name,
    album: track.album?.title || 'Single',
    albumArt: track.album?.cover_big || track.album?.cover_medium || '',
    audioUrl: track.preview,
    providerUrl: track.link || `https://www.deezer.com/track/${track.id}`,
    rank: Number(track.rank) || 0,
    fans: Number(artistDetails?.nb_fan ?? artistDetails?.fans) || 0,
    contributorArtistIds: Array.isArray(track.contributors) ? track.contributors.map(c => String(c.id)) : [],
    releaseDate: track.release_date || track.album?.release_date || '',
    // Kept so fallback results can be written to the catalog (selection/candidates.js)
    durationMs: Number(track.duration) > 0 ? Number(track.duration) * 1000 : null,
    isrc: track.isrc || null,
    albumId: track.album?.id ? String(track.album.id) : null,
    selection: {
      source: 'deezer',
      rank: Number(track.rank) || 0,
      artistFans: Number(artistDetails?.nb_fan ?? artistDetails?.fans) || 0,
    },
  };
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, {}, 6000, 2);
  if (!response.ok) throw new Error(`Deezer returned ${response.status}`);
  return response.json();
}

async function getArtistDetails(artistId) {
  const cacheKey = String(artistId);
  const cached = cacheGet(artistCache, cacheKey);
  if (cached) return cached;
  return cacheSet(artistCache, cacheKey, await fetchJson(`https://api.deezer.com/artist/${encodeURIComponent(cacheKey)}`));
}

export const DEEZER_GENRE_TAXONOMY = {
  all: { chartId: 0, searches: [], minFans: 250000, minRank: 350000 },
  mixed: { chartId: 0, searches: [], minFans: 250000, minRank: 350000 },
  pop: { chartId: 132, searches: ['genre:"pop"'], minFans: 200000, minRank: 350000 },
  rock: { chartId: 152, searches: ['genre:"rock"'], minFans: 150000, minRank: 300000 },
  hiphop: { chartId: 116, searches: ['genre:"rap"', 'genre:"hip hop"', 'hip hop classics'], minFans: 150000, minRank: 300000 },
  edm: { chartId: 113, searches: ['genre:"dance"', 'genre:"electro"', 'electronic dance music'], minFans: 100000, minRank: 250000 },
  electronic: { chartId: 113, searches: ['genre:"dance"', 'genre:"electro"', 'electronic dance music'], minFans: 100000, minRank: 250000 },
  kpop: { chartId: null, searches: ['k-pop', 'kpop', 'genre:"k-pop"'], minFans: 25000, minRank: 200000 },
  anime: { chartId: null, searches: ['anime opening theme', 'anime ending theme', 'anime ost', 'tv anime opening'], minFans: 25000, minRank: 200000 },
  gaming: { chartId: 173, searches: ['video game soundtrack', 'video game music', 'original video game score'], minFans: 1000, minRank: 150000 },
  cinematic: { chartId: 173, searches: ['film score', 'motion picture soundtrack', 'cinematic score'], minFans: 1000, minRank: 150000 },
  poppunk: { chartId: 85, searches: ['pop punk', 'midwest emo', 'emo punk'], minFans: 50000, minRank: 250000 },
  indie: { chartId: 85, searches: ['genre:"alternative"', 'indie rock'], minFans: 50000, minRank: 250000 },
  rnb: { chartId: 165, searches: ['genre:"r&b"', 'soul classics'], minFans: 100000, minRank: 250000 },
  metal: { chartId: 464, searches: ['genre:"metal"', 'heavy metal'], minFans: 100000, minRank: 250000 },
  country: { chartId: 84, searches: ['genre:"country"'], minFans: 100000, minRank: 250000 },
  jazz: { chartId: 129, searches: ['genre:"jazz"', 'genre:"blues"'], minFans: 25000, minRank: 150000 },
  jpop: { chartId: null, searches: ['j-pop', 'japanese city pop', 'j-rock'], minFans: 25000, minRank: 200000 },
};

/**
 * Small provider boundary for live selection. The current application has one
 * provider, so this deliberately exposes only the candidate operation it uses.
 */
export const deezerMusicProvider = {
  name: 'deezer',

  async getCandidateTracks({
    genre = 'all',
    limit = 50,
    minFans = 250000,
    maxFans = Infinity,
    minRank = 0,
    maxRank = Infinity,
    searches = [],
    offset = 0,
    popularity = 'balanced',
  } = {}) {
    const normalizedGenre = typeof genre === 'string' ? genre.toLowerCase().trim() : 'all';
    const genreConfig = DEEZER_GENRE_TAXONOMY[normalizedGenre] || {
      chartId: 0,
      searches: [normalizedGenre],
      minFans: 50000,
      minRank: 250000,
    };

    const isPure = popularity === 'pure';
    const thresholdFans = isPure ? 0 : Math.min(minFans, genreConfig.minFans);
    const thresholdRank = isPure ? 0 : Math.max(minRank, genreConfig.minRank);
    const customSearches = Array.isArray(searches) && searches.length > 0 ? searches : genreConfig.searches;
    const cacheKey = `${normalizedGenre}:${customSearches.join(',')}:${offset}:${limit}:${thresholdFans}:${thresholdRank}:${maxFans}:${maxRank}:${popularity}`;
    const cached = cacheGet(trackCache, cacheKey);
    if (cached) return cached;

    const requests = [];
    if (customSearches.length === 0 && genreConfig.chartId !== null && genreConfig.chartId !== undefined && !isPure) {
      requests.push(fetchJson(`https://api.deezer.com/chart/${genreConfig.chartId}/tracks?limit=100`));
    }
    for (const query of customSearches) {
      const searchUrl = offset > 0
        ? `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=100&index=${offset}`
        : `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=100`;
      requests.push(fetchJson(searchUrl));
    }
    if (requests.length === 0) {
      requests.push(fetchJson('https://api.deezer.com/chart/0/tracks?limit=100'));
    }

    const results = await Promise.all(requests);
    const rawTracks = results.flatMap(result => Array.isArray(result?.data) ? result.data : []);
    const uniqueTracks = shuffleArray(
      [...new Map(rawTracks.map(track => [String(track.id), track])).values()]
        .filter(track => track.preview && track.title && track.artist?.id && track.artist?.name)
    );

    const candidates = [];
    const relaxedCandidates = [];

    for (const track of uniqueTracks) {
      let artist;
      try {
        artist = await getArtistDetails(track.artist.id);
      } catch {
        continue;
      }
      const mapped = mapDeezerTrack(track, artist);
      if (!mapped) continue;

      const withinFans = isPure || (mapped.fans >= thresholdFans && mapped.fans <= maxFans);
      const withinRank = isPure || (mapped.rank >= thresholdRank && mapped.rank <= maxRank);

      if (withinFans && withinRank) {
        candidates.push(mapped);
        if (candidates.length >= limit) break;
      } else {
        relaxedCandidates.push(mapped);
      }
    }

    // Safety fallback: if strict fan/rank filters yielded fewer than Math.min(6, limit)
    // tracks, use relaxed candidates to avoid puzzle generation shortages.
    if (candidates.length < Math.min(6, limit) && relaxedCandidates.length > 0) {
      for (const track of relaxedCandidates) {
        candidates.push(track);
        if (candidates.length >= limit) break;
      }
    }

    return candidates.length > 0 ? cacheSet(trackCache, cacheKey, candidates) : candidates;
  },
};
