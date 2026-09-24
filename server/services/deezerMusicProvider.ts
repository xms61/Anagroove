import { fetchWithTimeout } from './fetchWithTimeout.ts';
import { canonicalArtistKey } from '../../shared/musicIdentity.ts';
import type { SongCandidate } from '../types.ts';

/** A track as the Deezer API returns it (search, chart and track endpoints). */
export interface DeezerApiTrack {
  id?: number;
  title?: string;
  preview?: string;
  link?: string;
  rank?: number;
  duration?: number;
  isrc?: string;
  explicit_lyrics?: boolean;
  release_date?: string;
  artist?: { id?: number; name?: string; nb_fan?: number; fans?: number };
  album?: { id?: number; title?: string; cover_big?: string; cover_medium?: string; release_date?: string };
  contributors?: { id: number }[];
}

type DeezerArtist = { nb_fan?: number; fans?: number } | undefined;

type Cache<T> = Map<string, { value: T; expiresAt: number }>;

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const trackCache: Cache<SongCandidate[]> = new Map();
const artistCache: Cache<DeezerArtist> = new Map();

function cacheGet<T>(cache: Cache<T>, key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.value;
  cache.delete(key);
  return null;
}

function cacheSet<T>(cache: Cache<T>, key: string, value: T): T {
  // Reinserting a key makes refreshed entries newest; eviction is FIFO.
  cache.delete(key);
  while (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value!);
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

export function mapDeezerTrack(track: DeezerApiTrack, artistDetails: DeezerArtist = track.artist): SongCandidate & { providerTrackId: string; fans: number; rank: number } | null {
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
    // Kept so fallback results can be written to the catalog (selection/candidates.ts)
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

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithTimeout(url, { signal }, 6000, 2);
  if (!response.ok) throw new Error(`Deezer returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function getArtistDetails(artistId: number, signal?: AbortSignal): Promise<DeezerArtist> {
  const cacheKey = String(artistId);
  const cached = cacheGet(artistCache, cacheKey);
  if (cached) return cached;
  return cacheSet(artistCache, cacheKey, await fetchJson<DeezerArtist>(`https://api.deezer.com/artist/${encodeURIComponent(cacheKey)}`, signal));
}

/**
 * Live Deezer candidates for a prompt that names an artist the catalog knows too little of.
 * A plain search (the advanced `artist:"…"` filter returns unrelated results), then only the
 * tracks credited to that artist.
 */
export const deezerMusicProvider = {
  name: 'deezer',

  async getCandidateTracks({ artist = '', limit = 50, signal }: { artist?: string; limit?: number; signal?: AbortSignal } = {}): Promise<SongCandidate[]> {
    const wanted = canonicalArtistKey(artist);
    if (!wanted) return [];
    const cacheKey = `${wanted}:${limit}`;
    const cached = cacheGet(trackCache, cacheKey);
    if (cached) return cached;

    const result = await fetchJson<{ data?: DeezerApiTrack[] }>(`https://api.deezer.com/search?q=${encodeURIComponent(artist.trim())}&limit=100`, signal);
    const byArtist = (result?.data || []).filter((track): track is DeezerApiTrack & { artist: { id: number; name: string } } =>
      Boolean(track.preview && track.title && track.artist?.id && track.artist.name && canonicalArtistKey(track.artist.name) === wanted));

    const candidates: SongCandidate[] = [];
    for (const track of byArtist) {
      if (signal?.aborted || candidates.length >= limit) break;
      let details: DeezerArtist;
      try {
        details = await getArtistDetails(track.artist.id, signal);
      } catch {
        continue;
      }
      const mapped = mapDeezerTrack(track, details);
      if (mapped) candidates.push(mapped);
    }
    return candidates.length > 0 ? cacheSet(trackCache, cacheKey, candidates) : candidates;
  },
};
