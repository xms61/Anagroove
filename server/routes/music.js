/**
 * Music routes: stable preview redirects, random song pools and live puzzle generation.
 */
import express from 'express';
import { db } from '../db.ts';
import { getRandomSongPool } from '../selection/songPool.ts';
import { generateLiveCrossword } from '../../shared/liveCrossword.ts';
import { resolvePreviewRef } from '../services/previewResolver.ts';
import { parseLanguageFilter, validateLivePuzzlePayload, validateMusicQuery, validatePreviewRef, validateUserId } from '../validators.js';
import { logger } from '../logger.js';

export function createMusicRouter({ livePuzzles }) {
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
      logger.warn('preview', `Preview resolution failed for ${ref}: ${err.message}`);
      return res.status(502).json({ error: 'Audio preview provider unavailable' });
    }
  });

  // Randomized recognizable music pool with input validation
  router.get('/music/random', async (req, res) => {
    try {
      const validatedQuery = validateMusicQuery(req.query);
      const rawUserId = req.headers['x-user-id'] || req.query.userId;
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
      logger.error('music', `Error generating random music pool: ${err.message}`, err.stack);
      res.status(500).json({ error: 'Failed to generate recognizable song pool' });
    }
  });

  // Builds one complete puzzle on the server so every multiplayer participant
  // receives the host's same, already-selected tracks and grid.
  router.post('/puzzles/live', async (req, res) => {
    const rawUserId = req.headers['x-user-id'] || req.query.userId;
    const userId = validateUserId(rawUserId);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid or missing X-User-Id header (must be 3-64 alphanumeric/dash/underscore chars)' });
    }

    const validation = validateLivePuzzlePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const { genre, minFans, targetWords, recentIds, prompt, artist, album, decade, popularity, seed, languages } = validation.data;

      logger.info('puzzle', `Generating live puzzle for user "${userId}" | genre: ${genre}, popularity: ${popularity}, prompt: "${prompt || ''}"`);
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

      const puzzle = generateLiveCrossword(songs, puzzleTitle, targetWords);
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
      logger.error('puzzle', `Error generating live puzzle: ${err.message}`, err.stack);
      res.status(503).json({ error: 'Live music discovery is temporarily unavailable. Please try again.' });
    }
  });

  return router;
}
