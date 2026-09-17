import { SongItem } from '../utils/liveGenerator';
import { BlacklistItem, getAnonymousUserId } from './apiClient';
import { extractAnswerKeyword } from '../../shared/musicKeywords';
import { shuffleArray } from '../../shared/shuffle';

// Track recently seen song IDs in sessionStorage to avoid repeating songs
function getRecentlyPlayedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem('spotyspice_recent_songs');
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {
    console.warn(e);
  }
  return new Set();
}

function recordRecentlyPlayed(ids: string[]) {
  try {
    const set = getRecentlyPlayedIds();
    ids.forEach(id => set.add(id));
    // Keep last 150
    const list = Array.from(set).slice(-150);
    sessionStorage.setItem('spotyspice_recent_songs', JSON.stringify(list));
  } catch (e) {
    console.warn(e);
  }
}

// Fallback high-recognition artist search seeds (guarantees household names only)
const ICONIC_ARTIST_SEEDS: Record<string, string[]> = {
  all: [
    'Queen', 'Michael Jackson', 'The Beatles', 'Eminem', 'Taylor Swift', 'Daft Punk',
    'Nirvana', 'Billie Eilish', 'Coldplay', 'Red Hot Chili Peppers', 'The Weeknd',
    'Madonna', 'Bruno Mars', 'Linkin Park', 'Pink Floyd', 'AC/DC', 'Avicii', 'Green Day'
  ],
  rock: ['Queen', 'The Beatles', 'Nirvana', 'Pink Floyd', 'AC/DC', 'Guns N Roses', 'Led Zeppelin', 'Red Hot Chili Peppers', 'Radiohead'],
  pop: ['Michael Jackson', 'Madonna', 'Taylor Swift', 'The Weeknd', 'Bruno Mars', 'Billie Eilish', 'Dua Lipa', 'Adele', 'Katy Perry'],
  hiphop: ['Eminem', 'Drake', 'Kendrick Lamar', '50 Cent', 'Snoop Dogg', 'Travis Scott', 'Post Malone', 'Kanye West'],
  electronic: ['Daft Punk', 'Avicii', 'Calvin Harris', 'David Guetta', 'Martin Garrix', 'Swedish House Mafia', 'Skrillex'],
  latin: ['Bad Bunny', 'Daddy Yankee', 'J Balvin', 'Shakira', 'Maluma', 'Rosalia', 'Luis Fonsi'],
  kpop: ['BTS', 'BLACKPINK', 'TWICE', 'NewJeans', 'Stray Kids'],
};

export const dynamicMusicService = {
  /**
   * Fetches truly randomized hit songs from recognized artists with minimum follower/play counts.
   * Prioritizes backend verified endpoint `/api/music/random`.
   */
  async fetchLiveSongPool(
    genre: string = 'all',
    blacklist: BlacklistItem[] = [],
    minFans: number = 250000,
    count: number = 25
  ): Promise<SongItem[]> {
    const recentIds = getRecentlyPlayedIds();
    const userId = getAnonymousUserId();

    // 1. Try Backend Recognized Music Engine first (Highest quality & recognizability)
    try {
      const queryParams = new URLSearchParams({
        genre,
        minFans: String(minFans),
        count: String(count),
        recent: Array.from(recentIds).slice(-30).join(',')
      });

      const res = await fetch(`/api/music/random?${queryParams.toString()}`, {
        headers: { 'X-User-Id': userId }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.songs) && data.songs.length >= 6) {
          recordRecentlyPlayed(data.songs.map((s: SongItem) => s.id));
          return data.songs;
        }
      }
    } catch (err) {
      console.warn('Backend music API fetch failed, falling back to iconic artist search:', err);
    }

    // 2. Fallback: Query iTunes search restricted ONLY to verified iconic household artists
    const candidateMap = new Map<string, SongItem>();
    const isBlacklisted = (songTitle: string, artistName: string) => {
      const lowerT = songTitle.toLowerCase();
      const lowerA = artistName.toLowerCase();
      return blacklist.some(b => {
        const blName = b.name.toLowerCase();
        if (b.type === 'artist') return lowerA.includes(blName);
        if (b.type === 'song') return lowerT.includes(blName);
        return lowerT.includes(blName) || lowerA.includes(blName);
      });
    };

    const seeds = ICONIC_ARTIST_SEEDS[genre] || ICONIC_ARTIST_SEEDS.all;
    const chosenSeeds = shuffleArray(seeds).slice(0, 5);

    for (const artistName of chosenSeeds) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const searchRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=10`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (searchRes.ok) {
          const data = await searchRes.json();
          const results = data.results || [];

          for (const track of results) {
            const rawTitle = track.trackName || '';
            const artist = track.artistName || '';
            const previewUrl = track.previewUrl;
            const albumArt = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb.jpg', '400x400bb.jpg') : '';
            const album = track.collectionName || 'Single';

            if (previewUrl && rawTitle && artist && !isBlacklisted(rawTitle, artist)) {
              const songId = `fallback-${track.trackId || rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

              if (!recentIds.has(songId) && !candidateMap.has(songId)) {
                const kw = extractAnswerKeyword(rawTitle, artist);
                if (kw) {
                  candidateMap.set(songId, {
                    id: songId,
                    title: rawTitle,
                    artist,
                    album,
                    albumArt,
                    audioUrl: previewUrl,
                    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(rawTitle + ' ' + artist)}`,
                    answer: kw.answer,
                    clueType: kw.clueType,
                    clueText: kw.clueText,
                  });
                  break; // 1 per artist for diversity
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Fallback search error for', artistName, e);
      }
    }

    const finalCandidates = Array.from(candidateMap.values());
    if (finalCandidates.length > 0) {
      recordRecentlyPlayed(finalCandidates.slice(0, 20).map(s => s.id));
    }

    return finalCandidates;
  }
};
