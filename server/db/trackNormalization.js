/**
 * Shared track normalization & catalog admission policy.
 * Used by the catalog upsert path, schema migrations, ingest scripts and the validator
 * so every writer applies identical rules.
 */
import { canonicalMusicKey } from '../../shared/musicIdentity.js';
import { resolveTrackLanguage } from './languageClassifier.js';

/** Catalog language policy (decision 2026-09-23): only English, Japanese and Korean. */
export const ALLOWED_LANGUAGES = Object.freeze(['en', 'ja', 'ko']);

/** Catalog version policy: only the original recording (a remaster is the same recording). */
export const ACCEPTED_VERSION_TYPES = Object.freeze(['original', 'remaster']);

export const MIN_DURATION_MS = 45 * 1000;
export const MAX_DURATION_MS = 20 * 60 * 1000;
export const MIN_RELEASE_YEAR = 1900;

// ---------------------------------------------------------------------------
// Version classification
// ---------------------------------------------------------------------------

// Ordered: the first matching rule wins for a segment.
const VERSION_RULES = [
  ['original', /\b(original mix|album mix|original version)\b/i],
  ['cover', /\b(karaoke|tribute|cover|originally performed|in the style of|made famous by)\b/i],
  ['instrumental', /\b(instrumental|inst\.?|off[\s-]?vocal|backing track|no vocals?|minus one)\b/i],
  ['altered', /\b(sped[\s-]?up|speed[\s-]?up|slowed|nightcore|reverb|8d audio|pitched|bass[\s-]?boosted)\b/i],
  ['live', /\b(live|unplugged|in concert|concert version|session|sessions|rehearsal)\b/i],
  ['demo', /\b(demo|early take|alternate take|alt\.? take|outtake|work tape|home recording|rough mix)\b/i],
  ['rerecord', /\b(taylor'?s version|re-?recorded|re-?record|rerecord|new recording)\b/i],
  ['remix', /\b(remix|rmx|re-?mix|mix|dub|bootleg|flip|rework|edit mix)\b/i],
  ['extended', /\b(extended|long version|12["”]? version|12 inch)\b/i],
  ['edit', /\b(radio edit|single edit|radio version|edit|short version|clean edit)\b/i],
  ['acoustic', /\b(acoustic|stripped|piano version|orchestral|symphonic|a[\s-]?cappella|unplugged version)\b/i],
  ['remaster', /\b(re-?master(ed)?|anniversary|expanded|deluxe|mono|stereo)\b/i],
];

// Segments that describe the original recording or its credits, not a different version.
const ORIGINAL_SEGMENT = /\b(feat\.?|ft\.?|featuring|with|prod\.?|produced by|from|original|album version|single version|lp version|main version|explicit|clean|bonus track|theme from|soundtrack|ost|op|ed|opening|ending)\b/i;
// "(Japanese Version)", "(English Ver.)": language/alternate versions of the song.
const ALTERNATE_VERSION = /\b(version|ver\.?)\b/i;

const LIVE_ALBUM = /\b(live (at|in|from|on|@)|in concert|unplugged|mtv unplugged|live!?$|\(live\)|\[live\]|live recordings?|live session)\b/i;
const COVER_ALBUM = /\b(karaoke|tribute|covers?|cover versions|in the style of)\b/i;
const INSTRUMENTAL_ALBUM = /\b(instrumentals?|off vocal|backing tracks?)\b/i;

function extractVersionSegments(title) {
  const segments = [];
  const text = String(title || '');
  for (const match of text.matchAll(/[([（【]([^)\]）】]+)[)\]）】]/g)) {
    segments.push(match[1].trim());
  }
  // Deezer/Spotify style suffixes: "Song - 2011 Remaster", "Song - Live at Wembley"
  const dash = text.match(/\s[-–—]\s([^()[\]]+)$/);
  if (dash) segments.push(dash[1].trim());
  return segments;
}

function classifySegment(segment) {
  for (const [type, pattern] of VERSION_RULES) {
    if (pattern.test(segment)) return type;
  }
  return null;
}

/**
 * Classifies a recording as 'original', 'remaster', or a non-original variant
 * ('live', 'remix', 'edit', 'extended', 'acoustic', 'instrumental', 'demo',
 * 'rerecord', 'altered', 'cover', 'alternate').
 */
export function classifyVersion(title = '', album = '') {
  let remastered = false;
  for (const segment of extractVersionSegments(title)) {
    const type = classifySegment(segment);
    if (type === 'original') continue;
    if (type === 'remaster') {
      remastered = true;
      continue;
    }
    if (type) return type;
    if (ORIGINAL_SEGMENT.test(segment)) continue;
    if (ALTERNATE_VERSION.test(segment)) return 'alternate';
  }

  const albumText = String(album || '');
  if (albumText) {
    if (COVER_ALBUM.test(albumText)) return 'cover';
    if (INSTRUMENTAL_ALBUM.test(albumText)) return 'instrumental';
    if (LIVE_ALBUM.test(albumText)) return 'live';
  }
  return remastered ? 'remaster' : 'original';
}

export function isAcceptedVersion(versionType) {
  return ACCEPTED_VERSION_TYPES.includes(versionType);
}

/**
 * Removes credit/version decorations so different releases of one song share a title:
 * "Get Lucky (feat. Pharrell Williams) [Radio Edit]" -> "Get Lucky".
 * Unrecognised brackets and dash suffixes are part of the title and are kept.
 */
export function stripVersionTags(title = '') {
  let text = String(title || '');
  text = text.replace(/\s*[([（【]([^)\]）】]+)[)\]）】]/g, (whole, inner) => {
    const segment = inner.trim();
    return classifySegment(segment) || ORIGINAL_SEGMENT.test(segment) || ALTERNATE_VERSION.test(segment) ? '' : whole;
  });
  text = text.replace(/\s[-–—]\s([^()[\]]+)$/, (whole, suffix) => {
    const segment = suffix.trim();
    return classifySegment(segment) || ORIGINAL_SEGMENT.test(segment) || ALTERNATE_VERSION.test(segment) ? '' : whole;
  });
  return text.trim();
}

/**
 * Unicode-aware dedupe key for a song title (no spaces). Keeps kana, hangul and kanji,
 * so non-Latin titles no longer collapse to an empty key.
 */
export function baseTitleKey(title = '') {
  const stripped = stripVersionTags(title) || String(title || '');
  return canonicalMusicKey(stripped).replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

/**
 * Detects a track's language (ISO 639-1). Script decides for CJK and other non-Latin text;
 * Latin titles use the ELD n-gram detector, deferring to the artist's catalog language when known.
 * See languageClassifier.js for the full rules.
 */
export function detectTrackLanguage(title = '', artist = '', { isrc = null, artistLanguage = null } = {}) {
  return resolveTrackLanguage({ title, artist, isrc, artistLanguage });
}

export function isAllowedLanguage(language) {
  return ALLOWED_LANGUAGES.includes(language);
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function normalizeIsrc(isrc) {
  if (typeof isrc !== 'string') return null;
  const clean = isrc.replace(/[\s-]/g, '').toUpperCase();
  return ISRC_PATTERN.test(clean) ? clean : null;
}

/** 2-letter ISRC registrant prefix (who registered the recording, not its language). */
export function extractIsrcCountryCode(isrc = '') {
  const clean = normalizeIsrc(isrc);
  return clean ? clean.slice(0, 2) : null;
}

export function normalizeReleaseYear(year, now = new Date()) {
  const value = typeof year === 'string' ? parseInt(year.slice(0, 4), 10) : Number(year);
  if (!Number.isInteger(value)) return null;
  return value >= MIN_RELEASE_YEAR && value <= now.getFullYear() + 1 ? value : null;
}

export function normalizeReleaseDate(date) {
  if (typeof date !== 'string') return null;
  const clean = date.trim();
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(clean) && normalizeReleaseYear(clean) ? clean : null;
}

export function isValidDuration(durationMs) {
  return Number.isFinite(durationMs) && durationMs >= MIN_DURATION_MS && durationMs <= MAX_DURATION_MS;
}

// ---------------------------------------------------------------------------
// Popularity
// ---------------------------------------------------------------------------

/**
 * Maps a Deezer rank (0 - ~1,000,000) onto the Spotify-style 0-100 popularity scale.
 *
 * Calibrated on the 6,681 catalog tracks that carry both a Deezer rank and a Spotify
 * popularity (Anna's Archive top-10k): their median Deezer rank (~562k, log10 5.75)
 * sits at Spotify ~76. The sample only covers hits, so the slope is a documented
 * choice: +20 points per 10x rank, giving rank 10k -> 41, 100k -> 61, 1M -> 81,
 * and the "> 30" admission floor at roughly rank 2,800.
 */
export const DEEZER_SCORE_SLOPE = 20;
export const DEEZER_SCORE_OFFSET = -39;

export function deezerRankToScore(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const score = Math.round(DEEZER_SCORE_SLOPE * Math.log10(value) + DEEZER_SCORE_OFFSET);
  return Math.max(0, Math.min(100, score));
}

/**
 * Single 0-100 popularity score. Spotify popularity is the reference when present;
 * otherwise a Deezer rank is mapped; a legacy `popularity` above 100 is a Deezer rank.
 */
export function normalizePopularity({ popularity = null, deezerRank = null, spotifyPopularity = null } = {}) {
  const spotify = Number(spotifyPopularity);
  if (spotifyPopularity !== null && spotifyPopularity !== undefined && Number.isFinite(spotify)) {
    return Math.max(0, Math.min(100, Math.round(spotify)));
  }
  const rank = Number(deezerRank);
  if (deezerRank !== null && deezerRank !== undefined && Number.isFinite(rank) && rank > 0) {
    return deezerRankToScore(rank);
  }
  const legacy = Number(popularity);
  if (!Number.isFinite(legacy) || legacy <= 0) return 0;
  return legacy > 100 ? deezerRankToScore(legacy) : Math.round(legacy);
}
