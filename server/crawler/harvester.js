import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { classifyArtistLanguage } from '../db/languageClassifier.js';
import { baseTitleKey, isAllowedLanguage, stripVersionTags } from '../db/trackNormalization.js';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { isAuthenticCandidate } from './authenticityFilter.js';
import { politeFetch, deezerRateLimiter, itunesRateLimiter } from './rateLimiter.js';
import { STREAMED_ARTIST_NAMES } from './artistBaseline.js';
import { logger } from '../logger.js';

// High-frequency music words (English, plus romanized Japanese/Korean) for broad search sweeps
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
  'tokyo', 'hikari', 'yume', 'sakura', 'kokoro', 'mirai', 'tsuki', 'densetsu', 'seoul', 'sarang',
  'kimi', 'sora', 'natsu', 'koi', 'ai', 'hana', 'shiawase', 'boku', 'tomodachi', 'haru',
  'saranghae', 'bogoshipda', 'haneul', 'nabi', 'annyeong', 'uri', 'neo', 'baram', 'kkum', 'bom'
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
  'Anri', 'Taeko Onuki', 'IVE', 'ITZY', '(G)I-DLE', 'NMIXX', 'ILLIT', 'BABYMONSTER', 'NCT 127', 'TREASURE',
  'Mrs. GREEN APPLE', 'Creepy Nuts', 'Aimyon', 'back number', 'Spitz', 'Mr.Children', 'Hikaru Utada', 'Perfume',
  'BABYMETAL', 'ONE OK ROCK', 'Kenshi Yonezu', 'Yorushika', 'Zutomayo',

  // Reggae
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
  'metal anthems', 'classic country', 'reggae roots', 'top japan', 'top south korea',
  'kpop essentials', 'anime openings', 'city pop vibes', 'jazz masters', 'blues legends',
  'j-pop hits', 'k-pop hits', 'japanese city pop', 'j-rock anthems', 'korean r&b', 'top usa', 'top uk',
  'soundtrack masterpieces', 'acoustic chill', 'road trip anthems', 'party classics', 'all time hits'
];

// Cross-product decade & genre query generator
export const DECADE_GENRE_SEEDS = [];
const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
const GENRES = ['rock', 'pop', 'hip hop', 'dance', 'r&b', 'soul', 'jazz', 'electronic', 'indie', 'metal', 'j-pop', 'reggae', 'country', 'funk', 'punk'];
for (const d of DECADES) {
  for (const g of GENRES) {
    DECADE_GENRE_SEEDS.push(`${d} ${g}`);
  }
}

// Fine-grained Year (1960-2026) x Genre Matrix yielding 1,600+ rich queries
export const YEAR_GENRE_SEEDS = [];
const EXTENDED_GENRES = [
  'rock', 'pop', 'hip hop', 'dance', 'r&b', 'soul', 'jazz', 'electronic', 'indie',
  'metal', 'j-pop', 'reggae', 'country', 'funk', 'punk', 'house', 'techno',
  'blues', 'folk', 'ambient', 'synthwave', 'k-pop', 'city pop', 'disco', 'alternative'
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

// Apple Music "most played" charts per storefront: clean, popularity-ranked, original-script titles
export const APPLE_CHART_STOREFRONTS = ['us', 'gb', 'jp', 'kr'];
const APPLE_CHART_URL = (storefront, limit) => `https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/${limit}/songs.json`;

function parseReleaseYear(date) {
  if (!date) return null;
  const year = parseInt(String(date).slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

/**
 * Maps a Deezer track object onto an upsertTrack payload.
 * @param {Object} t Deezer track (search, playlist, album or top-tracks payload)
 * @param {Object} [context] Overrides when the payload lacks album/artist details
 */
export function toCatalogCandidate(t, { artistName, album, releaseDate, artistId, fansCount } = {}) {
  const date = t.release_date || releaseDate || null;
  const deezerArtistId = t.artist?.id || artistId;
  return {
    title: t.title,
    artist: t.artist?.name || artistName || 'Unknown Artist',
    isrc: t.isrc || null,
    album: album ?? t.album?.title ?? '',
    durationMs: (t.duration || 0) * 1000,
    releaseYear: parseReleaseYear(date),
    releaseDate: date,
    deezerRank: t.rank || null,
    isExplicit: Boolean(t.explicit_lyrics),
    provider: 'deezer',
    providerTrackId: String(t.id),
    sampleUrl: t.preview,
    sampleCodec: 'mp3',
    sampleDurationSec: 30,
    externalUrl: t.link || null,
    rawMetadata: {
      deezerRank: t.rank,
      artistId: deezerArtistId,
      albumId: t.album?.id,
    },
    artistMetadata: {
      deezerId: deezerArtistId,
      ...(fansCount ? { fansCount } : {}),
    },
  };
}

export class MusicHarvester {
  constructor(catalog = sqliteCatalog, { fetchImpl = politeFetch } = {}) {
    this.catalog = catalog;
    this.fetch = fetchImpl;
    this.abortRequested = false;
    this.skippedArtists = 0;
  }

  stop() {
    this.abortRequested = true;
  }

  async _getJson(url, rateLimiter = deezerRateLimiter) {
    const response = await this.fetch(url, {}, { rateLimiter });
    if (!response.ok) return null;
    return response.json();
  }

  _ingest(tracks, context = {}) {
    const candidates = [];
    for (const t of tracks) {
      if (!isAuthenticCandidate(t)) continue;
      candidates.push(toCatalogCandidate(t, context));
    }
    if (candidates.length === 0) return { inserted: 0, merged: 0 };
    return this.catalog.upsertBatch(candidates);
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
        const data = await this._getJson(url);
        const tracks = data?.data || [];
        if (tracks.length === 0) break;

        const res = this._ingest(tracks);
        harvested += res.inserted;
        merged += res.merged;

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
        const searchJson = await this._getJson(`https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=${maxPlaylistsPerQuery}`);
        const playlists = searchJson?.data || [];

        for (const pl of playlists) {
          if (this.abortRequested) break;
          if (!pl.id) continue;

          const tracksJson = await this._getJson(`https://api.deezer.com/playlist/${pl.id}/tracks?limit=100`);
          const tracks = tracksJson?.data || [];
          const res = this._ingest(tracks);
          harvested += res.inserted;
          merged += res.merged;

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
   * and optionally spiders high-fan related artists. Artists whose top tracks are
   * not English/Japanese/Korean are skipped before any album requests.
   */
  async harvestArtistDiscography(artistName, { maxAlbums = 8, includeRelated = true } = {}) {
    if (this.abortRequested) return { harvested: 0, merged: 0, relatedArtists: [] };

    let totalHarvested = 0;
    let totalMerged = 0;
    const relatedArtists = [];

    try {
      // 1. Find artist on Deezer and pick highest fan-count authentic artist
      const searchJson = await this._getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=10`);
      const rawList = searchJson?.data || [];
      if (rawList.length === 0) return { harvested: 0, merged: 0, relatedArtists: [] };

      // Sort by fan count descending to eliminate amateur namesakes
      const sortedByFans = [...rawList].sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
      const exactMatches = sortedByFans.filter(a => a.name.toLowerCase().trim() === artistName.toLowerCase().trim());
      const artistData = exactMatches[0] || sortedByFans[0];
      if (!artistData || !artistData.id) return { harvested: 0, merged: 0, relatedArtists: [] };

      const artistId = artistData.id;
      const officialArtistName = artistData.name || artistName;
      const artistContext = { artistName: officialArtistName, artistId, fansCount: artistData.nb_fan || 0 };

      // 2. Fetch artist's Top 50 Tracks
      const topJson = await this._getJson(`https://api.deezer.com/artist/${artistId}/top?limit=50`);
      const topTracks = topJson?.data || [];

      // Skip out-of-scope artists early (saves the album and related-artist requests)
      const { language } = classifyArtistLanguage({ titles: topTracks.map(t => t.title), name: officialArtistName });
      if (language && !isAllowedLanguage(language)) {
        this.skippedArtists++;
        logger.info('harvester', `Skipping ${officialArtistName}: catalog language "${language}" is outside en/ja/ko`);
        return { harvested: 0, merged: 0, relatedArtists: [], skipped: true };
      }

      const topRes = this._ingest(topTracks, { ...artistContext, album: undefined });
      totalHarvested += topRes.inserted;
      totalMerged += topRes.merged;

      // 3. Fetch artist's studio albums
      const albumsJson = await this._getJson(`https://api.deezer.com/artist/${artistId}/albums?limit=25`);
      const albums = albumsJson?.data || [];
      let albumCount = 0;

      for (const album of albums) {
        if (this.abortRequested || albumCount >= maxAlbums) break;
        // Skip compilation, tribute and live albums
        if (!album.id || /tribute|karaoke|live|cover/i.test(album.title || '')) continue;
        albumCount++;

        const tracksJson = await this._getJson(`https://api.deezer.com/album/${album.id}/tracks?limit=50`);
        const albumTracks = tracksJson?.data || [];
        const res = this._ingest(albumTracks, { ...artistContext, album: album.title || '', releaseDate: album.release_date || null });
        totalHarvested += res.inserted;
        totalMerged += res.merged;
      }

      // 4. Spider related artists with >= 100k fans
      if (includeRelated) {
        const relatedJson = await this._getJson(`https://api.deezer.com/artist/${artistId}/related?limit=8`);
        for (const rel of relatedJson?.data || []) {
          if (rel.name && (rel.nb_fan || 0) >= 100000) {
            relatedArtists.push(rel.name);
          }
        }
      }
    } catch (err) {
      logger.warn('harvester', `Failed discography crawl for ${artistName}: ${err.message}`);
    }

    return { harvested: totalHarvested, merged: totalMerged, relatedArtists };
  }

  /**
   * Ingests Apple Music "most played" charts. Each chart entry is matched to its Deezer
   * track (same artist + same base title) so the catalog gets a Deezer id, rank and preview.
   */
  async harvestAppleCharts({ storefronts = APPLE_CHART_STOREFRONTS, limit = 100 } = {}) {
    let harvested = 0;
    let merged = 0;
    let unmatched = 0;

    for (const storefront of storefronts) {
      if (this.abortRequested) break;
      let entries;
      try {
        const feed = await this._getJson(APPLE_CHART_URL(storefront, limit), itunesRateLimiter);
        entries = feed?.feed?.results || [];
      } catch (err) {
        logger.warn('harvester', `Apple chart ${storefront} failed: ${err.message}`);
        continue;
      }

      for (const entry of entries) {
        if (this.abortRequested) break;
        const match = await this._findDeezerTrack(entry.artistName, entry.name);
        if (!match) {
          unmatched++;
          continue;
        }
        const res = this._ingest([match]);
        harvested += res.inserted;
        merged += res.merged;
      }
    }

    return { harvested, merged, unmatched };
  }

  /** Deezer track whose artist and base title both match exactly, or null. */
  async _findDeezerTrack(artistName, title) {
    if (!artistName || !title) return null;
    const primaryArtist = splitPrimaryArtist(artistName);
    // Plain query: Deezer's advanced artist:"…" filter currently returns unrelated or no results
    const query = `${primaryArtist} ${stripVersionTags(title)}`.replace(/"/g, '');
    try {
      const data = await this._getJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`);
      // Bands with "&" in the name ("Mumford & Sons") match on the full credit, duets on the primary artist
      const wantedArtists = new Set([canonicalArtistKey(artistName), canonicalArtistKey(primaryArtist)]);
      const wantedTitle = baseTitleKey(title);
      return (data?.data || []).find(t =>
        wantedArtists.has(canonicalArtistKey(t.artist?.name || '')) && baseTitleKey(t.title || '') === wantedTitle
      ) || null;
    } catch (err) {
      logger.warn('harvester', `Deezer match failed for ${artistName} - ${title}: ${err.message}`);
      return null;
    }
  }

  /**
   * Executes an autonomous catalog harvest across all multi-provider vectors:
   * 0. Apple Music charts (US, UK, Japan, Korea)
   * 1. Curated Playlists Spider
   * 2. Decade & Genre Matrix Sweep
   * 3. Foundation Artists & Related Artists Discography Spider
   * 4. High-Frequency Lexicon Keywords
   * 5. Year x Genre matrix
   * 6. Bigram sweep
   */
  async runFullHarvest({
    targetTracks = 100000,
    chartsLimit = 100,
    playlistsLimit = 40,
    decadesLimit = 105,
    artistsLimit = 150,
    lexiconLimit = 350,
    onProgress = () => {},
  } = {}) {
    logger.info('harvester', `Starting massive catalog harvest targeting ${targetTracks.toLocaleString()} tracks...`);

    const stats = {
      chartTracksMatched: 0,
      playlistsCrawled: 0,
      decadeQueriesCrawled: 0,
      artistsCrawled: 0,
      artistsSkipped: 0,
      lexiconWordsCrawled: 0,
      totalInserted: 0,
      totalMerged: 0,
    };

    // COUNT(*) only: getStats() aggregates provider links and is too heavy to call per query
    const currentStats = () => ({ ...this.catalog.countSummary(), rejections: this.catalog.getRejectionStats() });
    const isTargetReached = () => this.catalog.countSummary().tracks >= targetTracks;
    const report = (currentAction) => onProgress({ ...stats, artistsSkipped: this.skippedArtists, currentAction, currentStats: currentStats() });

    // Vector 0: Apple Music charts
    if (chartsLimit > 0 && !isTargetReached() && !this.abortRequested) {
      const res = await this.harvestAppleCharts({ limit: chartsLimit });
      stats.chartTracksMatched = res.harvested + res.merged;
      stats.totalInserted += res.harvested;
      stats.totalMerged += res.merged;
      report(`Apple charts: ${res.harvested} new, ${res.merged} merged, ${res.unmatched} unmatched`);
    }

    // Vector 1: Curated Genre & Historical Playlists Spidering
    if (playlistsLimit > 0 && !isTargetReached() && !this.abortRequested) {
      const playlistsToCrawl = CURATED_PLAYLIST_SEEDS.slice(0, playlistsLimit);
      for (const plQuery of playlistsToCrawl) {
        if (this.abortRequested || isTargetReached()) break;
        const res = await this.harvestCuratedPlaylists([plQuery], 3, (p) => report(`Playlist: ${p.query}`));
        stats.playlistsCrawled++;
        stats.totalInserted += res.harvested;
        stats.totalMerged += res.merged;
        report(`Completed playlist: "${plQuery}"`);
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
        report(`Decade/Genre: "${query}"`);
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
        for (const rel of res.relatedArtists || []) {
          if (!visitedArtists.has(rel.toLowerCase())) {
            visitedArtists.add(rel.toLowerCase());
            artistQueue.push(rel);
          }
        }

        report(`Artist: ${artist}${res.skipped ? ' (skipped: out-of-scope language)' : ''}`);
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
        report(`Vocabulary: "${word}"`);
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
        report(`Year/Genre: "${query}"`);
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
        report(`Bigram: "${bigram}"`);
      }
    }

    stats.artistsSkipped = this.skippedArtists;
    return stats;
  }
}

/** First credited artist of an Apple chart entry ("A & B", "A, B", "A feat. B" -> "A"). */
function splitPrimaryArtist(name) {
  return String(name).split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\bwith\b)\s*/i)[0].trim() || String(name).trim();
}

export const musicHarvester = new MusicHarvester();
