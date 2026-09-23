import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEEZER_GENRE_TAXONOMY } from '../../server/services/deezerMusicProvider.js';
import { mapItunesTrack, detectStorefront } from '../../server/services/itunesMusicProvider.js';
import { parsePrompt, buildQueryPlan, generateThemeVariations } from '../../server/services/queryBuilder.js';
import {
  isLanguagePermitted,
  isThematicallyPermitted,
  isTemporalPermitted,
  isAuthenticTrack,
} from '../../server/policy/selectionPolicy.js';
import { validateLivePuzzlePayload } from '../../server/validators.js';

test('Live Mode Genre Taxonomy & Catalog Parity', async () => {
  const catalogThemes = [
    'mixed', 'kpop', 'anime', 'gaming', 'pop', 'rock',
    'hiphop', 'edm', 'cinematic', 'latin', 'poppunk'
  ];
  for (const theme of catalogThemes) {
    const puzValidation = validateLivePuzzlePayload({ genre: theme });
    assert(puzValidation.valid && puzValidation.data.genre === theme, `validateLivePuzzlePayload accepts genre '${theme}'`);
    const conf = DEEZER_GENRE_TAXONOMY[theme];
    assert(
      conf && (conf.chartId !== undefined || conf.searches?.length > 0) && conf.minFans > 0 && conf.minRank > 0,
      `DEEZER_GENRE_TAXONOMY defines viable configuration for catalog theme '${theme}'`
    );
  }
  assert(Boolean(DEEZER_GENRE_TAXONOMY.all && DEEZER_GENRE_TAXONOMY.electronic), 'Backward compatibility aliases all and electronic exist');
});

test('Prompt Parsing, iTunes Mapping & Steered Query Builder', async () => {
  const parsedPrompt = parsePrompt('obscure 80s synth-pop by Daft Punk');
  assert(parsedPrompt.popularity === 'obscure', 'Parses obscure popularity modifier');
  assert(parsedPrompt.decade === '1980s', 'Parses 80s decade into 1980s');
  assert(parsedPrompt.artist === 'Daft Punk', 'Parses artist from directive "by Daft Punk"');
  assert(parsedPrompt.genre === 'synth-pop', 'Extracts remaining theme as genre');

  const purePlan = buildQueryPlan({ popularity: 'pure' });
  assert(purePlan.popularity === 'pure' && purePlan.minFans === 0 && purePlan.minRank === 0, 'Pure mode clears popularity filters');
  assert(purePlan.deezerSearches.length > 0, 'Pure mode injects entropy search seeds');

  const animePlan = buildQueryPlan({ genre: 'anime' });
  assert(animePlan.genre === 'anime' && animePlan.deezerSearches.includes('anime opening'), 'Genre query retains targeted anime opening search');
  assert(!animePlan.deezerSearches.includes('anime'), 'Genre query avoids bare "anime" search to prevent DJ AniMe collisions');
  assert(animePlan.deezerSearches.every(s => !/^[a-z]{2}$/.test(s)), 'Genre query avoids adding unrelated alphanumeric seeds');

  assert(isLanguagePermitted({ title: 'Blinding Lights', artist: 'The Weeknd' }, 'pop') === true, 'Allows English track for pop');
  assert(isLanguagePermitted({ title: 'Amor de Mi Vida', artist: 'Artista' }, 'pop') === false, 'Rejects foreign track in English pop');
  assert(isLanguagePermitted({ title: 'Gurenge', artist: 'LiSA' }, 'anime') === true, 'Permits Japanese track for anime');
  assert(isLanguagePermitted({ title: 'Dynamite', artist: 'BTS' }, 'kpop') === true, 'Permits Korean track for kpop');

  const cityPopPlan = buildQueryPlan({ prompt: '80s Japanese City Pop', genre: 'all' });
  assert(cityPopPlan.genre === 'Japanese City Pop', 'Prompt overrides default genre=all');
  assert(cityPopPlan.deezerSearches.includes('Japanese City Pop'), 'Generates targeted Deezer search for prompt genre');
  assert(cityPopPlan.deezerSearches.includes('Japanese City Pop 1980s'), 'Generates compound search with decade');
  assert(cityPopPlan.deezerSearches.every(s => !/^[a-z]{2}$/.test(s)), 'Prompt query never injects random 2-letter seeds');

  assert(isLanguagePermitted({ title: 'Plastic Love', artist: 'Mariya Takeuchi' }, 'all', '80s Japanese City Pop') === true, 'Permits Japanese tracks for City Pop prompt');
  assert(isLanguagePermitted({ title: '真夜中のドア / Stay With Me', artist: '松原みき' }, 'all', 'Japanese City Pop') === true, 'Permits Kanji/Kana for Japanese City Pop prompt');

  // Storefront detection across international genres
  assert(detectStorefront('Japanese City Pop') === 'JP', 'Detects Japan storefront for Japanese City Pop');
  assert(detectStorefront('Korean Trot') === 'KR', 'Detects Korea storefront for Korean Trot');
  assert(detectStorefront('K-Pop') === 'US', 'Routes K-Pop to global US storefront');
  assert(detectStorefront('French House') === 'FR', 'Detects France storefront for French House');
  assert(detectStorefront('German Krautrock') === 'DE', 'Detects Germany storefront for German Krautrock');
  assert(detectStorefront('Bossa Nova') === 'BR', 'Detects Brazil storefront for Bossa Nova');
  assert(detectStorefront('Reggae Roots') === 'JM', 'Detects Jamaica storefront for Reggae Roots');
  assert(detectStorefront('Afrobeat') === 'NG', 'Detects Nigeria storefront for Afrobeat');
  assert(detectStorefront('Britpop') === 'GB', 'Detects UK storefront for Britpop');
  assert(detectStorefront('90s Grunge') === 'US', 'Defaults to US storefront for general rock');

  // Theme variation atomicity & subgenre retention
  const jcpVars = generateThemeVariations('Japanese City Pop', '1980s');
  assert(jcpVars.includes('City Pop') || jcpVars.includes('Japanese Citypop'), 'Retains atomic City Pop genre in variations');
  assert(!jcpVars.includes('Japanese Pop'), 'Does not dilute City Pop into general Japanese Pop');

  const fhVars = generateThemeVariations('French House');
  assert(fhVars.includes('french touch') || fhVars.includes('French House'), 'Includes French Touch synonym for French House');

  // Thematic relevance & cultural homonym filtering
  assert(isThematicallyPermitted({ title: 'Something', artist: 'The Japanese House' }, 'all', 'Japanese City Pop') === false, 'Rejects "The Japanese House" homonym for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Face Melter', artist: 'The Japanese Popstars' }, 'all', 'Japanese City Pop') === false, 'Rejects "The Japanese Popstars" homonym for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Japanese Boy', artist: 'Aneka' }, 'all', 'Japanese City Pop') === false, 'Rejects Aneka "Japanese Boy" novelty track for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Japanese Porn', artist: 'Doctor Flake' }, 'all', 'Japanese City Pop') === false, 'Rejects "Japanese Porn" novelty track for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'Unforgettable', artist: 'French Montana' }, 'all', 'French House') === false, 'Rejects "French Montana" homonym for French House');
  assert(isThematicallyPermitted({ title: 'Memories', artist: 'German Brigante' }, 'all', 'German Krautrock') === false, 'Rejects "German Brigante" homonym for German Krautrock');
  assert(isThematicallyPermitted({ title: 'Kill City', artist: 'Iggy Pop' }, 'all', 'Japanese City Pop') === false, 'Rejects Iggy Pop "Kill City" split-genre collision for City Pop');
  assert(isThematicallyPermitted({ title: 'Sparkle', artist: 'Tatsuro Yamashita' }, 'all', 'Japanese City Pop') === true, 'Permits authentic Tatsuro Yamashita for Japanese City Pop');
  assert(isThematicallyPermitted({ title: 'One More Time', artist: 'Daft Punk' }, 'all', 'French House') === true, 'Permits authentic Daft Punk for French House');
  assert(isThematicallyPermitted({ title: 'Vitamin C', artist: 'Can' }, 'all', 'German Krautrock') === true, 'Permits authentic Can for German Krautrock');
  assert(isThematicallyPermitted({ title: 'In Bloom', artist: 'Nirvana' }, 'all', '90s Grunge') === true, 'Permits authentic Nirvana for 90s Grunge');

  const itunesSample = {
    trackId: 12345,
    trackName: 'Midnight City',
    artistName: 'M83',
    previewUrl: 'https://audio.itunes.com/preview.m4a',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
    collectionName: 'Hurry Up, We Are Dreaming'
  };
  const mappedItunes = mapItunesTrack(itunesSample);
  assert(mappedItunes?.id === 'itunes:12345' && mappedItunes?.provider === 'itunes', 'Maps iTunes track format');
  assert(mappedItunes?.albumArt?.includes('600x600bb'), 'Scales iTunes artwork to 600x600');
  assert(mapItunesTrack({ trackId: 999 }) === null, 'Rejects iTunes track missing preview or title');

  // Multi-dimensional prompt parsing & temporal bounds
  const animeRange = parsePrompt('anime from the years 2020-2026');
  assert(
    animeRange.genre === 'anime' &&
    !animeRange.artist &&
    animeRange.yearRange?.start === 2020 &&
    animeRange.yearRange?.end === 2026,
    'Parses year range "2020-2026" without misidentifying as artist'
  );

  const rockBetween = parsePrompt('rock between 1970 and 1976');
  assert(
    rockBetween.genre === 'rock' &&
    rockBetween.yearRange?.start === 1970 &&
    rockBetween.yearRange?.end === 1976,
    'Parses "between 1970 and 1976" range'
  );

  const grungeBefore = parsePrompt('90s grunge before 1994');
  assert(
    grungeBefore.genre === 'grunge' &&
    grungeBefore.yearRange?.end === 1993,
    'Parses upper bound "before 1994"'
  );

  const kpopAfter = parsePrompt('k-pop after 2018');
  assert(
    kpopAfter.genre === 'k-pop' &&
    kpopAfter.yearRange?.start === 2019,
    'Parses lower bound "after 2018"'
  );

  const soundtrackYear = parsePrompt('soundtracks in 1999');
  assert(
    soundtrackYear.genre === 'soundtracks' &&
    soundtrackYear.yearRange?.start === 1999 &&
    soundtrackYear.yearRange?.end === 1999,
    'Parses single year "in 1999"'
  );

  // Single artist prompt parsing & noise word scrubbing
  const daftPrompt = parsePrompt('songs by Daft Punk');
  assert(
    daftPrompt.artist?.toLowerCase() === 'daft punk' &&
    !daftPrompt.genre,
    'Parses "songs by Daft Punk" without residual "songs" genre'
  );

  const queenPrompt = parsePrompt('Queen');
  assert(
    queenPrompt.artist === 'Queen' &&
    !queenPrompt.genre,
    'Identifies standalone recognized artist "Queen"'
  );

  // Temporal candidate filtering validation
  assert(isTemporalPermitted({ releaseDate: '2022-04-06T00:00:00Z' }, { start: 2020, end: 2026 }) === true, 'Permits release year within range');
  assert(isTemporalPermitted({ releaseDate: '2019-12-31T00:00:00Z' }, { start: 2020, end: 2026 }) === false, 'Rejects release year before range start');
  assert(isTemporalPermitted({ releaseDate: '2027-01-01T00:00:00Z' }, { start: 2020, end: 2026 }) === false, 'Rejects release year after range end');
  assert(isTemporalPermitted({ releaseDate: '1993-09-21T00:00:00Z' }, { end: 1993 }) === true, 'Permits release year meeting upper bound');
  assert(isTemporalPermitted({ releaseDate: '1994-03-08T00:00:00Z' }, { end: 1993 }) === false, 'Rejects release year exceeding upper bound');

  // Universal Remaster / Reissue Vintage Filtering
  assert(isTemporalPermitted({ title: 'Saved (2024 Remaster)', releaseDate: '2024-01-01' }, { start: 2024, end: 2026 }) === false, 'Rejects legacy remaster tagged as 2024 for contemporary prompt');
  assert(isTemporalPermitted({ title: 'Animate (2004 Remaster)', releaseDate: '2024-01-01' }, { start: 2024, end: 2026 }) === false, 'Extracts 2004 vintage year from title and rejects outside 2024-2026');
  assert(isTemporalPermitted({ title: 'Same Blue', releaseDate: '2024-10-01' }, { start: 2024, end: 2026 }) === true, 'Permits original 2024 track');

  // Cross-theme stem collision and homonym guardrail tests
  // Anime stem collisions (anim*)
  assert(isThematicallyPermitted({ title: 'Bat You\'ll Fly', artist: 'Animal Collective' }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects "Animal Collective" prefix collision for anime');
  assert(isThematicallyPermitted({ title: 'Saved', artist: 'Animosity' }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects "Animosity" prefix collision for anime');
  assert(isThematicallyPermitted({ title: 'As Crianças E Os Animais', artist: 'Os Abelhudos' }, 'anime', 'anime') === false, 'Rejects "Animais" prefix collision for anime');
  assert(isThematicallyPermitted({ title: 'Freefall', artist: 'Techno Animal' }, 'anime', 'anime') === false, 'Rejects "Techno Animal" for anime');
  assert(isThematicallyPermitted({ title: 'Dominator Anthem', artist: 'AniMe' }, 'anime', 'anime') === false, 'Rejects DJ AniMe hardcore anthem for anime');
  assert(isThematicallyPermitted({ title: 'Make It Break', artist: 'Anime', providerArtistId: '147485' }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects Deezer Artist ID 147485 (DJ AniMe) for anime');
  assert(isThematicallyPermitted({ title: 'Absolute Power', artist: 'Broken Minds & Anime', album: 'Break Your Mind' }, 'anime', 'anime') === false, 'Rejects DJ Anime collaboration for anime');
  assert(isThematicallyPermitted({ title: 'Party', artist: 'DJ AniMe', album: 'Aftermath' }, 'anime', 'anime') === false, 'Rejects DJ AniMe prefix for anime');
  assert(isThematicallyPermitted({ title: 'Break Your Mind', artist: 'Broken Minds', album: 'Break Your Mind' }, 'anime', 'anime') === false, 'Rejects Masters of Hardcore album Break Your Mind for anime');
  assert(isThematicallyPermitted({ title: 'Same Blue', artist: 'Official髭男dism' }, 'anime', 'anime songs from 2024 to 2026') === true, 'Permits authentic anime theme for Japanese artist');
  assert(isThematicallyPermitted({ title: 'Sousou no Frieren Opening', artist: 'Dimension Anime' }, 'anime', 'anime') === true, 'Permits authentic anime opening release');

  // Storefront leakage (K-Pop in Apple Music JP)
  assert(isThematicallyPermitted({ title: 'I GOT YOU', artist: 'TWICE', selection: { genre: 'K-Pop' } }, 'anime', 'anime songs from 2024 to 2026') === false, 'Rejects K-Pop storefront leakage for anime prompt');

  // Gaming stem collisions
  assert(isThematicallyPermitted({ title: 'How We Do', artist: 'The Game' }, 'gaming', 'video game music') === false, 'Rejects rapper "The Game" for gaming prompt');
  assert(isThematicallyPermitted({ title: 'Un Gamin de Paris', artist: 'Francis Lemarque' }, 'gaming', 'video game music') === false, 'Rejects "Gamin" collision for gaming');

  // Pop-Punk collisions
  assert(isThematicallyPermitted({ title: 'Around the World', artist: 'Daft Punk' }, 'poppunk', 'pop-punk hits') === false, 'Rejects Daft Punk for pop-punk');

  // EDM / Dance collisions
  assert(isThematicallyPermitted({ title: 'We Own The Night', artist: 'Dance Gavin Dance' }, 'edm', 'dance edm') === false, 'Rejects post-hardcore band Dance Gavin Dance for EDM');
  assert(isThematicallyPermitted({ title: 'Private Dancer', artist: 'Tina Turner' }, 'edm', 'dance music') === false, 'Rejects Tina Turner Private Dancer for EDM');

  // Latin collisions
  assert(isThematicallyPermitted({ title: 'Radio Africa', artist: 'Latin Quarter' }, 'latin', 'latin music') === false, 'Rejects British band Latin Quarter for Latin');

  // K-Pop Generation Prompt Parsing
  const newGenPrompt = parsePrompt('new gen kpop');
  assert(
    newGenPrompt.genre === 'kpop' &&
    newGenPrompt.generation === 'new' &&
    newGenPrompt.yearRange?.start === 2020 &&
    newGenPrompt.yearRange?.end === 2026,
    'Parses "new gen kpop" into 2020-2026 year range and kpop genre'
  );

  const thirdGenPrompt = parsePrompt('3rd gen kpop');
  assert(
    thirdGenPrompt.genre === 'kpop' &&
    thirdGenPrompt.generation === '3rd' &&
    thirdGenPrompt.yearRange?.start === 2012 &&
    thirdGenPrompt.yearRange?.end === 2019,
    'Parses "3rd gen kpop" into 2012-2019 year range and kpop genre'
  );

  const kpopVariations = generateThemeVariations('kpop');
  assert(
    !kpopVariations.some(v => v.startsWith('gen ')) &&
    !kpopVariations.includes('kpop hits'),
    'Theme variations for kpop avoid "gen kpop" prefixes and over-broad hit queries'
  );

  // Default shuffle buildQueryPlan uses balanced popularity
  const shufflePlan = buildQueryPlan({ genre: 'all' });
  assert(
    shufflePlan.popularity === 'balanced' && shufflePlan.minFans >= 25000,
    'Shuffle query plan defaults to balanced popularity with active fan thresholds'
  );

  // Foreign Dub & Language Filters
  assert(
    isLanguagePermitted({ title: 'Soda Pop (version française)', artist: 'Saja Boys' }, 'kpop', 'new gen kpop') === false,
    'Rejects foreign dub "(version française)" for K-Pop'
  );
  assert(
    isLanguagePermitted({ title: 'Symphonie à dix-sept parties, RH 64: II. Larghetto', artist: 'François-Xavier Roth' }, 'all') === false,
    'Rejects classical orchestral movements for mainstream crosswords'
  );
  assert(
    isLanguagePermitted({ title: 'Rock a Bye Baby', artist: 'Nursery Rhymes 123' }, 'all') === false,
    'Rejects nursery rhyme compilations'
  );
  assert(
    isLanguagePermitted({ title: 'Telegrama', artist: 'Zeca Baleiro', selection: { genre: 'Pop Latino' } }, 'all') === false,
    'Rejects foreign genre tracks (Pop Latino) for general crosswords'
  );

  // Authenticity & Low-Quality/Workout/Tribute Filter
  assert(
    isAuthenticTrack({ title: 'Like a G6 (Workout Mix 128 BPM)', artist: 'Power Music Workout' }) === false,
    'Rejects Power Music Workout tracks'
  );
  assert(
    isAuthenticTrack({ title: 'NewJeans (8-Bit Computer Game Version)', artist: '8-Bit Arcade' }) === false,
    'Rejects 8-bit arcade tribute tracks'
  );
  assert(
    isAuthenticTrack({ title: 'White Winged Dove', artist: '1981 Rock Classics' }) === false,
    'Rejects generic year compilation brands'
  );
  assert(
    isAuthenticTrack({ title: 'New Jeans (Slowed + Reverb)', artist: 'Lucrativerecords' }) === false,
    'Rejects slowed/reverb modifications'
  );
  assert(
    isAuthenticTrack({ title: 'New Jeans (Instrumental Version)', artist: 'Lewis Hanton' }) === false,
    'Rejects instrumental covers'
  );
  assert(
    isAuthenticTrack({ title: 'Attention', artist: 'NewJeans' }) === true,
    'Permits authentic track release'
  );

  // K-Pop Thematic Guardrails (Rejection of Carrie Underwood, Steven Wilson, Destiny\'s Child)
  assert(
    isThematicallyPermitted({ title: 'People Who Eat Darkness', artist: 'Steven Wilson' }, 'kpop', 'new gen kpop') === false,
    'Rejects Steven Wilson for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Before He Cheats', artist: 'Carrie Underwood' }, 'kpop', 'new gen kpop') === false,
    'Rejects Carrie Underwood for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Cater 2 U', artist: 'Destiny\'s Child' }, 'kpop', 'new gen kpop') === false,
    'Rejects Destiny\'s Child for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Eyes Without a Face', artist: 'Billy Idol', selection: { genre: 'Rock' } }, 'kpop', 'new gen kpop') === false,
    'Rejects Western Rock on iTunes for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'NEW GEN', artist: 'M4rkim' }, 'kpop', 'new gen kpop') === false,
    'Rejects non-Korean artist token collision for K-Pop'
  );
  assert(
    isThematicallyPermitted({ title: 'Liminal Space', artist: 'LE SSERAFIM', selection: { genre: 'K-Pop' } }, 'kpop', 'new gen kpop') === true,
    'Permits authentic K-Pop group LE SSERAFIM'
  );
  assert(
    isThematicallyPermitted({ title: 'CASE 143', artist: 'Stray Kids', selection: { genre: 'K-Pop' } }, 'kpop', 'new gen kpop') === true,
    'Permits authentic K-Pop group Stray Kids'
  );

  // Anime Precision, Authenticity & Homonym Guardrails
  assert(
    DEEZER_GENRE_TAXONOMY.anime.minFans >= 25000,
    'Anime taxonomy enforces minFans >= 25000 to eliminate amateur uploads'
  );
  assert(
    isAuthenticTrack({ title: 'Gurenge (Metal Cover)', artist: 'Little V.' }) === false,
    'Rejects YouTube metal cover artist Little V.'
  );
  assert(
    isAuthenticTrack({ title: 'Unravel', artist: 'Pellek' }) === false,
    'Rejects YouTube rock/metal cover artist Pellek'
  );
  assert(
    isAuthenticTrack({ title: 'IDOL', artist: 'ShiroNeko' }) === false,
    'Rejects fan cover artist ShiroNeko'
  );
  assert(
    isAuthenticTrack({ title: 'Music Box Lullaby', artist: 'Music Box Anime OST' }) === false,
    'Rejects music box BGM cover'
  );
  assert(
    isAuthenticTrack({ title: 'Oshi no Ko (Phonk Remix)', artist: 'Mupp' }) === false,
    'Rejects phonk remix tracks'
  );
  assert(
    isAuthenticTrack({ title: 'IDOL', artist: 'YOASOBI' }) === true,
    'Permits authentic YOASOBI IDOL'
  );
  assert(
    isThematicallyPermitted({ title: "How Far I'll Go", artist: 'Auliʻi Cravalho', album: 'Moana Soundtrack' }, 'anime') === false,
    "Rejects Disney's Moana Western soundtrack for anime"
  );
  assert(
    isThematicallyPermitted({ title: 'Anime Theme', artist: 'Bedroom Artist' }, 'anime') === false,
    "Rejects novelty title matching 'Anime Theme'"
  );
  assert(
    isThematicallyPermitted({ title: "You're So Beautiful", artist: 'Empire Cast' }, 'anime') === false,
    'Rejects Empire Cast American drama for anime'
  );
  assert(
    isThematicallyPermitted({ title: 'IDOL', artist: 'Dizzy DROS' }, 'anime') === false,
    'Rejects Moroccan hip-hop Dizzy DROS for anime'
  );
  assert(
    isThematicallyPermitted({ title: 'Yo sabia', artist: 'Sandoval' }, 'anime') === false,
    'Rejects Latin pop Sandoval for anime'
  );
});
