/**
 * Per-user state: progress, solved history and blacklist. Every route requires a valid
 * anonymous X-User-Id.
 */
import express, { type RequestHandler } from 'express';
import { db } from '../db.ts';
import { validateBlacklistPayload, validateHistoryPayload, validateProgressPayload, validateUserId } from '../validators.ts';

export const requireUserId: RequestHandler = (req, res, next) => {
  const validatedId = validateUserId(req.headers['x-user-id'] || req.query.userId);
  if (!validatedId) {
    res.status(400).json({
      error: 'Invalid or missing X-User-Id header (must be 3-64 alphanumeric/dash/underscore chars)',
    });
    return;
  }
  req.userId = validatedId;
  next();
};

export function createUserRouter() {
  const router = express.Router();
  router.use(requireUserId);

  router.get('/progress', (req, res) => {
    res.json({ progress: db.getProgress(req.userId) });
  });

  router.post('/progress', (req, res) => {
    const validation = validateProgressPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    res.json({ success: true, progress: db.saveProgress(req.userId, validation.data) });
  });

  router.get('/history', (req, res) => {
    res.json({ history: db.getSolvedHistory(req.userId) });
  });

  router.post('/history/solved', (req, res) => {
    const validation = validateHistoryPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    res.json({ success: true, history: db.recordSolvedPuzzle(req.userId, validation.data) });
  });

  router.get('/blacklist', (req, res) => {
    res.json({ blacklist: db.getBlacklist(req.userId) });
  });

  router.post('/blacklist', (req, res) => {
    const validation = validateBlacklistPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    res.json({ success: true, blacklist: db.addBlacklistItem(req.userId, validation.data) });
  });

  router.delete('/blacklist/:id', (req, res) => {
    const itemId = String(req.params.id).slice(0, 100);
    res.json({ success: true, blacklist: db.removeBlacklistItem(req.userId, itemId) });
  });

  return router;
}
