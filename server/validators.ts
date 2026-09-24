/**
 * Input validation and sanitization for Anagroove backend endpoints & WebSockets.
 */

import type { BlacklistType } from './db/userStore.ts';

/** A validated value, or the reason it was rejected. */
export type Validation<T> = { valid: true; data: T; error?: undefined } | { valid: false; error: string; data?: undefined };

type Body = Record<string, unknown>;
const isBody = (body: unknown): body is Body => Boolean(body) && typeof body === 'object';

/** A WebSocket message after validation; room handlers read the fields their action needs. */
export type WsMessage = Body & {
  action: string;
  playerId?: string;
  playerName?: string;
  roomCode?: string;
  resumeToken?: string;
  livePuzzleToken?: string;
  row?: number;
  col?: number;
  char?: string;
  progress?: number;
};

const USER_ID_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
const ROOM_CODE_REGEX = /^[A-Za-z]{3,10}-\d{2,4}$/;
const RESUME_TOKEN_REGEX = /^[a-f0-9]{32}$/;
const PREVIEW_REF_REGEX = /^(deezer|itunes|catalog):\d{1,20}$/;

/** Validates a stable audio preview reference ("deezer:123", "itunes:456", "catalog:7"). */
export function validatePreviewRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  return PREVIEW_REF_REGEX.test(trimmed) ? trimmed : null;
}

/** The trimmed anonymous user id, or null when its format or length is invalid. */
export function validateUserId(userId: unknown): string | null {
  if (typeof userId !== 'string') return null;
  const trimmed = userId.trim();
  if (!USER_ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates progress save payload
 */
export function validateProgressPayload(body: unknown): Validation<{ puzzleId: string; themeId: string; userLetters: string[][]; validity: unknown[] }> {
  if (!isBody(body)) return { valid: false, error: 'Invalid payload body' };

  const { puzzleId, themeId, userLetters, validity } = body;

  if (typeof puzzleId !== 'string' || puzzleId.length < 1 || puzzleId.length > 100) {
    return { valid: false, error: 'Invalid puzzleId' };
  }

  if (themeId && (typeof themeId !== 'string' || themeId.length > 50)) {
    return { valid: false, error: 'Invalid themeId' };
  }

  if (!Array.isArray(userLetters) || userLetters.length === 0 || userLetters.length > 30) {
    return { valid: false, error: 'Invalid userLetters grid dimensions' };
  }

  const firstRow: unknown = userLetters[0];
  if (!Array.isArray(firstRow) || firstRow.length === 0 || firstRow.length > 30) {
    return { valid: false, error: 'Invalid userLetters grid columns' };
  }
  const cols = firstRow.length;

  for (const row of userLetters) {
    if (!Array.isArray(row) || row.length !== cols) {
      return { valid: false, error: 'Inconsistent grid rows in userLetters' };
    }
    for (const cell of row) {
      if (typeof cell !== 'string' || cell.length > 1) {
        return { valid: false, error: 'Grid cells must be single-character strings or empty' };
      }
    }
  }

  if (validity) {
    if (!Array.isArray(validity) || validity.length !== userLetters.length) {
      return { valid: false, error: 'Invalid validity dimensions' };
    }
    const allowed = new Set<unknown>(['untested', 'correct', 'wrong', 'incorrect', null, '']);
    for (const row of validity) {
      if (!Array.isArray(row) || row.length !== cols) {
        return { valid: false, error: 'Inconsistent grid rows in validity' };
      }
      for (const cell of row) {
        if (!allowed.has(cell)) {
          return { valid: false, error: 'Invalid validity value' };
        }
      }
    }
  }

  return {
    valid: true,
    data: {
      puzzleId: puzzleId.trim(),
      themeId: typeof themeId === 'string' ? themeId.trim() : 'mixed',
      userLetters: userLetters as string[][],
      validity: Array.isArray(validity) ? validity : []
    }
  };
}

/**
 * Validates history save payload
 */
export function validateHistoryPayload(body: unknown): Validation<{ puzzleId: string; title: string; cluesCount: number; timeSeconds: number }> {
  if (!isBody(body)) return { valid: false, error: 'Invalid payload body' };

  const { puzzleId, title, cluesCount, timeSeconds } = body;

  if (typeof puzzleId !== 'string' || puzzleId.length < 1 || puzzleId.length > 100) {
    return { valid: false, error: 'Invalid puzzleId' };
  }

  const clues = parseInt(String(cluesCount));
  if (isNaN(clues) || clues < 0 || clues > 150) {
    return { valid: false, error: 'Invalid cluesCount' };
  }

  const time = parseFloat(String(timeSeconds));
  if (isNaN(time) || time < 0 || time > 86400) {
    return { valid: false, error: 'Invalid timeSeconds' };
  }

  return {
    valid: true,
    data: {
      puzzleId: puzzleId.trim(),
      title: typeof title === 'string' ? title.slice(0, 200).trim() : 'Untitled Puzzle',
      cluesCount: clues,
      timeSeconds: time
    }
  };
}

/**
 * Validates blacklist payload
 */
export function validateBlacklistPayload(body: unknown): Validation<{ name: string; type: BlacklistType; provider?: string; providerArtistId?: string; providerTrackId?: string }> {
  if (!isBody(body)) return { valid: false, error: 'Invalid payload body' };

  const { name, type, provider, providerArtistId, providerTrackId } = body;

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    return { valid: false, error: 'Name must be between 1 and 100 characters' };
  }

  if (type !== 'artist' && type !== 'song') {
    return { valid: false, error: 'Type must be either "artist" or "song"' };
  }

  const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  const artistId = typeof providerArtistId === 'string' || typeof providerArtistId === 'number'
    ? String(providerArtistId).trim().slice(0, 100)
    : '';
  const trackId = typeof providerTrackId === 'string' || typeof providerTrackId === 'number'
    ? String(providerTrackId).trim().slice(0, 100)
    : '';

  if (normalizedProvider && !/^[a-z0-9_-]{1,30}$/.test(normalizedProvider)) {
    return { valid: false, error: 'Invalid music provider' };
  }

  return {
    valid: true,
    data: {
      name: name.trim(),
      type,
      ...(normalizedProvider ? { provider: normalizedProvider } : {}),
      ...(type === 'artist' && artistId ? { providerArtistId: artistId } : {}),
      ...(type === 'song' && trackId ? { providerTrackId: trackId } : {}),
    }
  };
}

/**
 * Validates an on-demand live puzzle request.
 */
const PUZZLE_LANGUAGES = ['en', 'ja', 'ko'];

/**
 * Optional language filter: an array (JSON body) or comma list (query string) of en/ja/ko.
 * `languages` is undefined when not set.
 */
export function parseLanguageFilter(value: unknown): { valid: boolean; languages?: string[] } {
  if (value === undefined || value === null || value === '') return { valid: true, languages: undefined };
  const list: unknown[] | null = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!list || list.length > 3) return { valid: false };
  const languages = [...new Set(list.map(v => String(v).trim().toLowerCase()))];
  if (!languages.every(l => PUZZLE_LANGUAGES.includes(l))) return { valid: false };
  return { valid: true, languages: languages.length > 0 ? languages : undefined };
}

export interface LivePuzzleRequest {
  genre: string;
  minFans: number;
  targetWords: number;
  recentIds: string[];
  prompt: string;
  artist: string;
  album: string;
  decade: string;
  popularity?: string;
  seed?: string;
  languages?: string[];
}

export function validateLivePuzzlePayload(body: unknown): Validation<LivePuzzleRequest> {
  if (!isBody(body)) return { valid: false, error: 'Invalid payload body' };
  if (body.genre !== undefined && typeof body.genre !== 'string') return { valid: false, error: 'Invalid genre' };
  if (body.prompt !== undefined && typeof body.prompt !== 'string') return { valid: false, error: 'Invalid prompt' };
  if (body.artist !== undefined && typeof body.artist !== 'string') return { valid: false, error: 'Invalid artist' };
  if (body.album !== undefined && typeof body.album !== 'string') return { valid: false, error: 'Invalid album' };
  if (body.decade !== undefined && typeof body.decade !== 'string') return { valid: false, error: 'Invalid decade' };
  if (body.popularity !== undefined && typeof body.popularity !== 'string') return { valid: false, error: 'Invalid popularity' };
  if (body.minFans !== undefined && !Number.isFinite(Number(body.minFans))) return { valid: false, error: 'Invalid minFans' };
  if (body.targetWords !== undefined && !Number.isFinite(Number(body.targetWords))) return { valid: false, error: 'Invalid targetWords' };
  if (body.recentIds !== undefined && !Array.isArray(body.recentIds)) return { valid: false, error: 'recentIds must be an array' };
  const languageFilter = parseLanguageFilter(body.languages);
  if (!languageFilter.valid) return { valid: false, error: 'languages must be a list of en, ja, ko' };

  const rawGenre = typeof body.genre === 'string' ? body.genre.trim().toLowerCase() : 'all';
  const genre = rawGenre.replace(/[^a-z0-9_\s-]/g, '').slice(0, 50) || 'all';
  const minFans = Math.max(0, Math.min(50000000, parseInt(String(body.minFans)) || 250000));
  const targetWords = Math.max(6, Math.min(15, parseInt(String(body.targetWords)) || 10));
  const recentIds = Array.isArray(body.recentIds)
    ? (body.recentIds as unknown[])
      .slice(-50)
      .filter(id => typeof id === 'string' || typeof id === 'number')
      .map(id => String(id).trim().slice(0, 100))
      .filter(Boolean)
    : [];

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 200) : '';
  const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, 100) : '';
  const album = typeof body.album === 'string' ? body.album.trim().slice(0, 100) : '';
  const decade = typeof body.decade === 'string' ? body.decade.trim().slice(0, 20) : '';
  const popularity = typeof body.popularity === 'string' && ['pure', 'obscure', 'indie', 'balanced', 'mainstream'].includes(body.popularity.toLowerCase().trim())
    ? body.popularity.toLowerCase().trim()
    : undefined;
  const seed = body.seed !== undefined && body.seed !== null ? String(body.seed).trim().slice(0, 64) : undefined;

  return {
    valid: true,
    data: {
      genre,
      minFans,
      targetWords,
      recentIds,
      prompt,
      artist,
      album,
      decade,
      popularity,
      seed,
      languages: languageFilter.languages,
    }
  };
}

/**
 * Validates and sanitizes random music query parameters
 */
export function validateMusicQuery(query: Record<string, unknown>) {
  const genre = typeof query.genre === 'string' ? query.genre.slice(0, 50).toLowerCase().replace(/[^a-z0-9_\s-]/g, '') : 'all';
  const minFans = Math.max(0, Math.min(50000000, parseInt(String(query.minFans)) || 250000));
  const count = Math.max(1, Math.min(50, parseInt(String(query.count)) || 25));
  
  let recentIds: string[] = [];
  if (typeof query.recent === 'string') {
    recentIds = query.recent
      .split(',')
      .slice(0, 50)
      .map(id => id.trim().slice(0, 100))
      .filter(id => id.length > 0);
  }

  const prompt = typeof query.prompt === 'string' ? query.prompt.trim().slice(0, 200) : '';
  const artist = typeof query.artist === 'string' ? query.artist.trim().slice(0, 100) : '';
  const album = typeof query.album === 'string' ? query.album.trim().slice(0, 100) : '';
  const decade = typeof query.decade === 'string' ? query.decade.trim().slice(0, 20) : '';
  const popularity = typeof query.popularity === 'string' && ['pure', 'obscure', 'indie', 'balanced', 'mainstream'].includes(query.popularity.toLowerCase().trim())
    ? query.popularity.toLowerCase().trim()
    : undefined;
  const seed = query.seed !== undefined && query.seed !== null ? String(query.seed).trim().slice(0, 64) : undefined;

  return {
    genre: genre || 'all',
    minFans,
    count,
    recentIds,
    prompt,
    artist,
    album,
    decade,
    popularity,
    seed,
  };
}

/**
 * Validates WebSocket messages
 */
const ALLOWED_WS_ACTIONS = new Set([
  'create_room',
  'join_room',
  'start_game',
  'coop_cell_update',
  'race_progress_update',
  'puzzle_solved'
]);

export function validateWsMessage(message: unknown): Validation<WsMessage> {
  if (!isBody(message)) {
    return { valid: false, error: 'Invalid message payload' };
  }
  const data = message as WsMessage;

  if (!ALLOWED_WS_ACTIONS.has(data.action)) {
    return { valid: false, error: `Unrecognized action: ${data.action}` };
  }

  if (data.playerId && !USER_ID_REGEX.test(String(data.playerId))) {
    return { valid: false, error: 'Invalid playerId format' };
  }

  if ((data.action === 'create_room' || data.action === 'join_room') && !data.playerId) {
    return { valid: false, error: 'playerId is required to create or join a room' };
  }

  if (data.resumeToken !== undefined && (typeof data.resumeToken !== 'string' || !RESUME_TOKEN_REGEX.test(data.resumeToken))) {
    return { valid: false, error: 'Invalid resumeToken format' };
  }

  if (data.roomCode) {
    const code = String(data.roomCode).toUpperCase().trim();
    if (!ROOM_CODE_REGEX.test(code)) {
      return { valid: false, error: 'Invalid roomCode format' };
    }
    data.roomCode = code;
  }

  if (data.playerName) {
    data.playerName = String(data.playerName).slice(0, 30).trim();
  }

  if (data.action === 'create_room') {
    if (typeof data.livePuzzleToken !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.livePuzzleToken)) {
      return { valid: false, error: 'A server-generated live puzzle token is required to create a room' };
    }
  }

  if (data.action === 'coop_cell_update') {
    const row = parseInt(String(data.row));
    const col = parseInt(String(data.col));
    if (isNaN(row) || row < 0 || row > 30 || isNaN(col) || col < 0 || col > 30) {
      return { valid: false, error: 'Invalid row or col coordinates' };
    }
    data.row = row;
    data.col = col;
    data.char = typeof data.char === 'string' ? data.char.slice(0, 1) : '';
  }

  if (data.action === 'race_progress_update') {
    const progress = parseFloat(String(data.progress));
    if (isNaN(progress) || progress < 0 || progress > 100) {
      return { valid: false, error: 'Progress must be a number between 0 and 100' };
    }
    data.progress = progress;
  }

  return { valid: true, data };
}
