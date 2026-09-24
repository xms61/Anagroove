import { sqliteCatalog } from '../db/sqliteCatalog.ts';
import { classifyArtistLanguage } from '../db/languageClassifier.ts';
import { ALLOWED_LANGUAGES, baseTitleKey, stripVersionTags } from '../db/trackNormalization.ts';
import { MIN_ARTIST_FANS } from '../db/catalogPopularity.ts';
import { canonicalArtistKey } from '../../shared/musicIdentity.ts';
import { isAuthenticCandidate } from './authenticityFilter.ts';
import { politeFetch, deezerRateLimiter, itunesRateLimiter, type TokenBucketRateLimiter } from './rateLimiter.ts';
import { STREAMED_ARTIST_NAMES } from './artistBaseline.ts';
import { logger } from '../logger.ts';
import { THEMES, genresForPrompt } from '../../shared/themes.ts';
import { errorMessage } from '../errors.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { TrackInput } from '../db/sqliteCatalog.ts';
import type { DeezerApiTrack } from '../services/deezerMusicProvider.ts';

interface DeezerArtistJson {
  id?: number;
  name?: string;
  nb_fan?: number;
}

/** Album/artist details a track payload may lack, taken from the page it was found on. */
export interface CandidateContext {
  artistName?: string;
  album?: string;
  releaseDate?: string | null;
  artistId?: number;
  fansCount?: number;
  genre?: string | null;
}

export interface HarvestResult {
  harvested: number;
  merged: number;
}

export interface DiscographyResult extends HarvestResult {
  relatedArtists: { name: string; deezerId?: number }[];
  skipped?: boolean;
}

/** The catalog calls the harvester makes (SqliteCatalog). */
export interface HarvestCatalog {
  db: DatabaseSync;
  upsertBatch(batch: TrackInput[]): { inserted: number; merged: number };
  countSummary(): { tracks: number; artists: number };
  getRejectionStats(): Record<string, number>;
}

type Fetch = (url: string, options: RequestInit, retry: { rateLimiter: TokenBucketRateLimiter }) => Promise<Response>;

export interface HarvestOptions {
  targetTracks?: number;
  chartsLimit?: number;
  playlistsLimit?: number;
  decadesLimit?: number;
  cjkLimit?: number;
  artistsLimit?: number;
  lexiconLimit?: number;
  onProgress?: (progress: HarvestProgress) => void;
}

/** What runFullHarvest reports after each query, next to its running counters. */
export interface HarvestProgress {
  currentAction: string;
  currentStats: { tracks: number; artists: number; rejections: Record<string, number> };
  [counter: string]: unknown;
}

const defaultCatalog: HarvestCatalog = sqliteCatalog;
const defaultFetch: Fetch = politeFetch;

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


/** Playlist searches from the theme table. The theme's first genre tags the artists they contain. */
export const PLAYLIST_SEEDS: { query: string; genre: string | null }[] = THEMES.flatMap(theme => theme.seeds.map(query => ({ query, genre: theme.genres[0] || null })));

/** Decade playlist searches ("80s rock"); the genre word tags the artists they contain. */
const DECADES = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
const DECADE_STYLES = ['hits', 'rock', 'pop', 'soul', 'hip hop', 'dance', 'country'];
export const DECADE_PLAYLIST_SEEDS = DECADES.flatMap(decade => DECADE_STYLES.map(style => ({
  query: `${decade} ${style}`,
  genre: genresForPrompt('', style)[0] ?? null,
})));

/** Deezer's "Asian Music" genre chart, the entry point of the ja/ko vector. */
const ASIAN_MUSIC_CHART_ID = 16;

/** Top tracks whose ISRCs (`/track/{id}`) back a second language vote before an artist is skipped. */
const ISRC_SAMPLE_TRACKS = 3;

// Apple Music "most played" charts per storefront: clean, popularity-ranked, original-script titles
export const APPLE_CHART_STOREFRONTS = ['us', 'gb', 'jp', 'kr'];
const APPLE_CHART_URL = (storefront: string, limit: number) => `https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/${limit}/songs.json`;

function parseReleaseYear(date: string | null): number | null {
  if (!date) return null;
  const year = parseInt(String(date).slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

/** Maps a Deezer track (search, playlist, album or top-tracks payload) onto an upsertTrack payload. */
export function toCatalogCandidate(t: DeezerApiTrack, { artistName, album, releaseDate, artistId, fansCount, genre }: CandidateContext = {}) {
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
      ...(genre ? { genres: [genre] } : {}),
    },
  };
}

export class MusicHarvester {
  readonly catalog: HarvestCatalog;
  readonly fetch: Fetch;
  abortRequested = false;
  skippedArtists = 0;

  constructor(catalog: HarvestCatalog = defaultCatalog, { fetchImpl = defaultFetch }: { fetchImpl?: Fetch } = {}) {
    this.catalog = catalog;
    this.fetch = fetchImpl;
  }

  stop(): void {
    this.abortRequested = true;
  }

  async _getJson<T>(url: string, rateLimiter: TokenBucketRateLimiter = deezerRateLimiter): Promise<T | null> {
    const response = await this.fetch(url, {}, { rateLimiter });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  }

  _ingest(tracks: DeezerApiTrack[], context: CandidateContext = {}): { inserted: number; merged: number } {
    const candidates: ReturnType<typeof toCatalogCandidate>[] = [];
    for (const t of tracks) {
      if (!isAuthenticCandidate(t)) continue;
      candidates.push(toCatalogCandidate(t, context));
    }
    if (candidates.length === 0) return { inserted: 0, merged: 0 };
    return this.catalog.upsertBatch(candidates);
  }

  /** Harvests Deezer search results, `maxOffsets` pages of 100 tracks. */
  async harvestDeezerQuery(query: string, maxOffsets = 2): Promise<HarvestResult> {
    let harvested = 0;
    let merged = 0;

    for (let offsetIndex = 0; offsetIndex < maxOffsets; offsetIndex++) {
      if (this.abortRequested) break;
      const index = offsetIndex * 100;
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=100&index=${index}`;

      try {
        const data = await this._getJson<{ data?: DeezerApiTrack[] }>(url);
        const tracks = data?.data || [];
        if (tracks.length === 0) break;

        const res = this._ingest(tracks);
        harvested += res.inserted;
        merged += res.merged;

        if (tracks.length < 100) break; // Reached end of results
      } catch (err) {
        logger.warn('harvester', `Deezer query "${query}" offset ${index} failed: ${errorMessage(err)}`);
      }
    }

    return { harvested, merged };
  }

  /**
   * Harvests the first `maxPlaylists` Deezer playlists found for a search. With a `genre`, every
   * artist on them gets that genre (their theme), which genre prompts can then match.
   */
  async harvestPlaylists(query: string, { genre = null, maxPlaylists = 3, onProgress = () => {} }: {
    genre?: string | null;
    maxPlaylists?: number;
    onProgress?: (progress: { query: string; playlistTitle?: string; tracksFound: number; harvested: number; merged: number }) => void;
  } = {}): Promise<HarvestResult> {
    let harvested = 0;
    let merged = 0;
    try {
      const searchJson = await this._getJson<{ data?: { id?: number; title?: string }[] }>(`https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=${maxPlaylists}`);
      for (const playlist of searchJson?.data || []) {
        if (this.abortRequested) break;
        if (!playlist.id) continue;
        const tracksJson = await this._getJson<{ data?: DeezerApiTrack[] }>(`https://api.deezer.com/playlist/${playlist.id}/tracks?limit=100`);
        const tracks = tracksJson?.data || [];
        const res = this._ingest(tracks, { genre });
        harvested += res.inserted;
        merged += res.merged;
        onProgress({ query, playlistTitle: playlist.title, tracksFound: tracks.length, harvested, merged });
      }
    } catch (err) {
      logger.warn('harvester', `Playlist harvest for "${query}" failed: ${errorMessage(err)}`);
    }
    return { harvested, merged };
  }

  /**
   * Harvests an artist's top tracks and up to `maxAlbums` studio albums, and returns related
   * artists with at least `relatedMinFans` fans for the caller to crawl next. Pass `deezerId`
   * when known (no name search). Skipped without requests for albums: artists under
   * MIN_ARTIST_FANS (the cleanup would drop most of their tracks) and artists whose language
   * (`_artistLanguage`) is outside `languages`.
   */
  async harvestArtistDiscography(artistName: string, {
    deezerId = null,
    maxAlbums = 8,
    includeRelated = true,
    relatedMinFans = 100000,
    languages = ALLOWED_LANGUAGES,
  }: {
    deezerId?: number | null;
    maxAlbums?: number;
    includeRelated?: boolean;
    relatedMinFans?: number;
    languages?: readonly string[];
  } = {}): Promise<DiscographyResult> {
    const empty: DiscographyResult = { harvested: 0, merged: 0, relatedArtists: [] };
    if (this.abortRequested) return empty;

    let harvested = 0;
    let merged = 0;
    const relatedArtists: DiscographyResult['relatedArtists'] = [];
    const skip = (reason: string): DiscographyResult => {
      this.skippedArtists++;
      logger.info('harvester', `Skipping ${artistName}: ${reason}`);
      return { ...empty, skipped: true };
    };

    try {
      const artistData = deezerId
        ? await this._getJson<DeezerArtistJson>(`https://api.deezer.com/artist/${deezerId}`)
        : await this._findArtist(artistName);
      if (!artistData?.id) return empty;
      if ((artistData.nb_fan || 0) < MIN_ARTIST_FANS) return skip(`${artistData.nb_fan || 0} fans`);

      const artistId = artistData.id;
      const artistContext = { artistName: artistData.name || artistName, artistId, fansCount: artistData.nb_fan };

      const topTracks = (await this._getJson<{ data?: DeezerApiTrack[] }>(`https://api.deezer.com/artist/${artistId}/top?limit=50`))?.data || [];
      const language = await this._artistLanguage(artistId, artistContext.artistName, topTracks, languages);
      if (language && !languages.includes(language)) return skip(`catalog language "${language}"`);

      const topRes = this._ingest(topTracks, { ...artistContext, album: undefined });
      harvested += topRes.inserted;
      merged += topRes.merged;

      const albums = (await this._getJson<{ data?: { id?: number; title?: string; release_date?: string }[] }>(`https://api.deezer.com/artist/${artistId}/albums?limit=25`))?.data || [];
      let albumCount = 0;
      for (const album of albums) {
        if (this.abortRequested || albumCount >= maxAlbums) break;
        // Skip compilation, tribute and live albums
        if (!album.id || /tribute|karaoke|live|cover/i.test(album.title || '')) continue;
        albumCount++;
        const albumTracks = (await this._getJson<{ data?: DeezerApiTrack[] }>(`https://api.deezer.com/album/${album.id}/tracks?limit=50`))?.data || [];
        const res = this._ingest(albumTracks, { ...artistContext, album: album.title || '', releaseDate: album.release_date || null });
        harvested += res.inserted;
        merged += res.merged;
      }

      if (includeRelated) {
        const related = (await this._getJson<{ data?: DeezerArtistJson[] }>(`https://api.deezer.com/artist/${artistId}/related?limit=8`))?.data || [];
        for (const rel of related) {
          if (rel.name && (rel.nb_fan || 0) >= relatedMinFans) relatedArtists.push({ name: rel.name, deezerId: rel.id });
        }
      }
    } catch (err) {
      logger.warn('harvester', `Failed discography crawl for ${artistName}: ${errorMessage(err)}`);
    }

    return { harvested, merged, relatedArtists };
  }

  /**
   * An artist's language: the catalog's vote when the artist is already stored (it saw their
   * ISRCs), else a vote over their top tracks. Top-track payloads carry no ISRCs and Deezer
   * romanizes Japanese and Korean titles ("Usseewa"), so a vote outside `languages` is taken
   * again with the ISRCs of the first ISRC_SAMPLE_TRACKS top tracks.
   */
  async _artistLanguage(artistId: number, name: string, topTracks: DeezerApiTrack[], languages: readonly string[]): Promise<string | null> {
    const stored = this.catalog.db.prepare('SELECT primary_language FROM artists WHERE deezer_id = ?').get(artistId) as { primary_language: string | null } | undefined;
    if (stored?.primary_language) return stored.primary_language;

    const titles = topTracks.map(t => t.title ?? '');
    const titleVote = classifyArtistLanguage({ titles, name }).language;
    if (!titleVote || languages.includes(titleVote)) return titleVote;
    const isrcs = await this._trackIsrcs(topTracks.slice(0, ISRC_SAMPLE_TRACKS));
    return classifyArtistLanguage({ titles, isrcs, name }).language;
  }

  /** ISRCs from `/track/{id}`, the only Deezer payload that always has them. */
  async _trackIsrcs(tracks: DeezerApiTrack[]): Promise<string[]> {
    const isrcs: string[] = [];
    for (const track of tracks) {
      const full = await this._getJson<DeezerApiTrack>(`https://api.deezer.com/track/${track.id}`);
      if (full?.isrc) isrcs.push(full.isrc);
    }
    return isrcs;
  }

  /** The Deezer artist for a name: an exact name match with the most fans, else the most fans. */
  async _findArtist(artistName: string): Promise<DeezerArtistJson | null> {
    const found = (await this._getJson<{ data?: DeezerArtistJson[] }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=10`))?.data || [];
    const byFans = [...found].sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
    const wanted = artistName.toLowerCase().trim();
    return byFans.find(a => (a.name || '').toLowerCase().trim() === wanted) || byFans[0] || null;
  }

  /** Harvests a Deezer genre chart (`/chart/{genreId}/tracks`). */
  async harvestDeezerChart(genreId: number, limit = 100): Promise<HarvestResult> {
    const tracks = (await this._getJson<{ data?: DeezerApiTrack[] }>(`https://api.deezer.com/chart/${genreId}/tracks?limit=${limit}`))?.data || [];
    const res = this._ingest(tracks);
    return { harvested: res.inserted, merged: res.merged };
  }

  /** Japanese and Korean catalog artists with a Deezer id, most fans first: seeds of the ja/ko vector. */
  _cjkCatalogArtists(): { name: string; deezerId: number }[] {
    return this.catalog.db.prepare(`
      SELECT display_name AS name, deezer_id AS deezerId FROM artists
      WHERE primary_language IN ('ja', 'ko') AND deezer_id IS NOT NULL
      ORDER BY fans_count DESC, id
    `).all() as { name: string; deezerId: number }[];
  }

  /**
   * Ingests Apple Music "most played" charts. Each chart entry is matched to its Deezer
   * track (same artist + same base title) so the catalog gets a Deezer id, rank and preview.
   */
  async harvestAppleCharts({ storefronts = APPLE_CHART_STOREFRONTS, limit = 100 }: { storefronts?: string[]; limit?: number } = {}): Promise<HarvestResult & { unmatched: number }> {
    let harvested = 0;
    let merged = 0;
    let unmatched = 0;

    for (const storefront of storefronts) {
      if (this.abortRequested) break;
      let entries: { artistName?: string; name?: string }[];
      try {
        const feed = await this._getJson<{ feed?: { results?: { artistName?: string; name?: string }[] } }>(APPLE_CHART_URL(storefront, limit), itunesRateLimiter);
        entries = feed?.feed?.results || [];
      } catch (err) {
        logger.warn('harvester', `Apple chart ${storefront} failed: ${errorMessage(err)}`);
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
  async _findDeezerTrack(artistName: string | undefined, title: string | undefined): Promise<DeezerApiTrack | null> {
    if (!artistName || !title) return null;
    const primaryArtist = splitPrimaryArtist(artistName);
    // Plain query: Deezer's advanced artist:"…" filter currently returns unrelated or no results
    const query = `${primaryArtist} ${stripVersionTags(title)}`.replace(/"/g, '');
    try {
      const data = await this._getJson<{ data?: DeezerApiTrack[] }>(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`);
      // Bands with "&" in the name ("Mumford & Sons") match on the full credit, duets on the primary artist
      const wantedArtists = new Set([canonicalArtistKey(artistName), canonicalArtistKey(primaryArtist)]);
      const wantedTitle = baseTitleKey(title);
      return (data?.data || []).find(t =>
        wantedArtists.has(canonicalArtistKey(t.artist?.name || '')) && baseTitleKey(t.title || '') === wantedTitle
      ) || null;
    } catch (err) {
      logger.warn('harvester', `Deezer match failed for ${artistName} - ${title}: ${errorMessage(err)}`);
      return null;
    }
  }

  /**
   * Runs the enabled vectors in order until the catalog holds `targetTracks`. A limit of 0 turns
   * a vector off; every vector is bounded by its limit.
   *   charts     Apple Music "most played" entries per storefront (us/gb/jp/kr), matched to Deezer
   *   playlists  theme playlist searches (artists get the theme genre)
   *   decades    decade playlist searches ("80s rock"; artists get the genre)
   *   cjk        the Deezer Asian Music chart, then discographies of Japanese/Korean catalog
   *              artists and their related ja/ko artists (limit = discographies)
   *   artists    discographies of foundation artists, then their related artists (limit = discographies)
   *   lexicon    single-word title searches
   */
  async runFullHarvest({
    targetTracks = 100000,
    chartsLimit = 0,
    playlistsLimit = 0,
    decadesLimit = 0,
    cjkLimit = 0,
    artistsLimit = 0,
    lexiconLimit = 0,
    onProgress = () => {},
  }: HarvestOptions = {}) {
    logger.info('harvester', `Starting catalog harvest, target ${targetTracks.toLocaleString()} tracks...`);

    const stats = {
      chartTracksMatched: 0,
      playlistsCrawled: 0,
      decadePlaylistsCrawled: 0,
      cjkArtistsCrawled: 0,
      artistsCrawled: 0,
      artistsSkipped: 0,
      lexiconWordsCrawled: 0,
      totalInserted: 0,
      totalMerged: 0,
    };
    // COUNT(*) only: getStats() aggregates provider links and is too heavy to call per query
    const shouldStop = () => this.abortRequested || this.catalog.countSummary().tracks >= targetTracks;
    type Counter = Exclude<keyof typeof stats, 'totalInserted' | 'totalMerged'>;
    const report = (currentAction: string) => onProgress({
      ...stats,
      artistsSkipped: this.skippedArtists,
      currentAction,
      currentStats: { ...this.catalog.countSummary(), rejections: this.catalog.getRejectionStats() },
    });
    const add = (res: HarvestResult) => {
      stats.totalInserted += res.harvested;
      stats.totalMerged += res.merged;
    };

    /** One harvest per item until the list, or the target, is done. */
    const sweep = async <T>(items: readonly T[], statKey: Counter, harvest: (item: T) => Promise<HarvestResult>, label: (item: T) => string) => {
      for (const item of items) {
        if (shouldStop()) break;
        add(await harvest(item));
        stats[statKey]++;
        report(label(item));
      }
    };

    /** Discographies breadth-first from the seed artists, at most `limit` in total (related included). */
    const spider = async (
      seedArtists: { name: string; deezerId?: number }[],
      limit: number,
      statKey: Counter,
      options: Parameters<MusicHarvester['harvestArtistDiscography']>[1],
    ) => {
      const queue = [...seedArtists];
      const seen = new Set(queue.map(a => a.name.toLowerCase()));
      for (let crawled = 0; crawled < limit && queue.length > 0 && !shouldStop(); crawled++) {
        const artist = queue.shift()!;
        const res = await this.harvestArtistDiscography(artist.name, { deezerId: artist.deezerId, ...options });
        add(res);
        stats[statKey]++;
        for (const related of res.relatedArtists) {
          if (seen.has(related.name.toLowerCase())) continue;
          seen.add(related.name.toLowerCase());
          queue.push(related);
        }
        report(`Artist: ${artist.name}${res.skipped ? ' (skipped)' : ''}`);
      }
    };

    if (chartsLimit > 0 && !shouldStop()) {
      const res = await this.harvestAppleCharts({ limit: chartsLimit });
      stats.chartTracksMatched = res.harvested + res.merged;
      add(res);
      report(`Apple charts: ${res.harvested} new, ${res.merged} merged, ${res.unmatched} unmatched`);
    }
    const harvestPlaylistSeed = (seed: { query: string; genre: string | null }) => this.harvestPlaylists(seed.query, { genre: seed.genre });
    await sweep(PLAYLIST_SEEDS.slice(0, playlistsLimit), 'playlistsCrawled', harvestPlaylistSeed, seed => `Playlist: ${seed.query}`);
    await sweep(DECADE_PLAYLIST_SEEDS.slice(0, decadesLimit), 'decadePlaylistsCrawled', harvestPlaylistSeed, seed => `Decade playlist: ${seed.query}`);
    if (cjkLimit > 0 && !shouldStop()) {
      add(await this.harvestDeezerChart(ASIAN_MUSIC_CHART_ID));
      report('Deezer Asian Music chart');
      await spider(this._cjkCatalogArtists(), cjkLimit, 'cjkArtistsCrawled', { languages: ['ja', 'ko'], relatedMinFans: MIN_ARTIST_FANS * 4 });
    }
    await spider(FOUNDATION_ARTISTS.map(name => ({ name })), artistsLimit, 'artistsCrawled', {});
    await sweep(MUSIC_LEXICON_SEEDS.slice(0, lexiconLimit), 'lexiconWordsCrawled', word => this.harvestDeezerQuery(word, 3), word => `Word: ${word}`);

    stats.artistsSkipped = this.skippedArtists;
    return stats;
  }
}

/** First credited artist of an Apple chart entry ("A & B", "A, B", "A feat. B" -> "A"). */
function splitPrimaryArtist(name: string): string {
  return String(name).split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\bwith\b)\s*/i)[0].trim() || String(name).trim();
}

export const musicHarvester = new MusicHarvester();
