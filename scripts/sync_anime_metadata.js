import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFlags, parseOrExit } from './lib/cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DUMP_PATH = path.join(DATA_DIR, 'animethemes_dump.json');
const INDEX_PATH = path.join(DATA_DIR, 'anime_metadata_index.json');

const BASE_URL = 'https://api.animethemes.moe/anime';
const PAGE_SIZE = 100;
const DELAY_MS = 600; // Pacing to stay comfortably under 90 req/min limit

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeAnimeSlugKey(filename) {
  if (!filename) return '';
  const clean = path.basename(filename, path.extname(filename));
  // Matches e.g. "100Man-OP1-NCBD1080" -> "100man-op1"
  const m = clean.match(/^([A-Za-z0-9]+)-(OP|ED)(\d+)/i);
  if (m) {
    return `${m[1].toLowerCase()}-${m[2].toLowerCase()}${m[3]}`;
  }
  return clean.toLowerCase();
}

export async function fetchAllAnimeThemesMetadata({ forceRefresh = false } = {}) {
  if (!forceRefresh && fs.existsSync(INDEX_PATH)) {
    console.log(`[AnimeSync] Metadata index already exists at ${INDEX_PATH}`);
    const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    console.log(`[AnimeSync] Loaded index with ${Object.keys(indexData.byBasename || {}).length} basename mappings and ${Object.keys(indexData.bySlugKey || {}).length} slug mappings.`);
    return indexData;
  }

  console.log('[AnimeSync] Starting AnimeThemes catalog synchronization...');
  let page = 1;
  let hasMore = true;
  const allAnime = [];

  while (hasMore) {
    const url = `${BASE_URL}?include=animethemes.song.artists,animethemes.animethemeentries.videos,resources&page[size]=${PAGE_SIZE}&page[number]=${page}`;
    try {
      const startTime = Date.now();
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Anagroove-CrosswordEngine/1.0 (+https://github.com/xms61/SpotySpice)'
        }
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[AnimeSync] Rate limited (429). Backing off for 5 seconds...`);
          await sleep(5000);
          continue;
        }
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const animeBatch = data.anime || [];
      const latency = Date.now() - startTime;

      if (animeBatch.length === 0) {
        hasMore = false;
        break;
      }

      allAnime.push(...animeBatch);
      const remaining = res.headers.get('x-ratelimit-remaining');
      console.log(`[AnimeSync] Page ${page} fetched (${animeBatch.length} anime, ${latency}ms | RateLimit remaining: ${remaining || 'N/A'}). Total anime so far: ${allAnime.length}`);

      if (animeBatch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
        await sleep(DELAY_MS);
      }
    } catch (err) {
      console.error(`[AnimeSync] Error fetching page ${page}: ${err.message}`);
      console.log('[AnimeSync] Retrying page in 3 seconds...');
      await sleep(3000);
    }
  }

  console.log(`\n[AnimeSync] Successfully fetched ${allAnime.length} anime entries. Building lookup indices...`);

  // Save raw dump
  fs.writeFileSync(DUMP_PATH, JSON.stringify(allAnime, null, 2), 'utf8');
  console.log(`[AnimeSync] Raw dump saved to ${DUMP_PATH} (${(fs.statSync(DUMP_PATH).size / (1024 * 1024)).toFixed(2)} MB)`);

  const byBasename = {};
  const bySlugKey = {};
  let totalThemes = 0;
  let totalVideos = 0;

  for (const a of allAnime) {
    // Extract external links (MAL, AniList)
    const malRes = (a.resources || []).find(r => r.site === 'MyAnimeList');
    const anilistRes = (a.resources || []).find(r => r.site === 'AniList');
    const malId = malRes ? malRes.external_id : null;
    const anilistId = anilistRes ? anilistRes.external_id : null;

    for (const t of (a.animethemes || [])) {
      totalThemes++;
      const songTitle = t.song?.title || 'Unknown Title';
      const artists = (t.song?.artists || []).map(x => x.name).filter(Boolean);
      const artistName = artists.join(', ') || 'Unknown Artist';
      const themeType = (t.type || 'OP').toUpperCase();
      const themeNum = t.sequence || 1;
      const themeSlug = `${themeType}${themeNum}`;

      const themeMetadata = {
        animeId: a.id,
        animeTitle: a.name,
        animeSlug: a.slug,
        year: a.year || null,
        season: a.season || null,
        malId,
        anilistId,
        themeType,
        themeNumber: themeNum,
        themeSlug,
        songTitle,
        artistName,
        artists,
      };

      // Index by slug key
      const animeSlug = a.slug ? a.slug.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
      if (animeSlug) {
        const slugKey = `${animeSlug}-${themeType.toLowerCase()}${themeNum}`;
        if (!bySlugKey[slugKey]) {
          bySlugKey[slugKey] = themeMetadata;
        }
      }

      // Index by each video's basename
      for (const e of (t.animethemeentries || [])) {
        for (const v of (e.videos || [])) {
          totalVideos++;
          const videoBasename = v.basename || '';
          const nameWithoutExt = path.basename(videoBasename, path.extname(videoBasename));
          if (nameWithoutExt) {
            byBasename[nameWithoutExt.toLowerCase()] = themeMetadata;
            // Also store normalized slug key from video filename
            const vKey = normalizeAnimeSlugKey(nameWithoutExt);
            if (vKey && !bySlugKey[vKey]) {
              bySlugKey[vKey] = themeMetadata;
            }
          }
        }
      }
    }
  }

  const indexPayload = {
    generatedAt: new Date().toISOString(),
    totalAnime: allAnime.length,
    totalThemes,
    totalVideos,
    byBasename,
    bySlugKey,
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(indexPayload, null, 2), 'utf8');
  console.log(`[AnimeSync] Index created with ${Object.keys(byBasename).length} exact video basenames and ${Object.keys(bySlugKey).length} slug keys.`);
  console.log(`[AnimeSync] Index saved to ${INDEX_PATH}\n`);

  return indexPayload;
}

if (import.meta.main) {
  const force = Boolean(parseOrExit(
    () => parseFlags({ force: { type: 'boolean' } }).force,
    'npm run anime:sync -- [--force]   refresh the AnimeThemes index even when it is recent'
  ));
  fetchAllAnimeThemesMetadata({ forceRefresh: force })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[AnimeSync] Fatal error:', err);
      process.exit(1);
    });
}
