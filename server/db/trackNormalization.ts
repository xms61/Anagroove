/**
 * Shared track normalization & catalog admission policy.
 * Used by the catalog upsert path, schema migrations, ingest scripts and the validator
 * so every writer applies identical rules.
 */
import { canonicalMusicKey } from '../../shared/musicIdentity.ts';
import { resolveTrackLanguage } from './languageClassifier.ts';

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

export type VersionType =
  | 'original' | 'remaster' | 'cover' | 'instrumental' | 'altered' | 'live' | 'demo'
  | 'rerecord' | 'remix' | 'extended' | 'edit' | 'acoustic' | 'alternate';

// Ordered: the first matching rule wins for a segment.
const VERSION_RULES: [VersionType, RegExp][] = [
  // Tags naming the original release itself ("Single ver.", "Version originale 1981")
  ['original', /\b(original (mix|version|ver\.?)|album mix|version originale|versi[oó]n original|vers[aã]o original|(single|album|lp|main|full|vocal) (version|ver\.?)|full length)(?=\W|$)/i],
  ['cover', /\b(karaoke|tribute|cover|originally performed|in the style of|made famous by)\b/i],
  ['instrumental', /\b(instrumental|inst\.?|off[\s-]?vocal|backing track|no vocals?|minus one)\b/i],
  ['altered', /\b(sped[\s-]?up|speed[\s-]?up|slowed|nightcore|reverb|8d audio|pitched|bass[\s-]?boosted)\b/i],
  ['live', /\b(live|unplugged|in concert|concert version|session|sessions|rehearsal|tour|at (the )?[\w .'-]*(dome|arena|stadium|budokan|coliseum))\b/i],
  ['demo', /\b(demo|early take|alternate take|alt\.? take|outtake|work tape|home recording|rough mix)\b/i],
  ['rerecord', /\b(taylor'?s version|re-?recorded|re-?recording|re-?record|rerecord|new recording)\b/i],
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
// "(Tagalog)", "[English]": a bracket holding only a language name is a language version
const LANGUAGE_SEGMENT = /^(english|japanese|korean|chinese|mandarin|cantonese|spanish|espa[ñn]ol|french|fran[çc]ais|german|deutsch|italian|portuguese|tagalog|filipino|thai|vietnamese|indonesian|malay|russian|hindi|arabic|turkish)$/i;

const LIVE_ALBUM = /\b(live (at|in|from|on|@)|in concert|unplugged|mtv unplugged|live!?$|\(live\)|\[live\]|live recordings?|live session)\b/i;
const COVER_ALBUM = /\b(karaoke|tribute|covers?|cover versions|in the style of)\b/i;
const INSTRUMENTAL_ALBUM = /\b(instrumentals?|off vocal|backing tracks?)\b/i;

function extractVersionSegments(title: unknown): string[] {
  const segments: string[] = [];
  const text = String(title || '');
  for (const match of text.matchAll(/[([（【]([^)\]）】]+)[)\]）】]/g)) {
    segments.push(match[1].trim());
  }
  // Deezer/Spotify style suffixes: "Song - 2011 Remaster", "Song - Live at Wembley"
  const dash = text.match(/\s[-–—]\s([^()[\]]+)$/);
  if (dash) segments.push(dash[1].trim());
  return segments;
}

function classifySegment(segment: string): VersionType | null {
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
export function classifyVersion(title: unknown = '', album: unknown = ''): VersionType {
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
    if (ALTERNATE_VERSION.test(segment) || LANGUAGE_SEGMENT.test(segment)) return 'alternate';
  }

  const albumText = String(album || '');
  if (albumText) {
    if (COVER_ALBUM.test(albumText)) return 'cover';
    if (INSTRUMENTAL_ALBUM.test(albumText)) return 'instrumental';
    if (LIVE_ALBUM.test(albumText)) return 'live';
  }
  return remastered ? 'remaster' : 'original';
}

export function isAcceptedVersion(versionType: unknown): boolean {
  return typeof versionType === 'string' && ACCEPTED_VERSION_TYPES.includes(versionType);
}

/**
 * Removes credit/version decorations so different releases of one song share a title:
 * "Get Lucky (feat. Pharrell Williams) [Radio Edit]" -> "Get Lucky".
 * Unrecognised brackets and dash suffixes are part of the title and are kept.
 */
export function stripVersionTags(title: unknown = ''): string {
  let text = String(title || '');
  text = text.replace(/\s*[([（【]([^)\]）】]+)[)\]）】]/g, (whole, inner) => {
    const segment = inner.trim();
    return classifySegment(segment) || ORIGINAL_SEGMENT.test(segment) || ALTERNATE_VERSION.test(segment) || LANGUAGE_SEGMENT.test(segment) ? '' : whole;
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
export function baseTitleKey(title: unknown = ''): string {
  const stripped = stripVersionTags(title) || String(title || '');
  return canonicalMusicKey(stripped).replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

/**
 * Detects a track's language (ISO 639-1). Script decides for CJK and other non-Latin text;
 * Latin titles use the ELD n-gram detector, deferring to the artist's catalog language when known.
 * See languageClassifier.ts for the full rules.
 */
export function detectTrackLanguage(
  title = '',
  artist = '',
  { isrc = null, artistLanguage = null }: { isrc?: string | null; artistLanguage?: string | null } = {},
): string {
  return resolveTrackLanguage({ title, artist, isrc, artistLanguage });
}

export function isAllowedLanguage(language: unknown): boolean {
  return typeof language === 'string' && ALLOWED_LANGUAGES.includes(language);
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi;
// Zero-width space, word joiner and BOM (built from code points to keep this file ASCII)
const INVISIBLE = new RegExp(`[${String.fromCharCode(0x200b, 0x2060, 0xfeff)}]`, 'g');

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match, code: string) => {
    if (code[0] !== '#') return HTML_ENTITIES[code.toLowerCase()] ?? match;
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  });
}

/**
 * Display text as stored: HTML entities decoded (provider payloads carry "I&#039;m", sometimes
 * double-encoded), invisible characters removed, whitespace collapsed, NFC.
 */
export function cleanDisplayText(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  for (let i = 0; i < 3; i++) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  // Invisible characters go first so the spaces around them collapse (a zero-width space between two spaces)
  return text
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .normalize('NFC')
    .trim();
}

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function normalizeIsrc(isrc: unknown): string | null {
  if (typeof isrc !== 'string') return null;
  const clean = isrc.replace(/[\s-]/g, '').toUpperCase();
  return ISRC_PATTERN.test(clean) ? clean : null;
}

/** 2-letter ISRC registrant prefix (who registered the recording, not its language). */
export function extractIsrcCountryCode(isrc: unknown = ''): string | null {
  const clean = normalizeIsrc(isrc);
  return clean ? clean.slice(0, 2) : null;
}

export function normalizeReleaseYear(year: unknown, now = new Date()): number | null {
  const value = typeof year === 'string' ? parseInt(year.slice(0, 4), 10) : Number(year);
  if (!Number.isInteger(value)) return null;
  return value >= MIN_RELEASE_YEAR && value <= now.getFullYear() + 1 ? value : null;
}

export function normalizeReleaseDate(date: unknown): string | null {
  if (typeof date !== 'string') return null;
  const clean = date.trim();
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(clean) && normalizeReleaseYear(clean) ? clean : null;
}

export function isValidDuration(durationMs: unknown): boolean {
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= MIN_DURATION_MS && durationMs <= MAX_DURATION_MS;
}

// ---------------------------------------------------------------------------
// Popularity
// ---------------------------------------------------------------------------

/**
 * Deezer returns exactly this rank for tracks it has no play data for (18,884 catalog tracks
 * had it, against about 6 per neighbouring value). It says nothing about popularity.
 */
export const DEEZER_PLACEHOLDER_RANK = 100000;

/** A usable Deezer rank, or null (missing, invalid or the placeholder). */
export function normalizeDeezerRank(rank: unknown): number | null {
  const value = Math.round(Number(rank));
  return Number.isFinite(value) && value > 0 && value !== DEEZER_PLACEHOLDER_RANK ? value : null;
}

/**
 * Popularity a new row gets until `recomputeCatalogPopularity` ranks it against the catalog:
 * the Spotify popularity when known, the middle of the scale for a Deezer-ranked track,
 * otherwise 0.
 */
export const PROVISIONAL_POPULARITY = 50;

export function provisionalPopularity(
  { deezerRank = null, spotifyPopularity = null }: { deezerRank?: unknown; spotifyPopularity?: unknown } = {},
): number {
  const spotify = Number(spotifyPopularity);
  if (spotifyPopularity !== null && spotifyPopularity !== undefined && Number.isFinite(spotify)) {
    return Math.max(0, Math.min(100, Math.round(spotify)));
  }
  return normalizeDeezerRank(deezerRank) ? PROVISIONAL_POPULARITY : 0;
}
