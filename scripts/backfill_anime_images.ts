#!/usr/bin/env node

import { animeCatalog } from '../server/db/animeCatalog.ts';
import { resolveAnimeCoverImages } from '../server/services/animeImageService.ts';
import { intFlag, parseFlags, parseOrExit } from './lib/cli.ts';
import type { SongCandidate } from '../server/types.ts';

interface SeriesRow {
  id: number;
  anime_title: string;
  anilist_id: number;
  mal_id: number | null;
}

const USAGE = `
Caches AniList cover image URLs into anime_catalog.sqlite.
  npm run anime:images -- --limit=100      up to 100 series (default)
  npm run anime:images -- --all            every series without a cover`;

async function main() {
  const { isAll, limit } = parseOrExit(() => {
    const values = parseFlags({ limit: { type: 'string' }, all: { type: 'boolean' } });
    return { isAll: Boolean(values.all), limit: intFlag(values, 'limit') ?? 100 };
  }, USAGE);

  console.log(`Starting anime cover image backfill (limit: ${isAll ? 'all' : limit})...`);

  // Find distinct anime needing cover art
  const sql = `
    SELECT id, anime_title, canonical_anime_title, anilist_id, mal_id
    FROM anime_tracks
    WHERE image_url IS NULL AND anilist_id IS NOT NULL
    GROUP BY anilist_id
    ORDER BY popularity DESC
    ${isAll ? '' : `LIMIT ${limit}`}
  `;

  const rows = animeCatalog.db.prepare(sql).all() as unknown as SeriesRow[];
  console.log(`Found ${rows.length} anime series needing cover artwork.`);

  if (rows.length === 0) {
    console.log('✅ All eligible anime tracks already have cover artwork.');
    process.exit(0);
  }

  const tracks: Partial<SongCandidate>[] = rows.map(r => ({
    catalogTrackId: r.id,
    animeTitle: r.anime_title,
    anilistId: r.anilist_id,
    malId: r.mal_id,
    isAnimeOped: true,
  }));

  const startTime = Date.now();
  await resolveAnimeCoverImages(tracks, animeCatalog);

  const updatedCount = tracks.filter(t => t.albumArt).length;
  console.log(`🎉 Backfill complete in ${Date.now() - startTime}ms! Populated ${updatedCount} / ${rows.length} anime series covers.`);
}

main().catch(err => {
  console.error('Fatal error during anime image backfill:', err);
  process.exit(1);
});
