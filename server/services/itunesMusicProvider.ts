import { fetchWithTimeout } from './fetchWithTimeout.ts';
import { errorMessage } from '../errors.ts';
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

export function detectStorefront(query = ''): string {
  const q = String(query).toLowerCase();
  if (/\b(japanese|japan|city\s*pop|citypop|j-pop|jpop|anime|shibuya-kei|kayokyoku|enka)\b/i.test(q)) {
    return 'JP';
  }
  if (/\b(kpop|k-pop)\b/i.test(q)) {
    return 'US';
  }
  if (/\b(korean|korea|trot|hallyu)\b/i.test(q)) {
    return 'KR';
  }
  if (/\b(britpop|uk\s*garage|grime|uk\s*drill|madchester|shoegaze)\b/i.test(q)) {
    return 'GB';
  }
  return 'US';
}

export function mapItunesTrack(track: ItunesApiTrack | null | undefined, storefront = ''): SongCandidate | null {
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
      storefront,
    },
  };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<{ results?: ItunesApiTrack[] }> {
  const response = await fetchWithTimeout(url, { signal }, 6000, 2);
  if (!response.ok) throw new Error(`iTunes returned ${response.status}`);
  return response.json() as Promise<{ results?: ItunesApiTrack[] }>;
}

export const itunesMusicProvider = {
  name: 'itunes',

  async getCandidateTracks({ query = '', limit = 50, country, signal }: { query?: string; limit?: number; country?: string; signal?: AbortSignal } = {}): Promise<SongCandidate[]> {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) return [];

    const effectiveCountry = country !== undefined ? country : detectStorefront(trimmed);
    const countryParam = effectiveCountry ? `&country=${effectiveCountry}` : '';
    const cacheKey = `${trimmed}:${limit}:${effectiveCountry}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&entity=song&limit=${Math.min(100, Math.max(10, limit))}${countryParam}`;
      const data = await fetchJson(url, signal);
      const results = Array.isArray(data?.results) ? data.results : [];

      const candidates = results
        .map(track => mapItunesTrack(track, effectiveCountry))
        .filter((track): track is SongCandidate => Boolean(track));

      return cacheSet(cacheKey, candidates);
    } catch (err) {
      console.warn(`[iTunes Provider] Search query "${trimmed}" failed:`, errorMessage(err));
      return [];
    }
  },
};
