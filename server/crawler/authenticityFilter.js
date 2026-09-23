/**
 * Authenticity filter for catalog crawling and harvesting.
 * Strictly disqualifies covers, karaoke, tributes, fanmade versions,
 * soundalike tribute ensembles, and tracks lacking valid audio previews.
 */
import { isAuthenticMetadata } from '../policy/authenticityRules.js';


export function isAuthenticCandidate(rawTrack = {}, options = {}) {
  const { requireSample = true } = options;
  const title = (
    typeof rawTrack.title === 'string' ? rawTrack.title :
    typeof rawTrack.trackName === 'string' ? rawTrack.trackName :
    typeof rawTrack.name === 'string' ? rawTrack.name : ''
  ).trim();

  const artist = (
    typeof rawTrack.artist === 'string' ? rawTrack.artist :
    typeof rawTrack.artist?.name === 'string' ? rawTrack.artist.name :
    typeof rawTrack.artistName === 'string' ? rawTrack.artistName : ''
  ).trim();

  const album = (
    typeof rawTrack.album === 'string' ? rawTrack.album :
    typeof rawTrack.album?.title === 'string' ? rawTrack.album.title :
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
