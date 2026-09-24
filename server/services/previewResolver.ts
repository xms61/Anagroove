import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { deezerRateLimiter, itunesRateLimiter, politeFetch } from '../crawler/rateLimiter.js';
import { logger } from '../logger.js';
import { isOfflineMode } from '../offline.ts';
import { baseTitleKey, stripVersionTags } from '../db/trackNormalization.js';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { errorMessage } from '../errors.ts';
import type { SongCandidate } from '../types.ts';

/** A playable preview URL and where it came from. */
export interface ResolvedPreview {
  url: string;
  provider: string;
  providerTrackId?: string;
  codec: string;
  source: string;
}

type CachedPreview = { url: string } & Partial<ResolvedPreview>;

/** Any song shape a preview can be resolved for (candidate, catalog row, Deezer track). */
export type PreviewTrack = Partial<SongCandidate> & {
  deezer_id?: string | number | null;
  itunes_id?: string | number | null;
  audio_codec?: string;
};

interface DeezerTrackJson {
  id?: number;
  error?: unknown;
  preview?: string;
  title?: string;
  isrc?: string;
  artist?: { name?: string };
}

interface ItunesJson {
  results?: { previewUrl?: string; trackId?: number }[];
}

/** The catalog calls this module makes (SqliteCatalog). */
interface PreviewCatalog {
  getPreviewLookup?(id: number): { id: number; title: string; artist: string; isrc: string | null; deezer_id: string | null } | null;
  insertSample(trackId: number, sample: {
    provider: string;
    providerTrackId: string;
    sampleUrl: string;
    audioCodec: string;
    sampleDurationSec: number;
    httpStatus: number;
  }): void;
}

type Fetch = (url: string, options: RequestInit, retry: { rateLimiter: unknown; maxRetries: number }) => Promise<Response | null>;

// sqliteCatalog.js and rateLimiter.js are still JavaScript; their inferred types are narrower than the code (T7)
const defaultCatalog = sqliteCatalog as unknown as PreviewCatalog;
const defaultFetch = politeFetch as unknown as Fetch;

// Bounded in-memory preview cache to avoid duplicate network fetches during active gameplay
const inMemoryPreviewCache = new Map<string, { value: CachedPreview; expiresAt: number }>();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour upper bound (stable iTunes URLs)
// Treat signed URLs as stale this long before their real expiry so playback never starts on a dying link
const EXPIRY_MARGIN_MS = 60 * 1000;

let fetchImpl: Fetch = defaultFetch;

export function setPreviewFetchForTesting(fn: Fetch | null = null): void {
  fetchImpl = fn || defaultFetch;
}

/**
 * Deezer preview URLs are signed (`hdnea=exp=<unix seconds>~...`) and only live for minutes.
 * Returns the expiry in epoch milliseconds, or null for unsigned (stable) URLs such as iTunes.
 */
export function parsePreviewExpiry(url: unknown): number | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/[?&~]hdnea=exp=(\d{9,11})/) || url.match(/[?&]exp=(\d{9,11})/);
  return match ? parseInt(match[1], 10) * 1000 : null;
}

export function isPreviewUrlFresh(url: unknown, { now = Date.now(), marginMs = EXPIRY_MARGIN_MS } = {}): url is string {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false;
  const expiresAt = parsePreviewExpiry(url);
  return expiresAt === null || expiresAt - marginMs > now;
}

function cacheGet(key: string): CachedPreview | null {
  const item = inMemoryPreviewCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt || !isPreviewUrlFresh(item.value.url)) {
    inMemoryPreviewCache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key: string, value: CachedPreview): void {
  if (inMemoryPreviewCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = inMemoryPreviewCache.keys().next().value;
    if (oldestKey !== undefined) inMemoryPreviewCache.delete(oldestKey);
  }
  const signedExpiry = parsePreviewExpiry(value.url);
  const expiresAt = signedExpiry === null
    ? Date.now() + CACHE_TTL_MS
    : Math.min(Date.now() + CACHE_TTL_MS, signedExpiry - EXPIRY_MARGIN_MS);
  inMemoryPreviewCache.set(key, { value, expiresAt });
}

export function clearPreviewCacheForTesting() {
  inMemoryPreviewCache.clear();
}

export function extractNumericCatalogTrackId(track: PreviewTrack | null | undefined): number | null {
  if (!track) return null;
  if (typeof track.catalogTrackId === 'number' && Number.isInteger(track.catalogTrackId) && track.catalogTrackId > 0) {
    return track.catalogTrackId;
  }
  const id: unknown = track.id;
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
    return id;
  }
  if (typeof id === 'string') {
    const m = id.match(/^sqlite:(\d+)$/);
    if (m) return parseInt(m[1], 10);
    if (/^\d+$/.test(id)) return parseInt(id, 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stable preview references
// ---------------------------------------------------------------------------

const PREVIEW_REF_REGEX = /^(deezer|itunes|catalog):(\d{1,20})$/;

/** Validates a stable preview reference such as "deezer:3135556", "itunes:1440833098" or "catalog:42". */
export function parsePreviewRef(ref: unknown): { provider: string; id: string; ref: string } | null {
  if (typeof ref !== 'string') return null;
  const match = ref.trim().match(PREVIEW_REF_REGEX);
  if (!match) return null;
  return { provider: match[1], id: match[2], ref: `${match[1]}:${match[2]}` };
}

/** Client-facing URL that always redirects to a fresh preview. */
export function toPreviewPath(ref: string): string {
  return `/api/preview/${ref}`;
}

/**
 * Derives the most reliable stable preview reference for a selected track.
 * Catalog tracks prefer their cross-referenced Deezer id, then iTunes, then the catalog row itself.
 */
export function previewRefForTrack(track: PreviewTrack | null | undefined): string | null {
  if (!track) return null;
  if (typeof track.previewRef === 'string' && parsePreviewRef(track.previewRef)) return track.previewRef;

  const numeric = (value: unknown) => (value !== undefined && value !== null && /^\d{1,20}$/.test(String(value)) ? String(value) : null);

  const catalogId = extractNumericCatalogTrackId(track);
  if (catalogId) {
    const deezerId = numeric(track.deezer_id);
    if (deezerId) return `deezer:${deezerId}`;
    const itunesId = numeric(track.itunes_id);
    if (itunesId) return `itunes:${itunesId}`;
    return `catalog:${catalogId}`;
  }

  const providerId = numeric(track.providerTrackId);
  if (providerId && (track.provider === 'deezer' || track.provider === 'itunes')) {
    return `${track.provider}:${providerId}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider lookups
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, rateLimiter: unknown): Promise<T | null> {
  if (isOfflineMode() && fetchImpl === defaultFetch) return null;
  const res = await fetchImpl(url, {}, { rateLimiter, maxRetries: 2 });
  if (!res || !res.ok) return null;
  return res.json() as Promise<T>;
}

async function lookupDeezerTrack(deezerId: string | number): Promise<DeezerTrackJson | null> {
  try {
    const data = await fetchJson<DeezerTrackJson>(`https://api.deezer.com/track/${deezerId}`, deezerRateLimiter);
    if (!data || data.error) return null;
    return data;
  } catch (err) {
    logger.warn('preview_resolver', `Deezer track lookup failed for ${deezerId}: ${errorMessage(err)}`);
    return null;
  }
}

async function lookupItunesPreview(itunesId: string): Promise<string | null> {
  try {
    const data = await fetchJson<ItunesJson>(`https://itunes.apple.com/lookup?id=${itunesId}&entity=song`, itunesRateLimiter);
    const match = (data?.results || []).find(item => typeof item.previewUrl === 'string' && item.previewUrl.startsWith('http'));
    return match?.previewUrl ?? null;
  } catch (err) {
    logger.warn('preview_resolver', `iTunes lookup failed for ${itunesId}: ${errorMessage(err)}`);
    return null;
  }
}

/**
 * Resolves a stable preview reference into a currently valid audio URL.
 * Used by GET /api/preview/:ref so puzzles never embed short-lived signed URLs.
 */
export async function resolvePreviewRef(ref: unknown, { catalog = defaultCatalog }: { catalog?: Partial<PreviewCatalog> } = {}): Promise<string | null> {
  const parsed = parsePreviewRef(ref);
  if (!parsed) return null;

  const cacheKey = `ref:${parsed.ref}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached.url;

  let url: string | null = null;

  if (parsed.provider === 'deezer') {
    const data = await lookupDeezerTrack(parsed.id);
    if (typeof data?.preview === 'string' && data.preview.startsWith('http')) {
      url = data.preview;
    } else if (data?.title && data?.artist?.name) {
      // Deezer knows the track but has no preview (region/rights): fall back to search chains
      const fallback = await resolveTrackPreview({ title: data.title, artist: data.artist.name, isrc: data.isrc });
      url = fallback?.url || null;
    }
  } else if (parsed.provider === 'itunes') {
    url = await lookupItunesPreview(parsed.id);
  } else if (parsed.provider === 'catalog') {
    const row = typeof catalog?.getPreviewLookup === 'function' ? catalog.getPreviewLookup(Number(parsed.id)) : null;
    if (row) {
      const resolved = await resolveTrackPreview({
        id: `sqlite:${row.id}`,
        catalogTrackId: row.id,
        title: row.title,
        artist: row.artist,
        isrc: row.isrc,
        deezer_id: row.deezer_id,
      });
      url = resolved?.url || null;
    }
  }

  if (url && isPreviewUrlFresh(url)) {
    cacheSet(cacheKey, { url });
    return url;
  }
  return null;
}

/**
 * Resolves an audio preview for a single track on the fly.
 * 1. Returns the track's own sample URL if it is still valid (signed Deezer URLs expire within minutes).
 * 2. Checks in-memory cache.
 * 3. Fast-Path: Fetches via Deezer Track API using deezer_id.
 * 4. Fallback: Fetches via Deezer Search (artist + title).
 * 5. Fallback: Fetches via iTunes Search API (ISRC or artist + title).
 *
 * When resolved, persists the sample into SQLite for future lookups.
 */
export async function resolveTrackPreview(track: PreviewTrack | null | undefined): Promise<CachedPreview | null> {
  if (!track) return null;

  // 1. Instant hit: track already has a playable, unexpired sample URL
  const existingUrl = track.sample_url || track.audioUrl;
  if (isPreviewUrlFresh(existingUrl)) {
    return {
      url: existingUrl,
      provider: track.provider || 'deezer',
      providerTrackId: track.providerTrackId ? String(track.providerTrackId) : undefined,
      codec: track.audio_codec || 'mp3',
      source: 'existing',
    };
  }

  const cacheKey = `track:${track.id || track.isrc || `${track.artist}-${track.title}`}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const catalogTrackId = extractNumericCatalogTrackId(track);
  const deezerId = track.deezer_id || (track.provider === 'deezer' ? track.providerTrackId : null);

  // 2. Fast-Path: Deezer Track API lookup by ID
  if (deezerId && /^\d{1,20}$/.test(String(deezerId))) {
    const data = await lookupDeezerTrack(String(deezerId));
    if (data && typeof data.preview === 'string' && data.preview.startsWith('http')) {
      const result = {
        url: data.preview,
        provider: 'deezer',
        providerTrackId: String(deezerId),
        codec: 'mp3',
        source: 'deezer_fast_path',
      };
      cacheSet(cacheKey, result);

      if (catalogTrackId) {
        defaultCatalog.insertSample(catalogTrackId, {
          provider: 'deezer',
          providerTrackId: String(deezerId),
          sampleUrl: data.preview,
          audioCodec: 'mp3',
          sampleDurationSec: 30,
          httpStatus: 200,
        });
      }

      return result;
    }
  }

  // 3. Fallback: Deezer search by artist and title. Plain query (the advanced artist:"…" filter
  // returns unrelated results), then only accept a result by the same artist with the same base title.
  if (track.title && track.artist) {
    try {
      const query = `${track.artist} ${stripVersionTags(track.title)}`.replace(/"/g, ' ').trim();
      const data = await fetchJson<{ data?: DeezerTrackJson[] }>(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=10`, deezerRateLimiter);
      const wantedArtist = canonicalArtistKey(track.artist);
      const wantedTitle = baseTitleKey(track.title);
      const candidate = (data?.data || []).find(item =>
        item.preview && item.preview.startsWith('http') &&
        canonicalArtistKey(item.artist?.name || '') === wantedArtist &&
        baseTitleKey(item.title || '') === wantedTitle
      );
      if (candidate?.preview) {
        const result = {
          url: candidate.preview,
          provider: 'deezer',
          providerTrackId: String(candidate.id),
          codec: 'mp3',
          source: 'deezer_search_fallback',
        };
        cacheSet(cacheKey, result);

        if (catalogTrackId) {
          defaultCatalog.insertSample(catalogTrackId, {
            provider: 'deezer',
            providerTrackId: String(candidate.id),
            sampleUrl: candidate.preview,
            audioCodec: 'mp3',
            sampleDurationSec: 30,
            httpStatus: 200,
          });
        }

        return result;
      }
    } catch (err) {
      logger.warn('preview_resolver', `Deezer search fallback failed for ${track.artist} - ${track.title}: ${errorMessage(err)}`);
    }
  }

  // 4. Fallback: iTunes Search API
  try {
    const itunesTerm = track.isrc
      ? track.isrc
      : `${track.artist} ${track.title}`.replace(/[/\\?%*:|"<>]/g, ' ').slice(0, 100);

    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(itunesTerm)}&entity=song&limit=3`;
    const data = await fetchJson<ItunesJson>(itunesUrl, itunesRateLimiter);
    const match = (data?.results || []).find(item => item.previewUrl && item.previewUrl.startsWith('http'));
    if (match?.previewUrl) {
      const result = {
        url: match.previewUrl,
        provider: 'itunes',
        providerTrackId: String(match.trackId),
        codec: 'm4a',
        source: 'itunes_fallback',
      };
      cacheSet(cacheKey, result);

      if (catalogTrackId) {
        defaultCatalog.insertSample(catalogTrackId, {
          provider: 'itunes',
          providerTrackId: String(match.trackId),
          sampleUrl: match.previewUrl,
          audioCodec: 'm4a',
          sampleDurationSec: 30,
          httpStatus: 200,
        });
      }

      return result;
    }
  } catch (err) {
    logger.warn('preview_resolver', `iTunes fallback failed for ${track.artist} - ${track.title}: ${errorMessage(err)}`);
  }

  return null;
}

/**
 * Resolves audio previews for a batch of candidate tracks in parallel.
 * Automatically attaches audioUrl, sample_url and a stable previewRef to each resolved track.
 */
export async function batchResolvePreviews<T extends PreviewTrack>(tracks: T[] = []): Promise<{
  resolvedTracks: (T & { audioUrl: string; sample_url: string; audioCodec: string; previewSource?: string; previewRef: string | null })[];
  failedTracks: T[];
}> {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { resolvedTracks: [], failedTracks: [] };
  }

  const results = await Promise.allSettled(
    tracks.map(async (track) => {
      const preview = await resolveTrackPreview(track);
      if (preview && preview.url) {
        const resolvedRef = preview.providerTrackId && (preview.provider === 'deezer' || preview.provider === 'itunes')
          ? `${preview.provider}:${preview.providerTrackId}`
          : null;
        return {
          ...track,
          audioUrl: preview.url,
          sample_url: preview.url,
          audioCodec: preview.codec || 'mp3',
          previewSource: preview.source,
          previewRef: parsePreviewRef(resolvedRef) ? resolvedRef : previewRefForTrack(track),
        };
      }
      return null;
    })
  );

  const resolvedTracks: Awaited<ReturnType<typeof batchResolvePreviews<T>>>['resolvedTracks'] = [];
  const failedTracks: T[] = [];

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'fulfilled' && res.value) {
      resolvedTracks.push(res.value);
    } else {
      failedTracks.push(tracks[i]);
    }
  }

  return { resolvedTracks, failedTracks };
}
