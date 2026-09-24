/**
 * Catalog popularity.
 *
 * Score (selection weighting): `tracks.popularity` is the track's percentile by Deezer rank within
 * its language, 0-100 (90 = more popular than 90% of that language's tracks). Deezer under-ranks
 * Japanese and Korean music, so each language is ranked on its own. A Spotify popularity, when
 * known, can only raise the score. Tracks with neither signal score 0.
 *
 * Floor (admission): a track stays in the catalog when its Deezer rank reaches its language's
 * floor, its Spotify popularity is at least 30, or its artist has at least 5,000 Deezer fans.
 * The floors are fixed ranks, not percentiles: a percentile floor would prune a new bottom 30%
 * on every cleanup run.
 */
import type { DatabaseSync } from 'node:sqlite';

/** Deezer rank at the 30th percentile of each language, measured on the catalog on 2026-09-23. */
export const MIN_DEEZER_RANK: Readonly<Record<string, number>> = Object.freeze({ en: 60000, ja: 32000, ko: 110000 });
export const MIN_SPOTIFY_POPULARITY = 30;
export const MIN_ARTIST_FANS = 5000;

/**
 * Cover and stock-music acts: an artist with at least 5 songs, fewer than 50,000 fans, and 60%
 * or more of their titles also recorded by an artist with more fans.
 */
export const COVER_ACT = Object.freeze({ minTracks: 5, maxFans: 50000, copiedShare: 0.6 });

/** True when a track's own numbers reach the floor (the artist's fans are checked separately). */
export function isAbovePopularityFloor({ language, deezerRank = null, spotifyPopularity = null }: {
  language: string | null | undefined;
  deezerRank?: number | null;
  spotifyPopularity?: number | null;
}): boolean {
  return (spotifyPopularity ?? -1) >= MIN_SPOTIFY_POPULARITY
    || (deezerRank ?? 0) >= (MIN_DEEZER_RANK[language ?? ''] ?? Infinity);
}

/** Recomputes every track's percentile score. Idempotent. Returns the number of rows changed. */
export function recomputeCatalogPopularity(db: DatabaseSync): number {
  const ranked = db.prepare(`
    WITH ranked AS (
      SELECT id, MAX(
        CAST(ROUND(100.0 * PERCENT_RANK() OVER (PARTITION BY language ORDER BY deezer_rank)) AS INTEGER),
        COALESCE(spotify_popularity, 0)
      ) AS score
      FROM tracks
      WHERE deezer_rank IS NOT NULL
    )
    UPDATE tracks SET popularity = ranked.score
    FROM ranked
    WHERE ranked.id = tracks.id AND tracks.popularity IS NOT ranked.score
  `).run().changes;
  const unranked = db.prepare(`
    UPDATE tracks SET popularity = MAX(0, MIN(100, COALESCE(spotify_popularity, 0)))
    WHERE deezer_rank IS NULL AND popularity IS NOT MAX(0, MIN(100, COALESCE(spotify_popularity, 0)))
  `).run().changes;
  return Number(ranked) + Number(unranked);
}

const BELOW_FLOOR = `
  COALESCE(a.fans_count, 0) < ${MIN_ARTIST_FANS}
  AND COALESCE(t.spotify_popularity, -1) < ${MIN_SPOTIFY_POPULARITY}
  AND COALESCE(t.deezer_rank, 0) < CASE t.language
    ${Object.entries(MIN_DEEZER_RANK).map(([language, rank]) => `WHEN '${language}' THEN ${rank}`).join(' ')}
    ELSE 9e18 END`;

/**
 * Tracks under the popularity floor, split by whether their artist has been enriched. Without
 * enrichment the artist's fans are unknown, so those tracks are left alone.
 */
export function findTracksBelowFloor(db: DatabaseSync): { below: number[]; unjudged: number } {
  const below = (db.prepare(`
    SELECT t.id FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE a.enriched_at IS NOT NULL AND ${BELOW_FLOOR}
  `).all() as { id: number }[]).map(row => row.id);
  const unjudged = db.prepare(`
    SELECT COUNT(*) AS c FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE a.enriched_at IS NULL AND ${BELOW_FLOOR}
  `).get()?.c;
  return { below, unjudged: Number(unjudged) };
}

/** Enriched artists that look like cover or stock-music acts (see COVER_ACT). */
export function findCoverActs(db: DatabaseSync): { id: number; name: string; tracks: number; copied: number }[] {
  return (db.prepare(`
    SELECT a.id, a.display_name AS name, COUNT(*) AS tracks,
           SUM(EXISTS (
             SELECT 1 FROM tracks o JOIN artists oa ON oa.id = o.artist_id
             WHERE o.canonical_title = t.canonical_title AND o.artist_id <> t.artist_id
               AND COALESCE(oa.fans_count, 0) > COALESCE(a.fans_count, 0)
           )) AS copied
    FROM tracks t JOIN artists a ON a.id = t.artist_id
    WHERE a.enriched_at IS NOT NULL AND COALESCE(a.fans_count, 0) < ${COVER_ACT.maxFans}
    GROUP BY a.id
    HAVING COUNT(*) >= ${COVER_ACT.minTracks} AND copied >= ${COVER_ACT.copiedShare} * COUNT(*)
  `).all() as { id: number; name: string; tracks: number; copied: number }[])
    .map(row => ({ id: row.id, name: row.name, tracks: Number(row.tracks), copied: Number(row.copied) }));
}
