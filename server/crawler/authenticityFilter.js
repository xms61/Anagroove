/**
 * Authenticity filter for catalog crawling and harvesting.
 * Strictly disqualifies covers, karaoke, tributes, fanmade versions,
 * soundalike tribute ensembles, and tracks lacking valid audio previews.
 */

const EXCLUDED_TITLE_PATTERNS = [
  /\bcover\b/i,
  /\btribute\b/i,
  /\bkaraoke\b/i,
  /\bfanmade\b/i,
  /\bremake\b/i,
  /\bparody\b/i,
  /\bacoustic\s+cover\b/i,
  /\bmetal\s+cover\b/i,
  /\bpiano\s+cover\b/i,
  /\bguitar\s+cover\b/i,
  /\bviolin\s+cover\b/i,
  /\borchestral\s+cover\b/i,
  /\bmusic\s+box\b/i,
  /\blullaby\b/i,
  /\blo-?fi\s+remix\b/i,
  /\bphonk\s+remix\b/i,
  /\bslowed\s*\+?\s*reverb\b/i,
  /\bpitched\b/i,
  /\bsped\s+up\b/i,
  /\bnightcore\b/i,
  /\bbacking\s+track\b/i,
  /\bin\s+the\s+style\s+of\b/i,
  /\boriginally\s+performed\s+by\b/i,
  /\b8-?bit\b/i,
  /\bworkout\s+mix\b/i,
  /\bfitness\s+beats\b/i,
  /\bwhite\s+noise\b/i,
  /\bsoundtrack\s+cue\b/i,
];

const EXCLUDED_ARTIST_PATTERNS = [
  /\bkaraoke\b/i,
  /\btribute\b/i,
  /\bsoundalike\b/i,
  /\bthe\s+hit\s+crew\b/i,
  /\bcountdown\s+singers\b/i,
  /\bcover\s+band\b/i,
  /\bcover\s+crew\b/i,
  /\bmidifine\b/i,
  /\bkaraoke\s+all\s*stars\b/i,
  /\blittle\s+v\.?\b/i,
  /\bpellek\b/i,
  /\bshironeko\b/i,
  /\bpickin'\s+on\b/i,
  /\brockabye\s+baby!?\b/i,
  /\bsweet\s+little\s+band\b/i,
  /\bwhite\s+noise\s+baby\b/i,
  /\bsleep\s+sounds\b/i,
  /\bradio\s+theatre\b/i,
];

const EXCLUDED_ALBUM_PATTERNS = [
  /\bkaraoke\b/i,
  /\btribute\b/i,
  /\bworkout\b/i,
  /\bfitness\b/i,
  /\bmusic\s+box\b/i,
  /\blullaby\b/i,
  /\b8-?bit\b/i,
  /\bcover\s+versions\b/i,
  /\bcovers\b/i,
];

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

  // Title checks
  for (const pat of EXCLUDED_TITLE_PATTERNS) {
    if (pat.test(title)) return false;
  }

  // Artist checks
  for (const pat of EXCLUDED_ARTIST_PATTERNS) {
    if (pat.test(artist)) return false;
  }

  // Album checks
  if (album) {
    for (const pat of EXCLUDED_ALBUM_PATTERNS) {
      if (pat.test(album)) return false;
    }
  }

  return true;
}
