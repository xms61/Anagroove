import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { isAuthenticCandidate } from './authenticityFilter.js';
import { politeFetch, deezerRateLimiter, itunesRateLimiter } from './rateLimiter.js';
import { STREAMED_ARTIST_NAMES } from './artistBaseline.js';
import { logger } from '../logger.js';

// Comprehensive dictionary of 350+ high-frequency music words across decades & languages
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
  'ghost', 'angel', 'demon', 'heaven', 'hell', 'trouble', 'danger', 'power', 'glory', 'peace',
  'storm', 'thunder', 'lightning', 'mountain', 'forest', 'desert', 'water', 'sea', 'shore',
  'breath', 'sleep', 'wake', 'burn', 'flame', 'spark', 'smoke', 'ash', 'dust', 'stone',
  'blood', 'tear', 'mirror', 'glass', 'window', 'door', 'key', 'lock', 'chain',
  'king', 'queen', 'prince', 'hero', 'stranger', 'friend', 'enemy', 'lover', 'mother', 'father',
  'brother', 'sister', 'child', 'boy', 'woman', 'man', 'people', 'crowd', 'street', 'town',
  'train', 'car', 'ship', 'plane', 'highway', 'bridge', 'station', 'corner', 'hotel', 'room',
  'bed', 'wall', 'floor', 'garden', 'tree', 'leaf', 'winter', 'spring',
  'autumn', 'snow', 'ice', 'cold', 'warm', 'hot', 'cool', 'breeze', 'cloud', 'rainbow',
  'color', 'red', 'green', 'yellow', 'black', 'white', 'purple', 'pink', 'orange', 'grey',
  'bright', 'clear', 'clean', 'heavy', 'soft', 'hard', 'loud', 'quiet', 'bitter',
  'high', 'low', 'happy', 'sad', 'mad', 'glad', 'brave', 'fear', 'courage', 'faith',
  'truth', 'lie', 'promise', 'word', 'name', 'number', 'letter', 'story', 'book', 'page',
  'game', 'play', 'win', 'lose', 'fight', 'battle', 'war', 'flag', 'march',
  'shout', 'scream', 'whisper', 'listen', 'hear', 'look', 'watch', 'show', 'hide',
  'give', 'take', 'keep', 'let', 'make', 'build', 'heal', 'drive', 'ride', 'jump',
  'shake', 'spin', 'turn', 'stop', 'start', 'begin', 'end', 'wait', 'close', 'open',
  'high', 'wild', 'free', 'heavy', 'fast', 'slow', 'sweet', 'sugar', 'honey', 'candy',
  'amor', 'noche', 'cielo', 'sol', 'luna', 'vida', 'alma', 'corazon', 'sueno', 'fiesta',
  // Expanded Musical, Emotional & Atmospheric Lexicon
  'sing', 'shiver', 'breathe', 'crawl', 'drift', 'float', 'bleed', 'escape', 'fade', 'chase',
  'crash', 'glow', 'heal', 'melt', 'rush', 'sinking', 'surrender', 'tremble', 'wander', 'ignite',
  'spark', 'stumble', 'collide', 'rebound', 'deliver', 'explode', 'drown', 'resurrect', 'vanish',
  'bliss', 'sorrow', 'ecstasy', 'desire', 'passion', 'rage', 'fury', 'guilt', 'envy', 'jealousy',
  'lonely', 'anxiety', 'panic', 'nostalgia', 'euphoria', 'madness', 'delirium', 'comfort', 'peaceful',
  'tender', 'wicked', 'fierce', 'relentless', 'reckless', 'restless', 'timeless', 'hopeless', 'boundless',
  'galaxy', 'cosmos', 'planet', 'orbit', 'eclipse', 'nebula', 'asteroid', 'comet', 'horizon', 'twilight',
  'aurora', 'tempest', 'tornado', 'blizzard', 'tsunami', 'earthquake', 'avalanche', 'crystal', 'emerald',
  'sapphire', 'obsidian', 'amethyst', 'diamond', 'marble', 'velvet', 'silk', 'leather', 'denim', 'satin',
  'boulevard', 'downtown', 'subway', 'neon', 'skyscraper', 'alley', 'concrete', 'asphalt', 'traffic',
  'billboard', 'motel', 'penthouse', 'rooftop', 'discotheque', 'saloon', 'casino', 'carnival', 'parade',
  'bass', 'synth', 'treble', 'tempo', 'echo', 'reverb', 'chorus', 'verse', 'harmony', 'symphony',
  'sonata', 'serenade', 'ballad', 'anthem', 'riff', 'solo', 'acoustic', 'electric', 'amplifier', 'vinyl',
  'cassette', 'turntable', 'needle', 'groove', 'speaker', 'headphone', 'frequency', 'vibration', 'static',
  'bailar', 'fuego', 'cancion', 'beso', 'loco', 'loca', 'mujer', 'hombre', 'playa', 'mar',
  'solitario', 'estrella', 'esperanza', 'camino', 'reina', 'rey', 'silencio', 'lagrimas',
  'reve', 'coeur', 'soleil', 'lumiere', 'monde', 'musique', 'danse', 'adieu', 'toujours', 'voyage',
  'etoile', 'chemin', 'femme', 'voler', 'pleurer', 'chanter', 'esperance',
  'liebe', 'sonne', 'traum', 'herz', 'welt', 'sturm', 'tanzen', 'atemlos', 'ewigkeit', 'sehnsucht',
  'tokyo', 'hikari', 'yume', 'sakura', 'kokoro', 'mirai', 'tsuki', 'densetsu', 'seoul', 'sarang'
];

// Curated heritage and genre foundation artists to complement the streaming roster
export const HERITAGE_ARTISTS = [
  // Classic Rock / Hard Rock / Progressive Rock
  'Queen', 'The Beatles', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'Fleetwood Mac',
  'David Bowie', 'The Who', 'The Doors', 'Jimi Hendrix', 'Creedence Clearwater Revival', 'Deep Purple',
  'Black Sabbath', 'Aerosmith', 'AC/DC', 'Boston', 'Kansas', 'Journey', 'Foreigner', 'Heart',
  'Kiss', 'Van Halen', 'Rush', 'Def Leppard', 'Dire Straits', 'The Police', 'Eric Clapton',
  'Neil Young', 'Bob Dylan', 'Bruce Springsteen', 'Tom Petty', 'Billy Joel', 'Elton John',

  // Alternative Rock / Grunge / Indie / Punk
  'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'Radiohead', 'The Smashing Pumpkins',
  'R.E.M.', 'U2', 'Red Hot Chili Peppers', 'Oasis', 'Blur', 'The Cure', 'The Smiths', 'Joy Division',
  'New Order', 'Depeche Mode', 'Pixies', 'The Clash', 'Foo Fighters', 'Green Day', 'Weezer',
  'Blink-182', 'The Offspring', 'Linkin Park', 'Incubus', 'Rage Against The Machine', 'System of a Down',
  'The White Stripes', 'The Strokes', 'Arctic Monkeys', 'Muse', 'Coldplay', 'The Killers',
  'Gorillaz', 'Queens of the Stone Age', 'Franz Ferdinand', 'Interpol', 'Arcade Fire', 'Vampire Weekend',

  // Pop / Dance / Synthpop / Contemporary
  'Michael Jackson', 'Madonna', 'Prince', 'George Michael', 'Whitney Houston', 'Celine Dion',
  'Mariah Carey', 'Cher', 'ABBA', 'Bee Gees', 'Donna Summer', 'Cyndi Lauper', 'Tina Turner',
  'Phil Collins', 'Janet Jackson', 'Britney Spears', 'Christina Aguilera', 'Justin Timberlake',
  'Destiny\'s Child', 'Beyoncé', 'Rihanna', 'Lady Gaga', 'Katy Perry', 'Taylor Swift', 'Bruno Mars',
  'Adele', 'Ed Sheeran', 'Ariana Grande', 'Dua Lipa', 'Billie Eilish', 'Harry Styles', 'The Weeknd',
  'Olivia Rodrigo', 'Sabrina Carpenter', 'Charli XCX', 'Sia', 'P!nk', 'Avril Lavigne', 'Shakira',

  // Electronic / House / Synthwave / Techno / Trance
  'Daft Punk', 'Kraftwerk', 'The Chemical Brothers', 'The Prodigy', 'Fatboy Slim', 'Faithless',
  'Underworld', 'Massive Attack', 'Portishead', 'Moby', 'Aphex Twin', 'Deadmau5', 'Skrillex',
  'Avicii', 'Calvin Harris', 'David Guetta', 'Swedish House Mafia', 'Tiësto', 'Armin van Buuren',
  'Martin Garrix', 'Kygo', 'Zedd', 'Marshmello', 'The Chainsmokers', 'Disclosure', 'Justice',
  'LCD Soundsystem', 'Rufus Du Sol', 'ODESZA', 'Major Lazer', 'DJ Snake',

  // Hip Hop / Rap / Trap
  'Run-D.M.C.', 'Beastie Boys', 'Public Enemy', 'A Tribe Called Quest', 'Wu-Tang Clan',
  'Tupac Shakur', 'The Notorious B.I.G.', 'Nas', 'Jay-Z', 'Snoop Dogg', 'Dr. Dre', 'Eminem',
  '50 Cent', 'OutKast', 'Ludacris', 'Missy Elliott', 'Busta Rhymes', 'Lil Wayne', 'Kanye West',
  'Kendrick Lamar', 'J. Cole', 'Drake', 'Future', 'Travis Scott', 'A$AP Rocky', 'Mac Miller',
  'Tyler, The Creator', 'Childish Gambino', 'Post Malone', 'Cardi B', 'Nicki Minaj', 'Doja Cat',

  // R&B / Soul / Motown / Funk
  'Stevie Wonder', 'Marvin Gaye', 'Aretha Franklin', 'Otis Redding', 'Sam Cooke', 'Ray Charles',
  'James Brown', 'Al Green', 'Earth Wind & Fire', 'Chic', 'Kool & The Gang', 'The Temptations',
  'The Supremes', 'Bill Withers', 'Sade', 'Luther Vandross', 'Boyz II Men', 'TLC', 'Lauryn Hill',
  'Alicia Keys', 'Usher', 'John Legend', 'Ne-Yo', 'Frank Ocean', 'SZA', 'Daniel Caesar',

  // Metal / Heavy Rock
  'Metallica', 'Iron Maiden', 'Judas Priest', 'Motörhead', 'Megadeth', 'Slayer', 'Pantera',
  'Ozzy Osbourne', 'Scorpions', 'Guns N\' Roses', 'Slipknot', 'Korn', 'Disturbed', 'Avenged Sevenfold',
  'Rammstein', 'Nightwish', 'Ghost', 'Tool',

  // K-Pop / J-Rock / City Pop / Anime
  'BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'EXO', 'SEVENTEEN', 'NewJeans', 'LE SSERAFIM',
  'aespa', 'Red Velvet', 'IU', 'BIGBANG', 'SHINee', 'ENHYPEN', 'TXT', 'ATEEZ',
  'YOASOBI', 'Kenshi Yonezu', 'RADWIMPS', 'King Gnu', 'Official HIGE DANDism', 'Ado', 'LiSA',
  'Eve', 'aimer', 'Vaundy', 'Fujii Kaze', 'Tatsuro Yamashita', 'Miki Matsubara', 'Mariya Takeuchi',
  'Anri', 'Taeko Onuki',

  // Latin / Reggaeton / Bossa Nova / Reggae
  'Bad Bunny', 'Daddy Yankee', 'Don Omar', 'J Balvin', 'Maluma', 'Ozuna', 'Rauw Alejandro',
  'Karol G', 'Rosalía', 'Enrique Iglesias', 'Ricky Martin', 'Marc Anthony', 'Luis Fonsi',
  'Bob Marley', 'Peter Tosh', 'Jimmy Cliff', 'Steel Pulse', 'UB40', 'Sean Paul', 'Shaggy',

  // Jazz / Blues / Country
  'Miles Davis', 'John Coltrane', 'Louis Armstrong', 'Ella Fitzgerald', 'Billie Holiday',
  'Nina Simone', 'Norah Jones', 'Herbie Hancock', 'B.B. King', 'Muddy Waters', 'Stevie Ray Vaughan',
  'Johnny Cash', 'Willie Nelson', 'Dolly Parton', 'Shania Twain', 'Chris Stapleton', 'Luke Combs'
];

// Baseline foundation artist roster: Prioritizes 500 Most Streamed Artists on Spotify + Heritage anchors
export const FOUNDATION_ARTISTS = Array.from(new Set([
  ...STREAMED_ARTIST_NAMES,
  ...HERITAGE_ARTISTS,
]));


// High-yield curated playlist searches across genres & eras
export const CURATED_PLAYLIST_SEEDS = [
  'rock classics', 'pop essentials', 'billboard hot 100', '90s alternative', '80s synthpop',
  '70s rock', '60s rock', '2000s pop', '2010s hits', 'hip hop golden age',
  '90s hip hop', '2000s rap', 'modern hip hop', 'classic r&b', 'motown essentials',
  'neo soul', 'funk & soul classics', 'disco fever', 'electronic journey', 'classic house',
  'trance anthems', 'techno club', 'indie rock gems', 'shoegaze dream pop', 'post punk essentials',
  'metal anthems', 'classic country', 'reggae roots', 'latin hits', 'reggaeton classics',
  'kpop essentials', 'anime openings', 'city pop vibes', 'jazz masters', 'blues legends',
  'soundtrack masterpieces', 'acoustic chill', 'road trip anthems', 'party classics', 'all time hits'
];

// Cross-product decade & genre query generator
export const DECADE_GENRE_SEEDS = [];
const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
const GENRES = ['rock', 'pop', 'hip hop', 'dance', 'r&b', 'soul', 'jazz', 'electronic', 'indie', 'metal', 'latin', 'reggae', 'country', 'funk', 'punk'];
for (const d of DECADES) {
  for (const g of GENRES) {
    DECADE_GENRE_SEEDS.push(`${d} ${g}`);
  }
}

// Fine-grained Year (1960-2026) x Genre Matrix yielding 1,600+ rich queries
export const YEAR_GENRE_SEEDS = [];
const EXTENDED_GENRES = [
  'rock', 'pop', 'hip hop', 'dance', 'r&b', 'soul', 'jazz', 'electronic', 'indie',
  'metal', 'latin', 'reggae', 'country', 'funk', 'punk', 'house', 'techno',
  'blues', 'folk', 'ambient', 'synthwave', 'k-pop', 'afrobeats', 'disco', 'alternative'
];
for (let yr = 1960; yr <= 2026; yr++) {
  for (const g of EXTENDED_GENRES) {
    YEAR_GENRE_SEEDS.push(`${yr} ${g}`);
  }
}

// High-frequency musical 2-letter bigram seeds for sweeping all chart tiers
export const BIGRAM_SEEDS = [
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'ti', 'es', 'or', 'te', 'of',
  'ed', 'is', 'it', 'al', 'ar', 'st', 'to', 'nt', 'ng', 'se', 'ha', 'as', 'ou', 'io', 'le',
  've', 'co', 'me', 'de', 'hi', 'ri', 'ro', 'ic', 'ne', 'ea', 'ra', 'ce', 'li', 'ch', 'll',
  'be', 'ma', 'si', 'om', 'ur', 'ca', 'el', 'ta', 'la', 'ns', 'di', 'fo', 'ho', 'pe', 'ec'
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
   * Harvests tracks from curated playlists.
   * @param {string[]} queries - Array of playlist search terms
   * @param {number} maxPlaylistsPerQuery - Number of playlists to fetch per query (e.g. 3)
   */
  async harvestCuratedPlaylists(queries, maxPlaylistsPerQuery = 3, onPlProgress = () => {}) {
    let harvested = 0;
    let merged = 0;

    for (const query of queries) {
      if (this.abortRequested) break;
      try {
        const searchUrl = `https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=${maxPlaylistsPerQuery}`;
        const searchResp = await politeFetch(searchUrl, {}, { rateLimiter: deezerRateLimiter });
        if (!searchResp.ok) continue;

        const searchJson = await searchResp.json();
        const playlists = searchJson?.data || [];

        for (const pl of playlists) {
          if (this.abortRequested) break;
          if (!pl.id) continue;

          const tracksUrl = `https://api.deezer.com/playlist/${pl.id}/tracks?limit=100`;
          const tracksResp = await politeFetch(tracksUrl, {}, { rateLimiter: deezerRateLimiter });
          if (!tracksResp.ok) continue;

          const tracksJson = await tracksResp.json();
          const tracks = tracksJson?.data || [];
          const validCandidates = [];

          for (const t of tracks) {
            if (!isAuthenticCandidate(t)) continue;

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

          onPlProgress({ query, playlistTitle: pl.title, tracksFound: tracks.length, harvested, merged });
        }
      } catch (err) {
        logger.warn('harvester', `Playlist harvest for "${query}" failed: ${err.message}`);
      }
    }

    return { harvested, merged };
  }

  /**
   * Harvests an artist's discography (top tracks + official albums + album tracks)
   * and optionally spiders high-fan related artists.
   */
  async harvestArtistDiscography(artistName, { maxAlbums = 8, includeRelated = true } = {}) {
    if (this.abortRequested) return { harvested: 0, merged: 0, relatedArtists: [] };

    let totalHarvested = 0;
    let totalMerged = 0;
    const relatedArtists = [];

    try {
      // 1. Find artist on Deezer and pick highest fan-count authentic artist
      const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=10`;
      const searchResp = await politeFetch(searchUrl, {}, { rateLimiter: deezerRateLimiter });
      if (!searchResp.ok) return { harvested: 0, merged: 0, relatedArtists: [] };

      const searchJson = await searchResp.json();
      const rawList = searchJson?.data || [];
      if (rawList.length === 0) return { harvested: 0, merged: 0, relatedArtists: [] };

      // Sort by fan count descending to eliminate amateur namesakes
      const sortedByFans = [...rawList].sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
      const exactMatches = sortedByFans.filter(a => a.name.toLowerCase().trim() === artistName.toLowerCase().trim());
      const artistData = exactMatches[0] || sortedByFans[0];
      if (!artistData || !artistData.id) return { harvested: 0, merged: 0, relatedArtists: [] };

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
        let albumCount = 0;

        for (const album of albums) {
          if (this.abortRequested || albumCount >= maxAlbums) break;
          // Skip compilation or tribute albums
          if (!album.id || /tribute|karaoke|live|cover/i.test(album.title || '')) continue;
          albumCount++;

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

      // 4. Spider related artists with >= 100k fans
      if (includeRelated) {
        const relatedUrl = `https://api.deezer.com/artist/${artistId}/related?limit=8`;
        const relatedResp = await politeFetch(relatedUrl, {}, { rateLimiter: deezerRateLimiter });
        if (relatedResp.ok) {
          const relatedJson = await relatedResp.json();
          const related = relatedJson?.data || [];
          for (const rel of related) {
            if (rel.name && (rel.nb_fan || 0) >= 100000) {
              relatedArtists.push(rel.name);
            }
          }
        }
      }
    } catch (err) {
      logger.warn('harvester', `Failed discography crawl for ${artistName}: ${err.message}`);
    }

    return { harvested: totalHarvested, merged: totalMerged, relatedArtists };
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
   * Executes an autonomous catalog harvest across all multi-provider vectors:
   * 1. Curated Playlists Spider
   * 2. Decade & Genre Matrix Sweep
   * 3. Foundation Artists & Related Artists Discography Spider
   * 4. High-Frequency Lexicon Keywords
   */
  async runFullHarvest({
    targetTracks = 100000,
    playlistsLimit = 40,
    decadesLimit = 105,
    artistsLimit = 150,
    lexiconLimit = 350,
    onProgress = () => {},
  } = {}) {
    logger.info('harvester', `Starting massive catalog harvest targeting ${targetTracks.toLocaleString()} tracks...`);

    const stats = {
      playlistsCrawled: 0,
      decadeQueriesCrawled: 0,
      artistsCrawled: 0,
      lexiconWordsCrawled: 0,
      totalInserted: 0,
      totalMerged: 0,
    };

    const isTargetReached = () => this.catalog.getStats().tracks >= targetTracks;

    // Vector 1: Curated Genre & Historical Playlists Spidering
    if (playlistsLimit > 0 && !isTargetReached() && !this.abortRequested) {
      const playlistsToCrawl = CURATED_PLAYLIST_SEEDS.slice(0, playlistsLimit);
      for (const plQuery of playlistsToCrawl) {
        if (this.abortRequested || isTargetReached()) break;
        const res = await this.harvestCuratedPlaylists([plQuery], 3, (p) => {
          onProgress({ ...stats, currentAction: `Playlist: ${p.query}`, currentStats: this.catalog.getStats() });
        });
        stats.playlistsCrawled++;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;
        onProgress({ ...stats, currentAction: `Completed playlist: "${plQuery}"`, currentStats: this.catalog.getStats() });
      }
    }

    // Vector 2: Decade & Genre Cross-Product Matrix
    if (decadesLimit > 0 && !isTargetReached() && !this.abortRequested) {
      const queriesToCrawl = DECADE_GENRE_SEEDS.slice(0, decadesLimit);
      for (const query of queriesToCrawl) {
        if (this.abortRequested || isTargetReached()) break;
        const res = await this.harvestDeezerQuery(query, 2);
        stats.decadeQueriesCrawled++;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;
        onProgress({ ...stats, currentAction: `Decade/Genre: "${query}"`, currentStats: this.catalog.getStats() });
      }
    }

    // Vector 3: Artist Discographies & Related Artists Spidering
    if (!isTargetReached() && !this.abortRequested) {
      const artistQueue = [...FOUNDATION_ARTISTS.slice(0, artistsLimit)];
      const visitedArtists = new Set(artistQueue.map(a => a.toLowerCase()));

      while (artistQueue.length > 0 && !this.abortRequested && !isTargetReached()) {
        const artist = artistQueue.shift();
        const res = await this.harvestArtistDiscography(artist, { maxAlbums: 8, includeRelated: true });
        stats.artistsCrawled++;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;

        // Queue newly discovered authentic related artists
        if (res.relatedArtists && res.relatedArtists.length > 0) {
          for (const rel of res.relatedArtists) {
            if (!visitedArtists.has(rel.toLowerCase())) {
              visitedArtists.add(rel.toLowerCase());
              artistQueue.push(rel);
            }
          }
        }

        onProgress({ ...stats, currentAction: `Artist: ${artist}`, currentStats: this.catalog.getStats() });
      }
    }

    // Vector 4: High-Frequency Lexicon Keywords Sweep
    if (!isTargetReached() && !this.abortRequested) {
      const wordsToCrawl = MUSIC_LEXICON_SEEDS.slice(0, lexiconLimit);
      for (const word of wordsToCrawl) {
        if (this.abortRequested || isTargetReached()) break;
        const res = await this.harvestDeezerQuery(word, 3);
        stats.lexiconWordsCrawled++;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;
        onProgress({ ...stats, currentAction: `Vocabulary: "${word}"`, currentStats: this.catalog.getStats() });
      }
    }

    // Vector 5: Comprehensive Year (1960-2026) x Genre Matrix Sweep
    if (!isTargetReached() && !this.abortRequested) {
      for (const query of YEAR_GENRE_SEEDS) {
        if (this.abortRequested || isTargetReached()) break;
        const res = await this.harvestDeezerQuery(query, 3);
        stats.yearGenreQueriesCrawled = (stats.yearGenreQueriesCrawled || 0) + 1;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;
        onProgress({ ...stats, currentAction: `Year/Genre: "${query}"`, currentStats: this.catalog.getStats() });
      }
    }

    // Vector 6: High-Yield Bigram Sweeper
    if (!isTargetReached() && !this.abortRequested) {
      for (const bigram of BIGRAM_SEEDS) {
        if (this.abortRequested || isTargetReached()) break;
        const res = await this.harvestDeezerQuery(bigram, 3);
        stats.bigramsCrawled = (stats.bigramsCrawled || 0) + 1;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;
        onProgress({ ...stats, currentAction: `Bigram: "${bigram}"`, currentStats: this.catalog.getStats() });
      }
    }

    return stats;
  }
}

export const musicHarvester = new MusicHarvester();
