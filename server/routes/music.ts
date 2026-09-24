/**
 * Music routes: stable preview redirects, random song pools and live puzzle generation.
 */
import express from 'express';
import { db } from '../db.ts';
import { getRandomSongPool } from '../selection/songPool.ts';
import { generateLiveCrossword, type LiveSong } from '../../shared/liveCrossword.ts';
import { resolvePreviewRef } from '../services/previewResolver.ts';
import { ProviderBudgetError } from '../crawler/rateLimiter.ts';
import { parseLanguageFilter, validateLivePuzzlePayload, validateMusicQuery, validatePreviewRef, validateUserId } from '../validators.ts';
import { logger } from '../logger.ts';
import { errorMessage } from '../errors.ts';
import type { LivePuzzleStore } from '../http/livePuzzleStore.ts';

const stackOf = (err: unknown) => (err instanceof Error ? err.stack : undefined);

export function createMusicRouter({ livePuzzles }: { livePuzzles: LivePuzzleStore }) {
  const router = express.Router();

  // Stable audio preview redirect. Puzzles embed /api/preview/<provider>:<id> because Deezer's
  // signed preview URLs expire within minutes; each play is redirected to a freshly minted URL.
  router.get('/preview/:ref', async (req, res) => {
    const ref = validatePreviewRef(req.params.ref);
    if (!ref) {
      return res.status(400).json({ error: 'Invalid preview reference' });
    }
    try {
      const url = await resolvePreviewRef(ref);
      if (!url || !/^https?:\/\//.test(url)) {
        return res.status(404).json({ error: 'No audio preview available for this track' });
      }
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.redirect(302, url);
    } catch (err) {
      if (err instanceof ProviderBudgetError) {
        res.setHeader('Retry-After', '5');
        return res.status(503).json({ error: 'Audio previews are busy. Try again in a few seconds.' });
      }
      logger.warn('preview', `Preview resolution failed for ${ref}: ${errorMessage(err)}`);
      return res.status(502).json({ error: 'Audio preview provider unavailable' });
    }
  });

  // Randomized recognizable music pool with input validation
  router.get('/music/random', async (req, res) => {
    try {
      const validatedQuery = validateMusicQuery(req.query as Record<string, unknown>);
      const rawUserId = req.headers['x-user-id'];
      const userId = rawUserId ? validateUserId(rawUserId) : null;

      const songs = await getRandomSongPool({
        genre: validatedQuery.genre,
        minFans: validatedQuery.minFans,
        count: validatedQuery.count,
        blacklist: userId ? db.getBlacklist(userId) : [],
        recentIds: validatedQuery.recentIds,
        prompt: validatedQuery.prompt,
        artist: validatedQuery.artist,
        album: validatedQuery.album,
        decade: validatedQuery.decade,
        popularity: validatedQuery.popularity,
        seed: validatedQuery.seed,
        languages: parseLanguageFilter(req.query.languages).languages,
      });

      res.json({ success: true, count: songs.length, songs });
    } catch (err) {
      logger.error('music', `Error generating random music pool: ${errorMessage(err)}`, stackOf(err));
      res.status(500).json({ error: 'Failed to generate recognizable song pool' });
    }
  });

  // Builds one complete puzzle on the server so every multiplayer participant
  // receives the host's same, already-selected tracks and grid.
  router.post('/puzzles/live', async (req, res) => {
    const userId = validateUserId(req.headers['x-user-id']);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid or missing X-User-Id header (must be 3-64 alphanumeric/dash/underscore chars)' });
    }

    const validation = validateLivePuzzlePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const { genre, minFans, targetWords, recentIds, prompt, artist, album, decade, popularity, seed, languages } = validation.data;

      logger.info('puzzle', `Generating live puzzle | genre: ${genre}, popularity: ${popularity}, prompt: ${JSON.stringify(prompt || '')}`);
      const genStart = Date.now();

      const songs = await getRandomSongPool({
        genre,
        minFans,
        count: Math.min(40, targetWords + 12),
        blacklist: db.getBlacklist(userId),
        recentIds,
        prompt,
        artist,
        album,
        decade,
        popularity,
        seed,
        languages,
      });

      if (songs.length < 6) {
        logger.warn('puzzle', `Insufficient eligible tracks (${songs.length}) for request`);
        return res.status(422).json({
          error: 'Not enough eligible tracks are currently available for this selection. Try broader settings or another prompt.',
          available: songs.length,
        });
      }

      const puzzleTitle = prompt
        ? `⚡ Live: ${prompt.slice(0, 30)}`
        : artist
          ? `⚡ Live: ${artist}`
          : `⚡ Live: ${genre === 'all' ? (popularity === 'pure' ? 'Pure Universe' : 'Eclectic Hits') : genre}`;

      // Every picked song has its answer, clue and a preview path (songPool.attachPreviewRefs)
      const puzzle = generateLiveCrossword(songs as LiveSong[], puzzleTitle, targetWords);
      if (!puzzle) {
        logger.warn('puzzle', `Crossword generator could not place words from ${songs.length} candidates`);
        return res.status(422).json({
          error: 'Eligible tracks could not form an intersecting crossword. Please try again.',
          available: songs.length,
        });
      }

      const livePuzzleToken = livePuzzles.add(puzzle);
      const gridSize = `${puzzle.grid?.length || 0}x${puzzle.grid?.[0]?.length || 0}`;
      logger.puzzle(puzzleTitle, puzzle.clues?.length || 0, targetWords, gridSize, Date.now() - genStart);

      res.json({
        success: true,
        puzzle,
        livePuzzleToken,
        selection: {
          provider: 'deezer',
          candidateCount: songs.length,
          genre,
          minFans,
          popularity,
          artist,
          album,
          prompt,
          seed,
          languages: languages || null,
        },
      });
    } catch (err) {
      logger.error('puzzle', `Error generating live puzzle: ${errorMessage(err)}`, stackOf(err));
      res.status(503).json({ error: 'Live music discovery is temporarily unavailable. Please try again.' });
    }
  });

  return router;
}
