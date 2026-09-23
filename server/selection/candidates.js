/**
 * Candidate sources for song selection.
 *
 *   catalog   sampleCatalogTracks: SQL filters + random rand_key window, then weighted by
 *             popularity (Efraimidis-Spirakis). The primary source.
 *   external  live Deezer + iTunes searches. Only a fallback when the catalog pool is thin
 *             (rare theme, artist missing from the catalog); results are written back to the
 *             catalog through upsertTrack so the next request finds them locally.
 *   anime     the isolated anime OP/ED catalog.
 */
import { normalizeDeezerRank, provisionalPopularity } from '../db/trackNormalization.js';
import { toFtsQuery } from '../services/queryBuilder.js';
import { allowedLanguagesForContext } from '../policy/selectionPolicy.js';
import { logger } from '../logger.js';
import { weightedOrder } from './random.js';
import { genresForPrompt } from '../../shared/themes.ts';

/**
 * Popularity setting -> window on the catalog's percentile score and weighting exponent
 * (0 = uniform). Mainstream is the top quarter of each language, balanced drops the bottom 30%.
 */
export const POPULARITY_SAMPLING = Object.freeze({
  obscure: { minPopularity: 0, maxPopularity: 50, alpha: 0 },
  pure: { minPopularity: 0, maxPopularity: 100, alpha: 0 },
  balanced: { minPopularity: 30, maxPopularity: 100, alpha: 1 },
  mainstream: { minPopularity: 75, maxPopularity: 100, alpha: 2 },
});

const CATALOG_POOL_SIZE = 400;

/** Minimum catalog pool before external providers are asked for more. */
export function externalFallbackThreshold(count) {
  return Math.max(count * 3, 30);
}

export function popularityWeight(popularity, alpha) {
  return (Math.max(0, Number(popularity) || 0) + 1) ** alpha;
}

function catalogRowToCandidate(row) {
  return {
    id: `sqlite:${row.id}`,
    catalogTrackId: row.id,
    provider: row.deezer_id || !row.itunes_id ? 'deezer' : 'itunes',
    providerTrackId: row.deezer_id || row.itunes_id || String(row.id),
    deezer_id: row.deezer_id,
    spotify_id: row.spotify_id,
    itunes_id: row.itunes_id,
    title: row.title,
    artist: row.artist,
    album: row.album || 'Single',
    audioUrl: row.sample_url || '',
    sample_url: row.sample_url || '',
    duration_ms: row.duration_ms,
    isrc: row.isrc,
    release_year: row.release_year,
    releaseDate: row.release_date || (row.release_year ? `${row.release_year}-01-01` : null),
    popularity: row.popularity,
    language: row.language,
  };
}

/**
 * Weighted random candidates from the catalog for a query plan.
 * @returns {object[]} candidates, most preferred first
 */
export function catalogCandidates({ catalog, queryPlan, prompt = '', recentIds = [], rng, poolSize = CATALOG_POOL_SIZE }) {
  const settings = POPULARITY_SAMPLING[queryPlan.popularity] || POPULARITY_SAMPLING.balanced;
  const genres = queryPlan.artist ? [] : genresForPrompt(queryPlan.genre || '', prompt || '');
  // A prompt that maps to genre clusters ("80s rock") is matched on artist genres; running the
  // same words as a title search on top ("rock" in the title) would starve the pool
  const ftsQuery = genres.length > 0 ? '' : toFtsQuery(prompt, { artist: queryPlan.artist });
  const languages = queryPlan.languages || allowedLanguagesForContext(queryPlan.genre, `${prompt || ''} ${genres.join(' ')}`);
  const excludeTrackIds = recentIds
    .filter(id => String(id).startsWith('sqlite:'))
    .map(id => parseInt(String(id).slice('sqlite:'.length), 10))
    .filter(Number.isInteger);

  const rows = catalog.sampleCatalogTracks({
    ftsQuery,
    genres,
    artist: queryPlan.artist || '',
    languages,
    yearRange: queryPlan.yearRange || null,
    // An artist's deep cuts are fair game when the prompt names the artist
    minPopularity: queryPlan.artist ? 0 : settings.minPopularity,
    maxPopularity: settings.maxPopularity,
    excludeTrackIds,
    poolSize,
    start: rng(),
  });

  logger.info('music_service', `Catalog window: ${rows.length} tracks (languages=${languages.join('/')}, genres=${JSON.stringify(genres)}, fts="${ftsQuery}")`);
  return weightedOrder(rows, row => popularityWeight(row.popularity, settings.alpha), rng).map(catalogRowToCandidate);
}

/**
 * Live provider candidates. Deezer first; iTunes (rate-limited to 0.25 req/s, so each search
 * costs seconds) only when the pool is still below `needed`.
 */
export async function externalCandidates({ provider, itunesProvider, queryPlan, limit, includeItunes, needed = 0 }) {
  const deezer = await provider.getCandidateTracks({
      genre: queryPlan.genre,
      minFans: queryPlan.minFans,
      maxFans: queryPlan.maxFans,
      minRank: queryPlan.minRank,
      maxRank: queryPlan.maxRank,
      searches: queryPlan.deezerSearches,
      offset: queryPlan.randomOffset,
      popularity: queryPlan.popularity,
      limit,
  });
  if (!includeItunes || deezer.length >= needed) return deezer;

  const itunes = await Promise.all(queryPlan.itunesSearches.slice(0, 2).map(term =>
    itunesProvider.getCandidateTracks({ query: term, limit: 100 }).catch(err => {
      logger.warn('music_service', `iTunes harvesting error: ${err.message}`);
      return [];
    })
  ));
  return [...deezer, ...itunes.flat()];
}

/**
 * Writes Deezer fallback results into the catalog. upsertTrack applies the admission policy,
 * so only en/ja/ko originals with a real duration get in.
 * @returns {{ inserted: number, merged: number, total: number }}
 */
export function learnFromExternal(catalog, candidates) {
  const batch = candidates
    .filter(c => c.provider === 'deezer' && c.providerTrackId && c.durationMs)
    .map(c => ({
      title: c.title,
      artist: c.artist,
      album: c.album,
      isrc: c.isrc,
      durationMs: c.durationMs,
      releaseDate: c.releaseDate || null,
      deezerRank: c.rank || null,
      provider: 'deezer',
      providerTrackId: c.providerTrackId,
      externalUrl: c.providerUrl || null,
      rawMetadata: { deezerRank: c.rank || null, artistId: c.providerArtistId || null, albumId: c.albumId || null },
      artistMetadata: { deezerId: c.providerArtistId ? Number(c.providerArtistId) : null, fansCount: c.fans || 0 },
    }));
  if (batch.length === 0) return { inserted: 0, merged: 0, total: 0 };
  return catalog.upsertBatch(batch);
}

/** Popularity of an external candidate: its own score, else the provisional catalog score. */
export function externalPopularity(candidate) {
  return Number(candidate.popularity) || provisionalPopularity({ deezerRank: normalizeDeezerRank(candidate.rank) });
}
