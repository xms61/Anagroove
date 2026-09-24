/**
 * Song themes: the single source for the generator and multiplayer theme lists, prompt -> genre
 * mapping, the crawler's playlist seeds and the coverage report.
 *
 *   genres     values in artists.genres_json that belong to the theme (any one matches)
 *   languages  song languages the theme allows (the catalog holds en/ja/ko only). The K-pop,
 *              J-pop and anime themes allow only their own language: a Korean or Japanese act's
 *              English-titled songs carry the artist's language.
 *   seeds      Deezer playlist searches the crawler harvests for the theme
 */
export type SongLanguage = 'en' | 'ja' | 'ko';

export interface Theme {
  id: string;
  name: string;
  icon: string;
  description: string;
  genres: readonly string[];
  languages: readonly SongLanguage[];
  seeds: readonly string[];
}

const ROCK = ['Rock', 'Classic Rock', 'Alternative Rock', 'Hard Rock', 'Indie Rock', 'Grunge', 'Rock & Roll/Rockabilly'];
const HIP_HOP = ['Rap/Hip Hop', 'Hip-Hop', 'Hip Hop'];
const ELECTRONIC = ['Dance', 'Electro', 'Electronic', 'EDM', 'Techno/House', 'Trance', 'French House'];
const SOUNDTRACK = ['Films/Games', 'Soundtrack'];

/** Deezer's genre for East Asian pop, stored from the artist's album by `enrichArtists`. */
export const ASIAN_MUSIC = 'Asian Music';

const JAPANESE_SCENE = ['Japanese', 'J-Pop', 'City Pop'];
const JAPANESE = [...JAPANESE_SCENE, ASIAN_MUSIC];

/**
 * Genres that place an artist in the Korean or Japanese scene. Theme playlist seeds add them to
 * every artist on the playlist, Western acts included, so the artist language vote only trusts
 * them with other evidence, and `catalog:recompute` removes them from artists voted another language.
 */
export const SCENE_GENRES: Readonly<Record<'ko' | 'ja', readonly string[]>> = Object.freeze({
  ko: ['K-Pop'],
  ja: [...JAPANESE_SCENE, 'Anime'],
});

export const THEMES: readonly Theme[] = Object.freeze([
  { id: 'all', name: 'Mixed & Eclectic', icon: '🎲', description: 'Fresh cross-genre selection', genres: [], languages: ['en'],
    seeds: ['all time hits', 'billboard hot 100', 'top usa', 'top uk', 'party classics', 'road trip anthems', 'acoustic chill'] },
  { id: 'pop', name: 'Global Pop Hits', icon: '✨', description: 'Chart-topping pop icons', genres: ['Pop', 'Indie Pop', 'International Pop'], languages: ['en'],
    seeds: ['pop essentials', '2000s pop', '2010s hits', '80s synthpop', 'disco fever'] },
  { id: 'rock', name: 'Rock & Retro Legends', icon: '🎸', description: 'Classic & modern rock riffs', genres: ROCK, languages: ['en'],
    seeds: ['rock classics', '60s rock', '70s rock', '90s alternative', 'post punk essentials'] },
  { id: 'indie', name: 'Indie & Alternative', icon: '🌙', description: 'Indie rock, dream pop & alt', genres: ['Alternative', 'Indie Rock', 'Indie Pop', 'Alternative Rock'], languages: ['en'],
    seeds: ['indie rock gems', 'shoegaze dream pop', 'indie pop', 'alternative classics'] },
  { id: 'hiphop', name: 'Hip-Hop & Rap Giants', icon: '🎤', description: 'Beats, bars & rap titans', genres: HIP_HOP, languages: ['en'],
    seeds: ['hip hop golden age', '90s hip hop', '2000s rap', 'modern hip hop'] },
  { id: 'rnb', name: 'R&B, Soul & Funk', icon: '💜', description: 'Motown, neo soul & funk grooves', genres: ['R&B', 'Contemporary R&B', 'Soul', 'Soul & Funk', 'Funk', 'Motown', 'Disco'], languages: ['en'],
    seeds: ['classic r&b', 'motown essentials', 'neo soul', 'funk & soul classics'] },
  { id: 'edm', name: 'EDM & Dance Anthems', icon: '🎧', description: 'Club bangers & electronic', genres: ELECTRONIC, languages: ['en'],
    seeds: ['electronic journey', 'classic house', 'trance anthems', 'techno club'] },
  { id: 'metal', name: 'Metal & Heavy', icon: '🤘', description: 'Riffs, shreds & anthems', genres: ['Metal', 'Heavy Metal', 'Nu Metal', 'Hard Rock'], languages: ['en'],
    seeds: ['metal anthems', 'heavy metal classics', 'nu metal'] },
  { id: 'poppunk', name: '2000s Pop-Punk & Emo', icon: '🖤', description: 'Nostalgic punk & emo hits', genres: ['Punk', 'Pop Punk', 'Emo'], languages: ['en'],
    seeds: ['pop punk anthems', 'emo classics', '2000s pop punk'] },
  { id: 'country', name: 'Country Roads', icon: '🤠', description: 'Nashville classics & modern country', genres: ['Country'], languages: ['en'],
    seeds: ['classic country', 'modern country hits'] },
  { id: 'jazz', name: 'Jazz & Blues', icon: '🎷', description: 'Standards, swing & the blues', genres: ['Jazz', 'Blues'], languages: ['en'],
    seeds: ['jazz masters', 'blues legends', 'jazz standards'] },
  { id: 'kpop', name: 'K-Pop Universe', icon: '🌸', description: 'Korean pop & idol anthems', genres: SCENE_GENRES.ko, languages: ['ko'],
    seeds: ['kpop essentials', 'k-pop hits', 'korean r&b', 'k-pop girl groups', 'k-pop boy groups'] },
  { id: 'jpop', name: 'J-Pop & City Pop', icon: '🗼', description: 'Tokyo pop, city pop & J-rock', genres: JAPANESE, languages: ['ja'],
    seeds: ['j-pop hits', 'japanese city pop', 'city pop vibes', 'j-rock anthems'] },
  { id: 'anime', name: 'Anime & J-Rock', icon: '⚔️', description: 'Anime openings & J-Rock', genres: ['Anime'], languages: ['ja'],
    seeds: ['anime openings', 'anime songs'] },
  { id: 'gaming', name: 'Video Game OSTs', icon: '🎮', description: 'Iconic game soundtracks', genres: SOUNDTRACK, languages: ['en'],
    seeds: ['video game music', 'gaming soundtracks'] },
  { id: 'cinematic', name: 'Cinematic Movie OSTs', icon: '🎬', description: 'Epic film & movie scores', genres: SOUNDTRACK, languages: ['en'],
    seeds: ['soundtrack masterpieces', 'movie soundtracks'] },
]);

const THEMES_BY_ID = new Map(THEMES.map(theme => [theme.id, theme]));
const genresOf = (id: string): readonly string[] => THEMES_BY_ID.get(id)?.genres ?? [];

/** The theme with this id, or undefined. `mixed` is an old name for `all`. */
export function themeById(id: string): Theme | undefined {
  return THEMES_BY_ID.get(id === 'mixed' ? 'all' : id);
}

/**
 * Words in a free-text genre or prompt -> genre clusters, most specific first. A matched
 * phrase is removed before the next rule runs, so "city pop" never also counts as "pop".
 */
const PROMPT_GENRES: [RegExp, readonly string[]][] = [
  [/\bcity\s*pop\b/, ['City Pop']],
  [/\bk-?pop\b|\bkorean\b/, genresOf('kpop')],
  [/\bj-?pop\b|\bj-?rock\b|\bjapanese\b/, JAPANESE],
  [/\banime\b/, genresOf('anime')],
  [/\bsynth[\s-]?pop\b/, ['Electronic', 'Pop']],
  [/\bpop[\s-]?punk\b|\bemo\b/, genresOf('poppunk')],
  [/\bfrench\s+(house|touch)\b/, ['French House']],
  [/\bclassic\s+rock\b/, ['Classic Rock']],
  [/\bgrunge\b/, ['Grunge']],
  [/\bpunk\b/, ['Punk']],
  [/\b(nu[\s-]?)?metal\b/, genresOf('metal')],
  [/\bindie\b|\balternative\b/, genresOf('indie')],
  [/\brock\b/, ROCK],
  [/\bmotown\b/, ['Motown']],
  [/\bsoul\b/, ['Soul', 'Soul & Funk']],
  [/\bfunk\b/, ['Funk', 'Soul & Funk']],
  [/\bdisco\b/, ['Disco']],
  [/\bhip[\s-]?hop\b|\brap\b/, HIP_HOP],
  [/\br&b\b|\brnb\b/, ['R&B', 'Contemporary R&B']],
  [/\bedm\b|\bdance\b|\belectronic\b|\belectro\b|\bhouse\b|\btechno\b|\btrance\b/, ELECTRONIC],
  [/\breggae\b|\bska\b|\bdancehall\b/, ['Reggae', 'Dancehall/Ragga']],
  [/\bcountry\b/, genresOf('country')],
  [/\bjazz\b/, ['Jazz']],
  [/\bblues\b/, ['Blues']],
  [/\bfolk\b/, ['Folk', 'Singer & Songwriter']],
  [/\bsoundtracks?\b|\bost\b|\bfilm\s+scores?\b|\bmovies?\b|\bvideo\s*games?\b|\bgaming\b/, SOUNDTRACK],
  [/\bpop\b/, genresOf('pop')],
];

/** Genre clusters for a theme id, or for the words of a free-text genre and prompt. */
export function genresForPrompt(genre = '', prompt = ''): string[] {
  const theme = themeById(genre);
  if (theme && theme.id !== 'all') return [...theme.genres];

  let text = `${genre} ${prompt}`.toLowerCase();
  const genres = new Set<string>();
  for (const [pattern, clusters] of PROMPT_GENRES) {
    if (!pattern.test(text)) continue;
    clusters.forEach(g => genres.add(g));
    text = text.replace(new RegExp(pattern.source, 'g'), ' ');
  }
  return [...genres];
}
