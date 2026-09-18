import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { isAuthenticCandidate } from './authenticityFilter.js';
import { politeFetch, deezerRateLimiter, itunesRateLimiter } from './rateLimiter.js';
import { logger } from '../logger.js';

// Comprehensive dictionary of high-frequency music words across decades
export const MUSIC_LEXICON_SEEDS = [
  'love', 'night', 'dream', 'heart', 'world', 'time', 'baby', 'dance', 'fire', 'blue',
  'eyes', 'girl', 'sky', 'light', 'dark', 'rain', 'road', 'home', 'summer', 'river',
  'forever', 'sun', 'moon', 'stars', 'shadow', 'wild', 'crazy', 'sweet', 'magic', 'secret',
  'hold', 'fall', 'run', 'stay', 'break', 'touch', 'voice', 'soul', 'rock', 'song',
  'city', 'good', 'bad', 'alone', 'golden', 'paradise', 'alive', 'memory', 'wind', 'deep',
  'ocean', 'free', 'shine', 'hope', 'never', 'always', 'feel', 'wonder', 'stand', 'walk',
  'fly', 'space', 'radio', 'melody', 'beat', 'groove', 'rhythm', 'guitar', 'piano', 'silence',
  'cry', 'smile', 'kiss', 'leave', 'remember', 'forget', 'lost', 'found', 'young', 'old',
  'diamond', 'silver', 'gold', 'roses', 'flowers', 'morning', 'midnight', 'sunset', 'sunrise',
  'ghost', 'angel', 'demon', 'heaven', 'hell', 'trouble', 'danger', 'power', 'glory', 'peace'
];

// Curated foundation of foundational artists across diverse genres and decades
export const FOUNDATION_ARTISTS = [
  // Rock / Classic Rock / Alternative
  'Queen', 'The Beatles', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'Fleetwood Mac',
  'David Bowie', 'Nirvana', 'Radiohead', 'The Cure', 'R.E.M.', 'U2', 'Red Hot Chili Peppers',
  'Oasis', 'Blur', 'The Clash', 'Arctic Monkeys', 'The Strokes', 'Foo Fighters', 'Green Day',
  'Linkin Park', 'Coldplay', 'Muse', 'The Killers', 'Gorillaz', 'Smashing Pumpkins',

  // Pop / Dance / Synthpop
  'Michael Jackson', 'Madonna', 'Prince', 'Elton John', 'George Michael', 'ABBA',
  'Britney Spears', 'Beyoncé', 'Taylor Swift', 'Dua Lipa', 'Lady Gaga', 'Rihanna',
  'Katy Perry', 'Bruno Mars', 'Adele', 'The Weeknd', 'Harry Styles', 'Billie Eilish',
  'Ariana Grande', 'Justin Timberlake', 'Kylie Minogue', 'Depeche Mode', 'Pet Shop Boys',

  // Electronic / House / Synthwave
  'Daft Punk', 'Kraftwerk', 'The Chemical Brothers', 'Fatboy Slim', 'The Prodigy',
  'Avicii', 'Calvin Harris', 'David Guetta', 'Swedish House Mafia', 'Disclosure',
  'Justice', 'Moby', 'Deadmau5', 'Aphex Twin', 'Underworld', 'Faithless',

  // Hip Hop / R&B / Soul
  'Stevie Wonder', 'Aretha Franklin', 'Marvin Gaye', 'Earth Wind & Fire', 'Chic',
  'Tupac Shakur', 'The Notorious B.I.G.', 'Eminem', 'Jay-Z', 'Kanye West', 'Kendrick Lamar',
  'Drake', 'Outkast', 'Snoop Dogg', 'Dr. Dre', 'Nas', 'Fugees', 'Lauryn Hill', 'Alicia Keys',
  'Usher', 'SZA', 'Frank Ocean', 'Childish Gambino', 'Post Malone',

  // 80s / New Wave / Post-Punk
  'Tears for Fears', 'New Order', 'Joy Division', 'The Smiths', 'Talking Heads',
  'Simple Minds', 'Duran Duran', 'a-ha', 'Eurythmics', 'Cyndi Lauper', 'Wham!',

  // Global / K-Pop / Anime / Latin
  'BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'NewJeans', 'LE SSERAFIM',
  'YOASOBI', 'Kenshi Yonezu', 'RADWIMPS', 'Ado', 'LiSA', 'Official HIGE DANDism',
  'Tatsuro Yamashita', 'Miki Matsubara', 'Mariya Takeuchi',
  'Bad Bunny', 'Rosalía', 'J Balvin', 'Shakira', 'Daddy Yankee', 'Rauw Alejandro'
];

export class MusicHarvester {
  constructor(catalog = sqliteCatalog) {
    this.catalog = catalog;
    this.abortRequested = false;
  }

  stop() {
    this.abortRequested = true;
  }

  /**
   * Harvests tracks from Deezer search results.
   * @param {string} query - The search query
   * @param {number} maxOffsets - Number of 100-track offsets to fetch (e.g. 2 fetches 200 tracks)
   */
  async harvestDeezerQuery(query, maxOffsets = 2) {
    let harvested = 0;
    let merged = 0;

    for (let offsetIndex = 0; offsetIndex < maxOffsets; offsetIndex++) {
      if (this.abortRequested) break;
      const index = offsetIndex * 100;
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=100&index=${index}`;

      try {
        const response = await politeFetch(url, {}, { rateLimiter: deezerRateLimiter });
        if (!response.ok) continue;

        const data = await response.json();
        const tracks = data?.data || [];
        if (tracks.length === 0) break;

        const validCandidates = [];
        for (const t of tracks) {
          if (!isAuthenticCandidate(t)) continue;

          // Extract year from release_date or fallback
          let releaseYear = null;
          if (t.release_date) {
            const yr = parseInt(t.release_date.slice(0, 4), 10);
            if (!isNaN(yr) && yr >= 1950 && yr <= 2030) releaseYear = yr;
          }

          validCandidates.push({
            title: t.title,
            artist: t.artist?.name || 'Unknown Artist',
            isrc: t.isrc || null,
            album: t.album?.title || '',
            durationMs: (t.duration || 0) * 1000,
            releaseYear,
            releaseDate: t.release_date || null,
            popularity: t.rank || 0,
            isExplicit: Boolean(t.explicit_lyrics),
            provider: 'deezer',
            providerTrackId: String(t.id),
            sampleUrl: t.preview,
            sampleCodec: 'mp3',
            sampleDurationSec: 30,
            externalUrl: t.link || null,
            rawMetadata: {
              deezerRank: t.rank,
              artistId: t.artist?.id,
              albumId: t.album?.id,
            },
            artistMetadata: {
              deezerId: t.artist?.id,
            },
          });
        }

        if (validCandidates.length > 0) {
          const res = this.catalog.upsertBatch(validCandidates);
          harvested += res.inserted;
          merged += res.merged;
        }

        if (tracks.length < 100) break; // Reached end of results
      } catch (err) {
        logger.warn('harvester', `Deezer query "${query}" offset ${index} failed: ${err.message}`);
      }
    }

    return { harvested, merged };
  }

  /**
   * Harvests an artist's discography (top tracks + official albums + album tracks).
   */
  async harvestArtistDiscography(artistName) {
    if (this.abortRequested) return { harvested: 0, merged: 0 };

    let totalHarvested = 0;
    let totalMerged = 0;

    try {
      // 1. Find artist on Deezer and pick highest fan-count authentic artist
      const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=10`;
      const searchResp = await politeFetch(searchUrl, {}, { rateLimiter: deezerRateLimiter });
      if (!searchResp.ok) return { harvested: 0, merged: 0 };

      const searchJson = await searchResp.json();
      const rawList = searchJson?.data || [];
      if (rawList.length === 0) return { harvested: 0, merged: 0 };

      // Sort by fan count descending to eliminate amateur namesakes
      const sortedByFans = [...rawList].sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
      const exactMatches = sortedByFans.filter(a => a.name.toLowerCase().trim() === artistName.toLowerCase().trim());
      const artistData = exactMatches[0] || sortedByFans[0];
      if (!artistData || !artistData.id) return { harvested: 0, merged: 0 };

      const artistId = artistData.id;
      const officialArtistName = artistData.name || artistName;

      // 2. Fetch artist's Top 50 Tracks
      const topUrl = `https://api.deezer.com/artist/${artistId}/top?limit=50`;
      const topResp = await politeFetch(topUrl, {}, { rateLimiter: deezerRateLimiter });
      if (topResp.ok) {
        const topJson = await topResp.json();
        const topTracks = topJson?.data || [];
        const candidates = [];

        for (const t of topTracks) {
          if (!isAuthenticCandidate(t)) continue;
          candidates.push({
            title: t.title,
            artist: officialArtistName,
            isrc: t.isrc || null,
            album: t.album?.title || '',
            durationMs: (t.duration || 0) * 1000,
            releaseYear: null,
            popularity: t.rank || 0,
            isExplicit: Boolean(t.explicit_lyrics),
            provider: 'deezer',
            providerTrackId: String(t.id),
            sampleUrl: t.preview,
            sampleCodec: 'mp3',
            sampleDurationSec: 30,
            externalUrl: t.link || null,
            artistMetadata: {
              deezerId: artistId,
              fansCount: artistData.nb_fan || 0,
            },
          });
        }

        if (candidates.length > 0) {
          const res = this.catalog.upsertBatch(candidates);
          totalHarvested += res.inserted;
          totalMerged += res.merged;
        }
      }

      // 3. Fetch artist's studio albums
      const albumsUrl = `https://api.deezer.com/artist/${artistId}/albums?limit=25`;
      const albumsResp = await politeFetch(albumsUrl, {}, { rateLimiter: deezerRateLimiter });
      if (albumsResp.ok) {
        const albumsJson = await albumsResp.json();
        const albums = albumsJson?.data || [];

        for (const album of albums) {
          if (this.abortRequested) break;
          // Skip compilation or tribute albums
          if (!album.id || /tribute|karaoke|live|cover/i.test(album.title || '')) continue;

          const tracksUrl = `https://api.deezer.com/album/${album.id}/tracks?limit=50`;
          const tracksResp = await politeFetch(tracksUrl, {}, { rateLimiter: deezerRateLimiter });
          if (!tracksResp.ok) continue;

          const tracksJson = await tracksResp.json();
          const albumTracks = tracksJson?.data || [];
          const candidates = [];

          let albumYear = null;
          if (album.release_date) {
            const yr = parseInt(album.release_date.slice(0, 4), 10);
            if (!isNaN(yr) && yr >= 1950 && yr <= 2030) albumYear = yr;
          }

          for (const t of albumTracks) {
            if (!isAuthenticCandidate(t)) continue;
            candidates.push({
              title: t.title,
              artist: t.artist?.name || officialArtistName,
              isrc: t.isrc || null,
              album: album.title || '',
              durationMs: (t.duration || 0) * 1000,
              releaseYear: albumYear,
              releaseDate: album.release_date || null,
              popularity: t.rank || 0,
              isExplicit: Boolean(t.explicit_lyrics),
              provider: 'deezer',
              providerTrackId: String(t.id),
              sampleUrl: t.preview,
              sampleCodec: 'mp3',
              sampleDurationSec: 30,
              externalUrl: t.link || null,
              artistMetadata: {
                deezerId: artistId,
                fansCount: artistData.nb_fan || 0,
              },
            });
          }

          if (candidates.length > 0) {
            const res = this.catalog.upsertBatch(candidates);
            totalHarvested += res.inserted;
            totalMerged += res.merged;
          }
        }
      }
    } catch (err) {
      logger.warn('harvester', `Failed discography crawl for ${artistName}: ${err.message}`);
    }

    return { harvested: totalHarvested, merged: totalMerged };
  }

  /**
   * Cross-references tracks in the SQLite database with Apple Music / iTunes to enrich with AAC samples.
   * Only cross-references tracks that currently lack an iTunes sample.
   */
  async crossReferenceWithItunes({ batchLimit = 20 } = {}) {
    const candidates = this.catalog.db.prepare(`
      SELECT t.id, t.canonical_title, t.display_title, a.display_name as artist, t.duration_ms
      FROM tracks t
      JOIN artists a ON t.artist_id = a.id
      WHERE t.id NOT IN (
        SELECT track_id FROM track_samples WHERE provider = 'itunes'
      )
      LIMIT ?
    `).all(batchLimit);

    let enriched = 0;

    for (const track of candidates) {
      if (this.abortRequested) break;
      const query = `${track.artist} ${track.display_title}`;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`;

      try {
        const resp = await politeFetch(url, {}, { rateLimiter: itunesRateLimiter });
        if (!resp.ok) continue;

        const json = await resp.json();
        const results = json?.results || [];

        for (const it of results) {
          if (!isAuthenticCandidate(it)) continue;

          // Verify acoustic duration window: must be within 3 seconds
          const itunesDurationMs = it.trackTimeMillis || 0;
          if (Math.abs(itunesDurationMs - track.duration_ms) <= 3000) {
            // High confidence 100% match! Attach iTunes AAC sample
            this.catalog.upsertTrack({
              title: it.trackName,
              artist: it.artistName,
              album: it.collectionName,
              durationMs: itunesDurationMs,
              provider: 'itunes',
              providerTrackId: String(it.trackId),
              sampleUrl: it.previewUrl,
              sampleCodec: 'aac',
              sampleDurationSec: 30,
              externalUrl: it.trackViewUrl,
              artistMetadata: {
                itunesArtistId: it.artistId,
              },
            });
            enriched++;
            break; // Found the matching track
          }
        }
      } catch (err) {
        logger.warn('harvester', `iTunes cross-reference failed for "${query}": ${err.message}`);
      }
    }

    return { enriched };
  }

  /**
   * Executes an autonomous catalog harvest across all vectors:
   * 1. Foundation Artists Discographies
   * 2. High-Frequency Lexicon Keywords
   */
  async runFullHarvest({
    artistsLimit = 40,
    lexiconLimit = 50,
    onProgress = () => {},
  } = {}) {
    logger.info('harvester', `Starting massive catalog harvest (Artists: ${artistsLimit}, Lexicon: ${lexiconLimit})...`);

    const stats = {
      artistsCrawled: 0,
      lexiconWordsCrawled: 0,
      totalInserted: 0,
      totalMerged: 0,
    };

    // Vector 1: Artist Discographies
    const artistsToCrawl = FOUNDATION_ARTISTS.slice(0, artistsLimit);
    for (const artist of artistsToCrawl) {
      if (this.abortRequested) break;
      const res = await this.harvestArtistDiscography(artist);
      stats.artistsCrawled++;
      stats.totalInserted += res.harvested;
      stats.totalMerged += res.merged;
      onProgress({ ...stats, currentAction: `Crawled artist: ${artist}`, currentStats: this.catalog.getStats() });
    }

    // Vector 2: High-Frequency Vocabulary Sweep
    const wordsToCrawl = MUSIC_LEXICON_SEEDS.slice(0, lexiconLimit);
    for (const word of wordsToCrawl) {
      if (this.abortRequested) break;
      const res = await this.harvestDeezerQuery(word, 2);
      stats.lexiconWordsCrawled++;
      stats.totalInserted += res.harvested;
      stats.totalMerged += res.merged;
      onProgress({ ...stats, currentAction: `Crawled vocabulary: "${word}"`, currentStats: this.catalog.getStats() });
    }

    return stats;
  }
}

export const musicHarvester = new MusicHarvester();
