#!/usr/bin/env node

/**
 * Backfill Anime Cover Images
 * Queries AniList GraphQL in batches and caches cover image URLs into anime_catalog.sqlite
 *
 * Usage:
 *   node scripts/backfill_anime_images.js [--limit=100] [--all]
 */

import { animeCatalog } from '../server/db/animeCatalog.js';
import { resolveAnimeCoverImages } from '../server/services/animeImageService.js';

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;
  const isAll = args.includes('--all');

  console.log(`🖼️ Starting anime cover image backfill (limit: ${isAll ? 'ALL' : limit})...`);

  // Find distinct anime needing cover art
  const sql = `
    SELECT id, anime_title, canonical_anime_title, anilist_id, mal_id
    FROM anime_tracks
    WHERE image_url IS NULL AND anilist_id IS NOT NULL
    GROUP BY anilist_id
    ORDER BY popularity DESC
    ${isAll ? '' : `LIMIT ${limit}`}
  `;

  const rows = animeCatalog.db.prepare(sql).all();
  console.log(`Found ${rows.length} anime series needing cover artwork.`);

  if (rows.length === 0) {
    console.log('✅ All eligible anime tracks already have cover artwork.');
    process.exit(0);
  }

  const tracks = rows.map(r => ({
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
