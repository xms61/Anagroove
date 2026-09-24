import { logger } from '../logger.js';
import { errorMessage } from '../errors.ts';
import type { AnimeCatalog } from '../db/animeCatalog.ts';
import type { SongCandidate } from '../types.ts';

type CoverCatalog = Pick<AnimeCatalog, 'updateTrackImageUrl' | 'updateAnimeCoverByTitle'>;
type MediaCovers = Record<string, { coverImage?: { large?: string; medium?: string } } | null>;

const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';
const REQUEST_TIMEOUT_MS = 3500;

/**
 * Resolves anime cover artwork for a batch of crossword tracks: batched AniList GraphQL queries,
 * with the image URLs stored in the anime catalog so later lookups skip the network. Mutates and
 * returns the tracks (albumArt and imageUrl set).
 */
export async function resolveAnimeCoverImages<T extends Partial<SongCandidate>>(tracks: T[] = [], catalog: CoverCatalog | null = null): Promise<T[]> {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return tracks;
  }

  // 1. Identify tracks needing artwork
  const missingTracks = tracks.filter(t => t && t.isAnimeOped && (!t.albumArt || typeof t.albumArt !== 'string' || !t.albumArt.startsWith('http')));
  if (missingTracks.length === 0) {
    return tracks;
  }

  // Group by anilistId to avoid duplicate requests for the same anime series
  const anilistGroups = new Map<number, T[]>();
  for (const track of missingTracks) {
    const aid = Number(track.anilistId);
    if (Number.isInteger(aid) && aid > 0) {
      const group = anilistGroups.get(aid) ?? [];
      group.push(track);
      anilistGroups.set(aid, group);
    }
  }

  if (anilistGroups.size === 0) {
    return tracks;
  }

  const anilistIds = Array.from(anilistGroups.keys());

  // Batch query AniList in chunks of up to 25 anime IDs
  const BATCH_SIZE = 25;
  for (let i = 0; i < anilistIds.length; i += BATCH_SIZE) {
    const chunk = anilistIds.slice(i, i + BATCH_SIZE);
    try {
      const subQueries = chunk
        .map(id => `a${id}: Media(id: ${id}, type: ANIME) { coverImage { large medium } }`)
        .join('\n');

      const query = `query {\n${subQueries}\n}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Anagroove-CrosswordEngine/1.0 (+https://github.com/xms61/Anagroove)',
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        logger.warn('anime_art', `AniList GraphQL returned HTTP ${res.status}`);
        continue;
      }

      const json = await res.json() as { data?: MediaCovers } | null;
      const data: MediaCovers = json?.data || {};

      for (const id of chunk) {
        const media = data[`a${id}`];
        const imageUrl = media?.coverImage?.large || media?.coverImage?.medium;
        if (imageUrl && typeof imageUrl === 'string') {
          const associatedTracks = anilistGroups.get(id) || [];
          for (const track of associatedTracks) {
            track.albumArt = imageUrl;
            track.imageUrl = imageUrl;
            if (catalog && typeof catalog.updateTrackImageUrl === 'function' && track.catalogTrackId) {
              catalog.updateTrackImageUrl(track.catalogTrackId, imageUrl);
            }
            if (catalog && typeof catalog.updateAnimeCoverByTitle === 'function' && track.animeTitle) {
              catalog.updateAnimeCoverByTitle(track.animeTitle, imageUrl);
            }
          }
        }
      }
    } catch (err) {
      logger.warn('anime_art', `Failed resolving AniList cover images batch: ${errorMessage(err)}`);
    }
  }

  return tracks;
}
