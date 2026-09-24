import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAnswerKeyword, type LengthBucket } from '../../shared/musicKeywords.ts';
import type { SongCandidate, YearRange } from '../../server/types.ts';

type Track = Partial<SongCandidate>;
import {
  allowedLanguagesForContext,
  isAnimeTrack,
  isAuthenticTrack,
  isJapaneseTrack,
  isLanguagePermitted,
  isTemporalPermitted,
  isThematicallyPermitted,
  resolveReleaseYear,
} from '../../server/policy/selectionPolicy.ts';

// [track, year window, expected, why]
const YEAR_WINDOWS: [track: Track, window: YearRange | null, expected: boolean, why: string][] = [
  [{ releaseDate: '1991-09-24', title: 'Smells Like Teen Spirit', artist: 'Nirvana' }, { start: 1990, end: 1999 }, true, 'release date inside'],
  [{ releaseDate: '2022-03-01', title: 'As It Was', artist: 'Harry Styles' }, { start: 1990, end: 1999 }, false, 'release date outside'],
  [{ releaseDate: '2024-05-01', title: 'Espresso', artist: 'Sabrina Carpenter' }, { start: 2020, end: 2026 }, true, 'recent release'],
  [{ releaseDate: '1984-11-29', title: 'Careless Whisper', artist: 'George Michael' }, { start: 2020, end: 2026 }, false, 'old release'],
  [{ releaseDate: '2022-10-21', title: 'Hotel California (2022 Remaster)', artist: 'Eagles' }, { start: 2020, end: 2026 }, false, 'a remaster date is not the song year'],
  [{ title: 'Live at Budokan (1982)', artist: 'Cheap Trick' }, { start: 1980, end: 1989 }, true, 'a year in the title'],
  [{ title: 'Unknown Track', artist: 'Unknown Artist' }, { start: 1980, end: 1989 }, false, 'unknown year with a window'],
  [{ title: 'No Year' }, null, true, 'unknown year without a window'],
];
for (const [track, window, expected, why] of YEAR_WINDOWS) {
  test(`isTemporalPermitted: ${why} -> ${expected}`, () => {
    assert.equal(isTemporalPermitted(track, window), expected);
  });
}

test('isTemporalPermitted never mutates the track; resolveReleaseYear gives the vintage year', () => {
  const track: Track = { title: 'Dreams (2004 Remaster)', releaseDate: '2018-01-01' };
  assert.equal(isTemporalPermitted(track, { start: 2000, end: 2009 }), true);
  assert.equal(track.releaseYear, undefined);
  assert.equal(resolveReleaseYear(track), 2004);
});

// [track, genre, prompt, options, expected, why]
const LANGUAGE_CASES: [track: Track, genre: string, prompt: string, options: { languages?: string[] }, expected: boolean, why: string][] = [
  [{ title: 'Despacito', artist: 'Luis Fonsi' }, 'all', '', {}, false, 'Spanish in a random puzzle'],
  [{ title: "Je t'aime", artist: 'Lara Fabian' }, 'all', '', {}, false, 'French in a random puzzle'],
  [{ title: 'Atemlos durch die Nacht', artist: 'Helene Fischer' }, 'all', '', {}, false, 'German in a random puzzle'],
  [{ title: "Stayin' Alive", artist: 'Bee Gees' }, 'all', '', {}, true, 'an English hit'],
  [{ title: 'Viva La Vida', artist: 'Coldplay', language: 'en' }, 'pop', '', {}, true, 'the stored catalog language beats stopword heuristics'],
  [{ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'pop', '', {}, false, 'Japanese outside a Japanese theme'],
  [{ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'all', 'japanese city pop', {}, true, 'Japanese in a Japanese theme'],
  [{ title: 'Idol', artist: 'YOASOBI', language: 'ja' }, 'pop', '', { languages: ['ja'] }, true, 'an explicit filter replaces the theme languages'],
  [{ title: 'Levitating', artist: 'Dua Lipa', language: 'en' }, 'pop', '', { languages: ['ja'] }, false, 'an explicit filter excludes other languages'],
  [{ title: 'Dynamite', artist: 'BTS', language: 'ko' }, 'kpop', '', {}, true, 'a Korean act\'s English title in K-pop'],
  [{ title: 'Before He Cheats', artist: 'Carrie Underwood', language: 'en' }, 'kpop', '', {}, false, 'a Western act in K-pop'],
  [{ title: 'Plastic Love', artist: 'Mariya Takeuchi', language: 'ja' }, 'all', '80s Japanese City Pop', {}, true, 'a Japanese act\'s romanized title in city pop'],
  [{ title: 'Kill City', artist: 'Iggy Pop', language: 'en' }, 'all', 'city pop', {}, false, 'a Western act in city pop'],
];
for (const [track, genre, prompt, options, expected, why] of LANGUAGE_CASES) {
  test(`isLanguagePermitted: ${why} -> ${expected}`, () => {
    assert.equal(isLanguagePermitted(track, genre, prompt, options), expected);
  });
}

test('scene prompts use their own language, everything else English', () => {
  assert.deepEqual(allowedLanguagesForContext('kpop'), ['ko']);
  assert.deepEqual(allowedLanguagesForContext('all', 'korean ballads'), ['ko']);
  assert.deepEqual(allowedLanguagesForContext('all', 'anime openings'), ['ja']);
  assert.deepEqual(allowedLanguagesForContext('rock'), ['en']);
});

const LENGTH_BUCKETS: [title: string, artist: string, bucket: LengthBucket, min: number, max: number][] = [
  ['Dancing in the Dark', 'Bruce Springsteen', 'short', 2, 5],
  ['Dancing in the Dark', 'Bruce Springsteen', 'medium', 6, 8],
  ['Blinding Lights', 'The Weeknd', 'long', 9, 14],
];
for (const [title, artist, bucket, min, max] of LENGTH_BUCKETS) {
  test(`a ${bucket} answer from "${title}" has ${min}-${max} letters`, () => {
    const length = extractAnswerKeyword(title, artist, { targetLengthBucket: bucket })?.answer.length;
    assert.ok(length >= min && length <= max, `length ${length}`);
  });
}

const ANIME_CASES: [track: Track, expected: boolean][] = [
  [{ artist: 'FLOW', title: 'Colors (Code Geass Opening Theme)', album: 'FLOW THE BEST' }, true],
  [{ artist: 'Linked Horizon', title: 'Guren no Yumiya', album: 'Attack on Titan OST' }, true],
  [{ artist: 'Tatsuro Yamashita', title: 'Plastic Love', album: 'Big Wave' }, false],
  [{ artist: 'DJ AniMe', title: 'Hardcore Attack', album: 'Single' }, false],
  [{ artist: 'Ben Mazué', title: 'Le coeur nous anime', album: 'Paradis' }, false],
  [{ artist: 'Animal Collective', title: 'My Girls', album: 'Merriweather' }, false],
  [{ artist: 'LISA', title: 'Rockstar', album: 'Alter Ego' }, false],
];
for (const [track, expected] of ANIME_CASES) {
  test(`isAnimeTrack: ${track.artist} - ${track.title} -> ${expected}`, () => {
    assert.equal(isAnimeTrack(track), expected);
  });
}

const JAPANESE_CASES: [track: Track, expected: boolean][] = [
  [{ artist: 'Tatsuro Yamashita', title: 'Ride On Time', language: 'ja' }, true],
  [{ artist: 'Miki Matsubara', title: 'Stay With Me', album: 'Pocket Park' }, true],
  [{ artist: 'The Japanese House', title: 'Saw You In A Dream', language: 'en' }, false],
  [{ artist: 'Aneka', title: 'Japanese Boy', language: 'en' }, false],
];
for (const [track, expected] of JAPANESE_CASES) {
  test(`isJapaneseTrack: ${track.artist} - ${track.title} -> ${expected}`, () => {
    assert.equal(isJapaneseTrack(track), expected);
  });
}

const AUTHENTIC_CASES: [track: Track, expected: boolean][] = [
  [{ artist: 'Fonzi M', title: 'Yumetourou [Guitar Version]' }, false],
  [{ artist: 'Various Artists', title: 'Bohemian Rhapsody (Karaoke Version)' }, false],
  [{ artist: 'Workout Crew', title: 'Levitating (130 BPM Workout Mix)' }, false],
  [{ artist: 'Queen', title: 'Bohemian Rhapsody', album: 'A Night At The Opera' }, true],
];
for (const [track, expected] of AUTHENTIC_CASES) {
  test(`isAuthenticTrack: ${track.artist} - ${track.title} -> ${expected}`, () => {
    assert.equal(isAuthenticTrack(track), expected);
  });
}

// [track, genre, prompt, expected, why]
const THEMATIC_CASES: [track: Track, genre: string, prompt: string, expected: boolean, why: string][] = [
  [{ title: 'Something', artist: 'The Japanese House' }, 'all', 'Japanese City Pop', false, '"The Japanese House" homonym'],
  [{ title: 'Face Melter', artist: 'The Japanese Popstars' }, 'all', 'Japanese City Pop', false, '"The Japanese Popstars" homonym'],
  [{ title: 'Japanese Boy', artist: 'Aneka' }, 'all', 'Japanese City Pop', false, 'novelty title'],
  [{ title: 'Japanese Porn', artist: 'Doctor Flake' }, 'all', 'Japanese City Pop', false, 'novelty title'],
  [{ title: 'Kill City', artist: 'Iggy Pop' }, 'all', 'Japanese City Pop', false, '"City" + "Pop" split across title and artist'],
  [{ title: 'Sparkle', artist: 'Tatsuro Yamashita' }, 'all', 'Japanese City Pop', true, 'real city pop'],
  [{ title: 'Unforgettable', artist: 'French Montana' }, 'all', 'French House', false, '"French Montana" homonym'],
  [{ title: 'One More Time', artist: 'Daft Punk' }, 'all', 'French House', true, 'real French house'],
  [{ title: 'Memories', artist: 'German Brigante' }, 'all', 'German Krautrock', false, '"German Brigante" homonym'],
  [{ title: 'Vitamin C', artist: 'Can' }, 'all', 'German Krautrock', true, 'real krautrock'],
  [{ title: 'In Bloom', artist: 'Nirvana' }, 'all', '90s Grunge', true, 'real grunge'],
  [{ title: "Bat You'll Fly", artist: 'Animal Collective' }, 'anime', 'anime songs from 2024 to 2026', false, '"Animal" prefix'],
  [{ title: 'Saved', artist: 'Animosity' }, 'anime', 'anime songs from 2024 to 2026', false, '"Animosity" prefix'],
  [{ title: 'As Crianças E Os Animais', artist: 'Os Abelhudos' }, 'anime', 'anime', false, '"Animais" prefix'],
  [{ title: 'Freefall', artist: 'Techno Animal' }, 'anime', 'anime', false, '"Techno Animal"'],
  [{ title: 'Dominator Anthem', artist: 'AniMe' }, 'anime', 'anime', false, 'DJ AniMe'],
  [{ title: 'Make It Break', artist: 'Anime', providerArtistId: '147485' }, 'anime', 'anime songs from 2024 to 2026', false, 'Deezer artist 147485 (DJ AniMe)'],
  [{ title: 'Absolute Power', artist: 'Broken Minds & Anime', album: 'Break Your Mind' }, 'anime', 'anime', false, 'a DJ AniMe collaboration'],
  [{ title: 'Party', artist: 'DJ AniMe', album: 'Aftermath' }, 'anime', 'anime', false, '"DJ AniMe"'],
  [{ title: 'Break Your Mind', artist: 'Broken Minds', album: 'Break Your Mind' }, 'anime', 'anime', false, 'a hardcore album'],
  [{ title: 'I GOT YOU', artist: 'TWICE', selection: { genre: 'K-Pop' } }, 'anime', 'anime songs from 2024 to 2026', false, 'K-pop in an anime prompt'],
  [{ title: "How Far I'll Go", artist: 'Auliʻi Cravalho', album: 'Moana Soundtrack' }, 'anime', '', false, 'a Disney soundtrack'],
  [{ title: 'Anime Theme', artist: 'Bedroom Artist' }, 'anime', '', false, 'a novelty title'],
  [{ title: "You're So Beautiful", artist: 'Empire Cast' }, 'anime', '', false, 'a TV drama cast'],
  [{ title: 'IDOL', artist: 'Dizzy DROS' }, 'anime', '', false, 'Moroccan hip-hop'],
  [{ title: 'Yo sabia', artist: 'Sandoval' }, 'anime', '', false, 'Latin pop'],
  [{ title: 'Same Blue', artist: 'Official髭男dism' }, 'anime', 'anime songs from 2024 to 2026', true, 'a real anime theme'],
  [{ title: 'Sousou no Frieren Opening', artist: 'Dimension Anime' }, 'anime', 'anime', true, 'a real anime opening'],
  [{ title: 'How We Do', artist: 'The Game' }, 'gaming', 'video game music', false, 'the rapper The Game'],
  [{ title: 'Un Gamin de Paris', artist: 'Francis Lemarque' }, 'gaming', 'video game music', false, '"Gamin"'],
  [{ title: 'Around the World', artist: 'Daft Punk' }, 'poppunk', 'pop-punk hits', false, 'Daft Punk is not pop-punk'],
  [{ title: 'We Own The Night', artist: 'Dance Gavin Dance' }, 'edm', 'dance edm', false, 'a post-hardcore band'],
  [{ title: 'Private Dancer', artist: 'Tina Turner' }, 'edm', 'dance music', false, '"Dancer"'],
  [{ title: 'Liminal Space', artist: 'LE SSERAFIM', selection: { genre: 'K-Pop' } }, 'kpop', 'new gen kpop', true, 'a real K-pop group'],
  [{ title: 'CASE 143', artist: 'Stray Kids', selection: { genre: 'K-Pop' } }, 'kpop', 'new gen kpop', true, 'a real K-pop group'],
];
for (const [track, genre, prompt, expected, why] of THEMATIC_CASES) {
  test(`isThematicallyPermitted (${genre}/${prompt || '-'}): ${track.artist} - ${track.title}, ${why} -> ${expected}`, () => {
    assert.equal(isThematicallyPermitted(track, genre, prompt), expected);
  });
}

// Live candidates carry no stored language: the heuristics decide. [track, genre, prompt, expected, why]
const LIVE_LANGUAGE_CASES: [track: Track, genre: string, prompt: string, expected: boolean, why: string][] = [
  [{ title: 'Blinding Lights', artist: 'The Weeknd' }, 'pop', '', true, 'English pop'],
  [{ title: 'Amor de Mi Vida', artist: 'Artista' }, 'pop', '', false, 'Spanish in English pop'],
  [{ title: '真夜中のドア / Stay With Me', artist: '松原みき' }, 'all', 'Japanese City Pop', true, 'kanji and kana in city pop'],
  [{ title: 'Soda Pop (version française)', artist: 'Saja Boys' }, 'kpop', 'new gen kpop', false, 'a French dub'],
  [{ title: 'Symphonie à dix-sept parties, RH 64: II. Larghetto', artist: 'François-Xavier Roth' }, 'all', '', false, 'a classical movement'],
  [{ title: 'Rock a Bye Baby', artist: 'Nursery Rhymes 123' }, 'all', '', false, 'a nursery rhyme'],
  [{ title: 'Telegrama', artist: 'Zeca Baleiro', selection: { genre: 'Pop Latino' } }, 'all', '', false, 'a foreign provider genre'],
  [{ title: 'Die With A Smile', artist: 'Lady Gaga, Bruno Mars' }, 'all', '', true, '"die" is English too'],
  [{ title: 'Son of a Preacher Man', artist: 'Dusty Springfield' }, 'all', '', true, '"son" is English too'],
  [{ title: 'Don’t Start Now', artist: 'Dua Lipa' }, 'all', '', true, 'a typographic apostrophe'],
  [{ title: 'Despacito', artist: 'Luis Fonsi' }, 'all', '', false, 'a one-word Spanish title'],
  [{ title: 'La Bamba', artist: 'Ritchie Valens' }, 'all', '', false, 'a two-word Spanish title'],
];
for (const [track, genre, prompt, expected, why] of LIVE_LANGUAGE_CASES) {
  test(`isLanguagePermitted (live): ${why} -> ${expected}`, () => {
    assert.equal(isLanguagePermitted(track, genre, prompt), expected);
  });
}

const MORE_AUTHENTIC_CASES: [track: Track, expected: boolean][] = [
  [{ title: 'Like a G6 (Workout Mix 128 BPM)', artist: 'Power Music Workout' }, false],
  [{ title: 'NewJeans (8-Bit Computer Game Version)', artist: '8-Bit Arcade' }, false],
  [{ title: 'White Winged Dove', artist: '1981 Rock Classics' }, false],
  [{ title: 'New Jeans (Slowed + Reverb)', artist: 'Lucrativerecords' }, false],
  [{ title: 'New Jeans (Instrumental Version)', artist: 'Lewis Hanton' }, false],
  [{ title: 'Gurenge (Metal Cover)', artist: 'Little V.' }, false],
  [{ title: 'Unravel', artist: 'Pellek' }, false],
  [{ title: 'IDOL', artist: 'ShiroNeko' }, false],
  [{ title: 'Music Box Lullaby', artist: 'Music Box Anime OST' }, false],
  [{ title: 'Oshi no Ko (Phonk Remix)', artist: 'Mupp' }, false],
  [{ title: 'Attention', artist: 'NewJeans' }, true],
  [{ title: 'IDOL', artist: 'YOASOBI' }, true],
];
for (const [track, expected] of MORE_AUTHENTIC_CASES) {
  test(`isAuthenticTrack: ${track.artist} - ${track.title} -> ${expected}`, () => {
    assert.equal(isAuthenticTrack(track), expected);
  });
}

// [track, year window, expected]
const MORE_YEAR_WINDOWS: [track: Track, window: YearRange | null, expected: boolean][] = [
  [{ releaseDate: '2022-04-06T00:00:00Z' }, { start: 2020, end: 2026 }, true],
  [{ releaseDate: '2019-12-31T00:00:00Z' }, { start: 2020, end: 2026 }, false],
  [{ releaseDate: '2027-01-01T00:00:00Z' }, { start: 2020, end: 2026 }, false],
  [{ releaseDate: '1993-09-21T00:00:00Z' }, { end: 1993 }, true],
  [{ releaseDate: '1994-03-08T00:00:00Z' }, { end: 1993 }, false],
  [{ title: 'Saved (2024 Remaster)', releaseDate: '2024-01-01' }, { start: 2024, end: 2026 }, false],
  [{ title: 'Animate (2004 Remaster)', releaseDate: '2024-01-01' }, { start: 2024, end: 2026 }, false],
  [{ title: 'Same Blue', releaseDate: '2024-10-01' }, { start: 2024, end: 2026 }, true],
];
for (const [track, window, expected] of MORE_YEAR_WINDOWS) {
  test(`isTemporalPermitted(${track.title || track.releaseDate}, ${JSON.stringify(window)}) -> ${expected}`, () => {
    assert.equal(isTemporalPermitted(track, window), expected);
  });
}
