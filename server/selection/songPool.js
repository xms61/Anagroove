/**
 * Song selection entry point (GET /api/music/random, POST /api/puzzles/live).
 *
 *   1. Query plan from the prompt/options (queryBuilder).
 *   2. Candidates: the catalog window, weighted by popularity; live providers (capped at 10 s)
 *      only when the catalog pool is thin or the picked pool falls short; the anime catalog for
 *      anime prompts.
 *   3. Recency tiers (never / once / twice / 3+ recent plays), filled in that order until
 *      `count` songs are picked.
 *   4. Stable /api/preview/<ref> audio paths.
 */
import { deezerMusicProvider } from '../services/deezerMusicProvider.js';
import { itunesMusicProvider } from '../services/itunesMusicProvider.js';
import { buildQueryPlan, extractAnimeKeyphrase } from '../services/queryBuilder.js';
import { resolveAnimeCoverImages } from '../services/animeImageService.js';
import { batchResolvePreviews, previewRefForTrack, toPreviewPath } from '../services/previewResolver.js';
import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { animeCatalog } from '../db/animeCatalog.js';
import { getAnimeThemeType, isAnimeTarget } from '../policy/selectionPolicy.js';
import { logger } from '../logger.js';
import { createRng, weightedOrder } from './random.js';
import {
  POPULARITY_SAMPLING,
  catalogCandidates,
  externalCandidates,
  externalFallbackThreshold,
  externalPopularity,
  learnFromExternal,
  popularityWeight,
} from './candidates.js';
import { createRecentCounter, createTrackPicker } from './trackPicker.js';

let musicProvider = deezerMusicProvider;

/** Replaces the live providers (and bypasses the catalog) in tests. */
export function setMusicProviderForTesting(provider) {
  musicProvider = provider || deezerMusicProvider;
}

const isLiveProvider = () => musicProvider === deezerMusicProvider;

// Live fallbacks are best-effort: a slow provider must not stall puzzle generation
const EXTERNAL_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      logger.warn('music_service', `External providers timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function animeCandidates({ queryPlan, prompt, animeKeyphrase, limit }) {
  const themeType = getAnimeThemeType(queryPlan.genre, prompt);
  const genericAnimePrompt = /^(anime|anime openings?|anime endings?|anime themes?|anime ost)$/i;
  const search = animeKeyphrase || (prompt && !genericAnimePrompt.test(prompt.trim()) ? prompt : null);
  try {
    return animeCatalog.getRandomAnimeTracks({ count: limit, yearRange: queryPlan.yearRange, type: themeType, search, requireSamples: true }) || [];
  } catch (err) {
    logger.warn('music_service', `Anime catalog candidate harvest failed: ${err.message}`);
    return [];
  }
}

/**
 * Gives every selected song a stable preview path. Deezer preview URLs are signed and expire
 * within minutes, so puzzles carry /api/preview/<provider>:<id> and the server redirects to a
 * fresh URL at play time. Songs with no resolvable preview are dropped.
 */
async function attachPreviewRefs(songs) {
  const isLocalAudio = s => typeof s.audioUrl === 'string' && s.audioUrl.startsWith('/audio/');
  for (const song of songs) {
    if (!isLocalAudio(song)) song.previewRef = previewRefForTrack(song);
  }

  // Only songs without a provider id need a lookup now; the rest resolve lazily when played
  const needsLookup = songs.filter(s => !isLocalAudio(s) && (!s.previewRef || s.previewRef.startsWith('catalog:')));
  if (needsLookup.length > 0) {
    try {
      const { resolvedTracks } = await batchResolvePreviews(needsLookup);
      const resolvedRefs = new Map(resolvedTracks.map(t => [t.id, t.previewRef]));
      for (const song of needsLookup) song.previewRef = resolvedRefs.get(song.id) || null;
    } catch (err) {
      logger.warn('preview_resolver', `Error during batch preview lookup: ${err.message}`);
    }
  }

  for (const song of songs) {
    if (song.previewRef) {
      song.audioUrl = toPreviewPath(song.previewRef);
      song.sample_url = song.audioUrl;
    } else if (!isLocalAudio(song)) {
      song.audioUrl = '';
    }
  }

  return songs.filter(s => {
    const hasAudio = typeof s.audioUrl === 'string' && (s.audioUrl.startsWith('/api/preview/') || s.audioUrl.startsWith('/audio/'));
    if (!hasAudio) logger.warn('music_service', `Filtered out track "${s.artist} - ${s.title}" due to missing audio preview`);
    return hasAudio;
  });
}

export async function getRandomSongPool({
  genre = 'all',
  minFans = 250000,
  count = 25,
  blacklist = [],
  recentIds = [],
  prompt = '',
  artist = '',
  album = '',
  decade = '',
  popularity,
  seed,
  languages,
} = {}) {
  const queryPlan = buildQueryPlan({ genre, minFans, prompt, artist, album, decade, popularity });
  // An explicit EN/JA/KO filter from the generator replaces the theme's default languages
  queryPlan.languages = Array.isArray(languages) && languages.length > 0 ? languages : null;
  logger.info('query', `Plan: genre="${queryPlan.genre}" artist="${queryPlan.artist || ''}" popularity=${queryPlan.popularity || 'balanced'}`);

  const rng = createRng(seed);
  const recentList = Array.isArray(recentIds) ? recentIds : [];
  const limit = Math.min(250, Math.max(120, count * 10));
  const isAnimeTheme = isAnimeTarget(queryPlan.genre, prompt);
  const animeKeyphrase = queryPlan.targetAnimeKeyphrase || extractAnimeKeyphrase(prompt, queryPlan.genre);
  const alpha = (POPULARITY_SAMPLING[queryPlan.popularity] || POPULARITY_SAMPLING.balanced).alpha;
  const recentCount = createRecentCounter(recentList);
  const picker = createTrackPicker({
    count,
    queryPlan,
    prompt,
    blacklist,
    recentCount,
    animeKeyphrase,
    isTargetingAnimeKeyphrase: Boolean(isAnimeTheme && animeKeyphrase),
  });

  // Recency tiers (never / once / twice / 3+ recent plays), filled in order until the pool is full
  let candidateCount = 0;
  const pickFrom = (candidates) => {
    candidateCount += candidates.length;
    const tiers = [[], [], [], []];
    for (const track of candidates) tiers[Math.min(recentCount(track), 3)].push(track);
    tiers.forEach((tier, plays) => picker.pick(tier, plays === 3 ? Infinity : plays));
  };

  let externalTried = false;
  const fetchExternal = async (needed) => {
    externalTried = true;
    const request = externalCandidates({
      provider: musicProvider,
      itunesProvider: itunesMusicProvider,
      queryPlan,
      limit,
      includeItunes: isLiveProvider(),
      needed,
    });
    const external = isLiveProvider() ? await withTimeout(request, EXTERNAL_TIMEOUT_MS, []) : await request;
    if (isLiveProvider() && external.length > 0) {
      try {
        const learned = learnFromExternal(sqliteCatalog, external);
        logger.info('music_service', `External fallback: ${external.length} candidates, ${learned.inserted} new catalog tracks`);
      } catch (err) {
        logger.warn('music_service', `Could not store fallback tracks: ${err.message}`);
      }
    }
    return weightedOrder(external, c => popularityWeight(externalPopularity(c), alpha), rng);
  };

  const harvestStart = Date.now();
  if (isAnimeTheme) {
    pickFrom(weightedOrder(animeCandidates({ queryPlan, prompt, animeKeyphrase, limit }), () => 1, rng));
  } else {
    let catalogPool = [];
    if (isLiveProvider()) {
      try {
        catalogPool = catalogCandidates({ catalog: sqliteCatalog, queryPlan, prompt, recentIds: recentList, rng });
      } catch (err) {
        logger.warn('music_service', `Catalog candidates failed: ${err.message}`);
      }
    }

    // Live providers only when the catalog is thin (or replaced by a test provider)
    if (!isLiveProvider() || catalogPool.length < externalFallbackThreshold(count)) {
      try {
        catalogPool = [...catalogPool, ...await fetchExternal(externalFallbackThreshold(count) - catalogPool.length)];
      } catch (err) {
        // A failing provider is fatal only when nothing else produced candidates
        if (catalogPool.length === 0) throw err;
        logger.warn('music_service', `External fallback failed: ${err.message}`);
      }
    }
    pickFrom(catalogPool);

    // Policy and variety rules can reject most of a narrow pool: ask the providers once more
    if (isLiveProvider() && !externalTried && picker.songs.length < count) {
      try {
        pickFrom(await fetchExternal(count * 3));
      } catch (err) {
        logger.warn('music_service', `External top-up failed: ${err.message}`);
      }
    }
  }
  logger.harvest('Aggregator', candidateCount, Date.now() - harvestStart);

  if (isAnimeTheme && picker.songs.some(s => s.isAnimeOped)) {
    try {
      await resolveAnimeCoverImages(picker.songs, animeCatalog);
    } catch (err) {
      logger.warn('music_service', `Anime cover art resolution error: ${err.message}`);
    }
  }

  // Stable preview paths (test providers keep their URLs)
  const songs = isLiveProvider() ? await attachPreviewRefs(picker.songs) : picker.songs;
  logger.sampling(candidateCount, songs.length, picker.clueStats, picker.rejections);
  return songs;
}
