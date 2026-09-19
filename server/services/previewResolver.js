import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { deezerRateLimiter, itunesRateLimiter, politeFetch } from '../crawler/rateLimiter.js';
import { logger } from '../logger.js';

// Bounded in-memory preview cache to avoid duplicate network fetches during active gameplay
const inMemoryPreviewCache = new Map();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet(key) {
  const item = inMemoryPreviewCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
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
  inMemoryPreviewCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
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

/**
 * Resolves an audio preview for a single track on the fly.
 * 1. Checks if track already has a valid sample_url (instant hit).
 * 2. Checks in-memory cache.
 * 3. Fast-Path: Fetches via Deezer Track API using deezer_id.
 * 4. Fallback: Fetches via Deezer Search (artist + title).
 * 5. Fallback: Fetches via iTunes Search API (ISRC or artist + title).
 * 
 * When resolved, asynchronously persists the sample into SQLite for future instant hits.
 */
export async function resolveTrackPreview(track) {
  if (!track) return null;

  // 1. Instant hit: track already has a verified playable sample URL
  const existingUrl = track.sample_url || track.audioUrl;
  if (existingUrl && typeof existingUrl === 'string' && existingUrl.startsWith('http')) {
    return {
      url: existingUrl,
      provider: track.provider || 'deezer',
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
  if (deezerId) {
    try {
      const url = `https://api.deezer.com/track/${deezerId}`;
      const res = await politeFetch(url, {}, { rateLimiter: deezerRateLimiter, maxRetries: 2 });
      if (res.ok) {
        const data = await res.json();
        if (data && data.preview && data.preview.startsWith('http')) {
          const result = {
            url: data.preview,
            provider: 'deezer',
            providerTrackId: String(deezerId),
            codec: 'mp3',
            source: 'deezer_fast_path',
          };
          cacheSet(cacheKey, result);

          // Asynchronously persist sample into SQLite
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
    } catch (err) {
      logger.warn('preview_resolver', `Deezer fast-path failed for track ${deezerId}: ${err.message}`);
    }
  }

  // 3. Fallback: Deezer search by artist and title
  if (track.title && track.artist) {
    try {
      const cleanTitle = String(track.title).replace(/["()]/g, ' ').trim();
      const cleanArtist = String(track.artist).replace(/["()]/g, ' ').trim();
      const searchUrl = `https://api.deezer.com/search?q=track:"${encodeURIComponent(cleanTitle)}" artist:"${encodeURIComponent(cleanArtist)}"&limit=3`;
      const res = await politeFetch(searchUrl, {}, { rateLimiter: deezerRateLimiter, maxRetries: 2 });
      if (res.ok) {
        const data = await res.json();
        const candidate = (data.data || []).find(item => item.preview && item.preview.startsWith('http'));
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
    const res = await politeFetch(itunesUrl, {}, { rateLimiter: itunesRateLimiter, maxRetries: 2 });
    if (res.ok) {
      const data = await res.json();
      const match = (data.results || []).find(item => item.previewUrl && item.previewUrl.startsWith('http'));
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
    }
  } catch (err) {
    logger.warn('preview_resolver', `iTunes fallback failed for ${track.artist} - ${track.title}: ${err.message}`);
  }

  return null;
}

/**
 * Resolves audio previews for a batch of candidate tracks in parallel.
 * Automatically attaches audioUrl and sample_url to each successfully resolved track.
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
        return {
          ...track,
          audioUrl: preview.url,
          sample_url: preview.url,
          audioCodec: preview.codec || 'mp3',
          previewSource: preview.source,
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
