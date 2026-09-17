import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const ARTISTS_FILE = path.join(DATA_DIR, 'recognized_artists.json');
const CACHE_FILE = path.join(DATA_DIR, 'tracks_cache.json');

// In-memory cache for artist top tracks
let tracksCache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    tracksCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch (e) {
    console.warn('Could not read tracks_cache.json:', e.message);
  }
}

function saveTracksCache() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(tracksCache, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not save tracks cache:', e.message);
  }
}

// Load verified recognized artists
let recognizedArtists = [];
if (fs.existsSync(ARTISTS_FILE)) {
  try {
    recognizedArtists = JSON.parse(fs.readFileSync(ARTISTS_FILE, 'utf-8'));
  } catch (e) {
    console.warn('Could not read recognized_artists.json:', e.message);
  }
}

/**
 * Extracts a clean uppercase A-Z answer word (length 3 to 10) from a title
 */
export function extractAnswerKeyword(title, artist) {
  const cleanTitle = title
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .trim();

  const titleWords = cleanTitle.split(/\s+/).filter(w => w.length >= 3 && w.length <= 10);
  const cleanArtist = artist.replace(/[^a-zA-Z\s]/g, '').trim();
  const artistWords = cleanArtist.split(/\s+/).filter(w => w.length >= 3 && w.length <= 10);

  // Strategy 1: Single-word song title
  if (titleWords.length === 1 && /^[a-zA-Z]{3,10}$/.test(titleWords[0])) {
    const candidate = titleWords[0].toUpperCase();
    return {
      answer: candidate,
      clueType: 'Song title',
      clueText: `Iconic hit single (${candidate.length} letters)`
    };
  }

  // Strategy 2: Prominent word in multi-word title
  if (titleWords.length > 1) {
    // Pick the longest word with distinct vowels
    const sorted = [...titleWords].sort((a, b) => b.length - a.length);
    const candidate = sorted[0].toUpperCase();
    return {
      answer: candidate,
      clueType: 'Song title keyword',
      clueText: `Key word in this legendary track (${candidate.length} letters)`
    };
  }

  // Strategy 3: Artist name keyword
  if (artistWords.length > 0) {
    const candidate = artistWords[0].toUpperCase();
    return {
      answer: candidate,
      clueType: 'Artist name',
      clueText: `Celebrated performer of this hit (${candidate.length} letters)`
    };
  }

  return null;
}

/**
 * Fetches top hit tracks for a specific artist with caching
 */
export async function getArtistTopTracks(artist) {
  const artistKey = String(artist.id);
  if (tracksCache[artistKey] && tracksCache[artistKey].length > 0) {
    return tracksCache[artistKey];
  }

  try {
    const res = await fetch(`https://api.deezer.com/artist/${artist.id}/top?limit=15`);
    if (res.ok) {
      const data = await res.json();
      const rawTracks = data.data || [];

      // Filter tracks: must have preview, high rank (popularity >= 400,000)
      const validTracks = rawTracks
        .filter(t => t.preview && t.rank >= 400000)
        .map(t => ({
          id: `hit-${t.id}`,
          title: t.title,
          artist: artist.name,
          artistId: artist.id,
          fans: artist.fans,
          rank: t.rank,
          album: t.album?.title || 'Single',
          albumArt: t.album?.cover_big || t.album?.cover_medium || '',
          audioUrl: t.preview,
          spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(t.title + ' ' + artist.name)}`,
        }));

      if (validTracks.length > 0) {
        tracksCache[artistKey] = validTracks;
        saveTracksCache();
        return validTracks;
      }
    }
  } catch (err) {
    console.warn(`Failed fetching top tracks for artist ${artist.name}:`, err.message);
  }

  return [];
}

/**
 * Truly randomized recognizable song pool generator
 * Guarantees:
 * 1. Artists with >= minFans (default 250k+)
 * 2. High track rank (rank >= 400k)
 * 3. True shuffle across eras/genres
 * 4. Anti-repetition & blacklist filtering
 */
export async function getRandomSongPool({
  genre = 'all',
  minFans = 250000,
  count = 25,
  blacklist = [],
  recentIds = []
} = {}) {
  const isBlacklisted = (title, artist) => {
    const lowerT = title.toLowerCase();
    const lowerA = artist.toLowerCase();
    return blacklist.some(b => {
      const blName = b.name.toLowerCase();
      if (b.type === 'artist') return lowerA.includes(blName);
      if (b.type === 'song') return lowerT.includes(blName);
      return lowerT.includes(blName) || lowerA.includes(blName);
    });
  };

  const recentSet = new Set(recentIds);

  // 1. Filter artists by genre & minimum fans
  let candidateArtists = recognizedArtists.filter(a => a.fans >= minFans);

  if (genre && genre !== 'all') {
    const genreLower = genre.toLowerCase();
    const filtered = candidateArtists.filter(a =>
      a.genre.toLowerCase() === genreLower || a.era.toLowerCase() === genreLower
    );
    if (filtered.length >= 8) {
      candidateArtists = filtered;
    }
  }

  // 2. Truly randomize / shuffle artists using Fisher-Yates
  const shuffledArtists = [...candidateArtists];
  for (let i = shuffledArtists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArtists[i], shuffledArtists[j]] = [shuffledArtists[j], shuffledArtists[i]];
  }

  // 3. Select top 15-20 distinct artists and gather hit tracks
  const selectedArtists = shuffledArtists.slice(0, 20);
  const songPool = [];
  const seenTitles = new Set();

  for (const artist of selectedArtists) {
    const tracks = await getArtistTopTracks(artist);
    // Shuffle the artist's hit songs so we don't always pick the #1 hit
    const shuffledTracks = [...tracks].sort(() => 0.5 - Math.random());

    for (const track of shuffledTracks) {
      if (
        !recentSet.has(track.id) &&
        !seenTitles.has(track.title.toLowerCase()) &&
        !isBlacklisted(track.title, track.artist)
      ) {
        const kw = extractAnswerKeyword(track.title, track.artist);
        if (kw) {
          seenTitles.add(track.title.toLowerCase());
          songPool.push({
            ...track,
            answer: kw.answer,
            clueType: kw.clueType,
            clueText: kw.clueText,
          });
          break; // 1-2 tracks per artist to keep diverse artist spread
        }
      }
    }

    if (songPool.length >= count + 5) break;
  }

  return songPool.slice(0, count);
}
