/**
 * Authenticity filter for catalog crawling and harvesting.
 * Strictly disqualifies covers, karaoke, tributes, fanmade versions,
 * soundalike tribute ensembles, and tracks lacking valid audio previews.
 */
import { isAuthenticMetadata } from '../policy/authenticityRules.js';

/** A provider track in any of the shapes the crawlers see (Deezer, iTunes, catalog rows). */
export interface RawTrack {
  title?: unknown;
  trackName?: unknown;
  name?: unknown;
  artist?: unknown;
  artistName?: unknown;
  album?: unknown;
  collectionName?: unknown;
  preview?: string;
  previewUrl?: string;
  sample_url?: string;
  duration?: number;
  duration_ms?: number;
  trackTimeMillis?: number;
}

const nested = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;

/** Title, artist, a playable preview (unless not required), a song-length duration and the authenticity rules. */
export function isAuthenticCandidate(rawTrack: RawTrack = {}, options: { requireSample?: boolean } = {}): boolean {
  const { requireSample = true } = options;
  const title = (
    typeof rawTrack.title === 'string' ? rawTrack.title :
    typeof rawTrack.trackName === 'string' ? rawTrack.trackName :
    typeof rawTrack.name === 'string' ? rawTrack.name : ''
  ).trim();

  const artist = (
    typeof rawTrack.artist === 'string' ? rawTrack.artist :
    typeof nested(rawTrack.artist, 'name') === 'string' ? nested(rawTrack.artist, 'name') as string :
    typeof rawTrack.artistName === 'string' ? rawTrack.artistName : ''
  ).trim();

  const album = (
    typeof rawTrack.album === 'string' ? rawTrack.album :
    typeof nested(rawTrack.album, 'title') === 'string' ? nested(rawTrack.album, 'title') as string :
    typeof rawTrack.collectionName === 'string' ? rawTrack.collectionName : ''
  ).trim();
  const sampleUrl = rawTrack.preview || rawTrack.previewUrl || rawTrack.sample_url || '';
  const durationSec = rawTrack.duration || (rawTrack.duration_ms ? rawTrack.duration_ms / 1000 : (rawTrack.trackTimeMillis ? rawTrack.trackTimeMillis / 1000 : 0));

  // Must have non-empty title and artist
  if (!title || !artist) return false;

  // Must have active, valid preview URL (if requireSample is true)
  if (requireSample && (!sampleUrl || typeof sampleUrl !== 'string' || !sampleUrl.startsWith('http'))) {
    return false;
  }

  // Duration guard: standard musical recording (between 45s and 20 mins)
  if (durationSec > 0 && (durationSec < 45 || durationSec > 1200)) {
    return false;
  }

  // Cover / karaoke / utility / spoken-word rules shared with the catalog and song selection
  return isAuthenticMetadata({ title, artist, album });
}
