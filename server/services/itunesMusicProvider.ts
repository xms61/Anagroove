import { fetchWithTimeout } from './fetchWithTimeout.ts';
import { errorMessage } from '../errors.ts';
import { canonicalArtistKey } from '../../shared/musicIdentity.ts';
import type { SongCandidate } from '../types.ts';

/** A song as the iTunes Search API returns it. */
export interface ItunesApiTrack {
  trackId?: number;
  trackName?: string;
  artistId?: number;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  releaseDate?: string;
  primaryGenreName?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const itunesCache = new Map<string, { value: SongCandidate[]; expiresAt: number }>();

function cacheGet(key: string): SongCandidate[] | null {
  const cached = itunesCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.value;
  itunesCache.delete(key);
  return null;
}

function cacheSet(key: string, value: SongCandidate[]): SongCandidate[] {
  itunesCache.delete(key);
  while (itunesCache.size >= MAX_CACHE_ENTRIES) {
    itunesCache.delete(itunesCache.keys().next().value!);
  }
  itunesCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function mapItunesTrack(track: ItunesApiTrack | null | undefined): SongCandidate | null {
  if (!track?.trackId || !track?.trackName || !track?.artistName || !track?.previewUrl) {
    return null;
  }

  // Filter out audiobooks, spoken radio drama episodes, and raw file rips
  const lowerTitle = track.trackName.toLowerCase().trim();
  if (/^(kapitel|folge|chapter|hörspiel|audiobook)\s*\d+/i.test(lowerTitle)) return null;
  if (/\.(flac|mp3|wav|m4a)\b/i.test(lowerTitle)) return null;

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
    releaseDate: track.releaseDate || '',
    selection: {
      source: 'itunes',
      genre: track.primaryGenreName || '',
      releaseDate: track.releaseDate || '',
    },
  };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<{ results?: ItunesApiTrack[] }> {
  const response = await fetchWithTimeout(url, { signal }, 6000, 2);
  if (!response.ok) throw new Error(`iTunes returned ${response.status}`);
  return response.json() as Promise<{ results?: ItunesApiTrack[] }>;
}

/** Live iTunes candidates for a named artist: an artist search, then only that artist's songs. */
export const itunesMusicProvider = {
  name: 'itunes',

  async getCandidateTracks({ artist = '', limit = 50, signal }: { artist?: string; limit?: number; signal?: AbortSignal } = {}): Promise<SongCandidate[]> {
    const wanted = canonicalArtistKey(artist);
    if (!wanted) return [];
    const cacheKey = `${wanted}:${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist.trim())}&entity=song&attribute=artistTerm&limit=${Math.min(100, Math.max(10, limit))}`;
      const data = await fetchJson(url, signal);
      const candidates = (Array.isArray(data?.results) ? data.results : [])
        .filter(track => canonicalArtistKey(track.artistName || '') === wanted)
        .map(track => mapItunesTrack(track))
        .filter((track): track is SongCandidate => Boolean(track));
      return cacheSet(cacheKey, candidates);
    } catch (err) {
      console.warn(`[iTunes Provider] Artist search "${artist}" failed:`, errorMessage(err));
      return [];
    }
  },
};
