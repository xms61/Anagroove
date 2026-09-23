import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { deezerRateLimiter, itunesRateLimiter, politeFetch } from '../crawler/rateLimiter.js';
import { logger } from '../logger.js';

// Bounded in-memory preview cache to avoid duplicate network fetches during active gameplay
const inMemoryPreviewCache = new Map();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour upper bound (stable iTunes URLs)
// Treat signed URLs as stale this long before their real expiry so playback never starts on a dying link
const EXPIRY_MARGIN_MS = 60 * 1000;

let fetchImpl = politeFetch;

export function setPreviewFetchForTesting(fn) {
  fetchImpl = fn || politeFetch;
}

/**
 * Deezer preview URLs are signed (`hdnea=exp=<unix seconds>~...`) and only live for minutes.
 * Returns the expiry in epoch milliseconds, or null for unsigned (stable) URLs such as iTunes.
 */
export function parsePreviewExpiry(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/[?&~]hdnea=exp=(\d{9,11})/) || url.match(/[?&]exp=(\d{9,11})/);
  return match ? parseInt(match[1], 10) * 1000 : null;
}

export function isPreviewUrlFresh(url, { now = Date.now(), marginMs = EXPIRY_MARGIN_MS } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false;
  const expiresAt = parsePreviewExpiry(url);
  return expiresAt === null || expiresAt - marginMs > now;
}

function cacheGet(key) {
  const item = inMemoryPreviewCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt || !isPreviewUrlFresh(item.value.url)) {
    inMemoryPreviewCache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key, value) {
  if (inMemoryPreviewCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = inMemoryPreviewCache.keys().next().value;
    inMemoryPreviewCache.delete(oldestKey);
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

export function getPreviewCacheStatsForTesting() {
  return { size: inMemoryPreviewCache.size };
}

export function extractNumericCatalogTrackId(track) {
  if (!track) return null;
  if (typeof track.catalogTrackId === 'number' && Number.isInteger(track.catalogTrackId) && track.catalogTrackId > 0) {
    return track.catalogTrackId;
  }
  if (typeof track.id === 'number' && Number.isInteger(track.id) && track.id > 0) {
    return track.id;
  }
  if (typeof track.id === 'string') {
    const m = track.id.match(/^sqlite:(\d+)$/);
    if (m) return parseInt(m[1], 10);
    if (/^\d+$/.test(track.id)) return parseInt(track.id, 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stable preview references
// ---------------------------------------------------------------------------

const PREVIEW_REF_REGEX = /^(deezer|itunes|catalog):(\d{1,20})$/;

/**
 * Validates a stable preview reference such as "deezer:3135556", "itunes:1440833098" or "catalog:42".
 * @returns {{ provider: string, id: string, ref: string } | null}
 */
export function parsePreviewRef(ref) {
  if (typeof ref !== 'string') return null;
  const match = ref.trim().match(PREVIEW_REF_REGEX);
  if (!match) return null;
  return { provider: match[1], id: match[2], ref: `${match[1]}:${match[2]}` };
}

/** Client-facing URL that always redirects to a fresh preview. */
export function toPreviewPath(ref) {
  return `/api/preview/${ref}`;
}

/**
 * Derives the most reliable stable preview reference for a selected track.
 * Catalog tracks prefer their cross-referenced Deezer id, then iTunes, then the catalog row itself.
 */
export function previewRefForTrack(track) {
  if (!track) return null;
  if (typeof track.previewRef === 'string' && parsePreviewRef(track.previewRef)) return track.previewRef;

  const numeric = value => (value !== undefined && value !== null && /^\d{1,20}$/.test(String(value)) ? String(value) : null);

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

async function fetchJson(url, rateLimiter) {
  const res = await fetchImpl(url, {}, { rateLimiter, maxRetries: 2 });
  if (!res || !res.ok) return null;
  return res.json();
}

async function lookupDeezerTrack(deezerId) {
  try {
    const data = await fetchJson(`https://api.deezer.com/track/${deezerId}`, deezerRateLimiter);
    if (!data || data.error) return null;
    return data;
  } catch (err) {
    logger.warn('preview_resolver', `Deezer track lookup failed for ${deezerId}: ${err.message}`);
    return null;
  }
}

async function lookupItunesPreview(itunesId) {
  try {
    const data = await fetchJson(`https://itunes.apple.com/lookup?id=${itunesId}&entity=song`, itunesRateLimiter);
    const match = (data?.results || []).find(item => typeof item.previewUrl === 'string' && item.previewUrl.startsWith('http'));
    return match ? match.previewUrl : null;
  } catch (err) {
    logger.warn('preview_resolver', `iTunes lookup failed for ${itunesId}: ${err.message}`);
    return null;
  }
}

/**
 * Resolves a stable preview reference into a currently valid audio URL.
 * Used by GET /api/preview/:ref so puzzles never embed short-lived signed URLs.
 * @returns {Promise<string|null>}
 */
export async function resolvePreviewRef(ref, { catalog = sqliteCatalog } = {}) {
  const parsed = parsePreviewRef(ref);
  if (!parsed) return null;

  const cacheKey = `ref:${parsed.ref}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached.url;

  let url = null;

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
export async function resolveTrackPreview(track) {
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
    const data = await lookupDeezerTrack(deezerId);
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
        sqliteCatalog.insertSample(catalogTrackId, {
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

  // 3. Fallback: Deezer search by artist and title
  if (track.title && track.artist) {
    try {
      const cleanTitle = String(track.title).replace(/["()]/g, ' ').trim();
      const cleanArtist = String(track.artist).replace(/["()]/g, ' ').trim();
      const searchUrl = `https://api.deezer.com/search?q=track:"${encodeURIComponent(cleanTitle)}" artist:"${encodeURIComponent(cleanArtist)}"&limit=3`;
      const data = await fetchJson(searchUrl, deezerRateLimiter);
      const candidate = (data?.data || []).find(item => item.preview && item.preview.startsWith('http'));
      if (candidate) {
        const result = {
          url: candidate.preview,
          provider: 'deezer',
          providerTrackId: String(candidate.id),
          codec: 'mp3',
          source: 'deezer_search_fallback',
        };
        cacheSet(cacheKey, result);

        if (catalogTrackId) {
          sqliteCatalog.insertSample(catalogTrackId, {
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
      logger.warn('preview_resolver', `Deezer search fallback failed for ${track.artist} - ${track.title}: ${err.message}`);
    }
  }

  // 4. Fallback: iTunes Search API
  try {
    const itunesTerm = track.isrc
      ? track.isrc
      : `${track.artist} ${track.title}`.replace(/[/\\?%*:|"<>]/g, ' ').slice(0, 100);

    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(itunesTerm)}&entity=song&limit=3`;
    const data = await fetchJson(itunesUrl, itunesRateLimiter);
    const match = (data?.results || []).find(item => item.previewUrl && item.previewUrl.startsWith('http'));
    if (match) {
      const result = {
        url: match.previewUrl,
        provider: 'itunes',
        providerTrackId: String(match.trackId),
        codec: 'm4a',
        source: 'itunes_fallback',
      };
      cacheSet(cacheKey, result);

      if (catalogTrackId) {
        sqliteCatalog.insertSample(catalogTrackId, {
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
    logger.warn('preview_resolver', `iTunes fallback failed for ${track.artist} - ${track.title}: ${err.message}`);
  }

  return null;
}

/**
 * Resolves audio previews for a batch of candidate tracks in parallel.
 * Automatically attaches audioUrl, sample_url and a stable previewRef to each resolved track.
 *
 * @param {Array<Object>} tracks
 * @returns {Promise<{ resolvedTracks: Array<Object>, failedTracks: Array<Object> }>}
 */
export async function batchResolvePreviews(tracks = []) {
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

  const resolvedTracks = [];
  const failedTracks = [];

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
