/**
 * Song language classification for the catalog admission policy (en / ja / ko).
 *
 * Signals, strongest first:
 *   1. Script: hangul -> ko, kana -> ja, Han-only -> ja/ko with a JP/KR ISRC or artist, else zh.
 *   2. Artist language: an artist whose catalog is Japanese/Korean (by script or ISRC registrant,
 *      or a K-pop/J-pop scene genre backed by evidence) keeps romanized/English-titled songs in
 *      ja/ko. Otherwise voted over all of the artist's titles and album names; a narrow lead of
 *      another language counts when the artist's ISRC countries or a genre back it.
 *   3. Title language from the ELD n-gram detector (short-text friendly), used when the artist is
 *      unknown, the title is long enough to outweigh the artist vote, or its ISRC comes from a
 *      country of the title's language.
 * Artist *names* are never run through the text detector ("King Von" is not German).
 */
import { eld } from 'eld/medium';
import { ASIAN_MUSIC, SCENE_GENRES } from '../../shared/themes.ts';

export interface TitleDetection {
  language: string | null;
  reliable: boolean;
  words: number;
  margin: number;
}

export interface TrackLanguageInput {
  title?: string;
  artist?: string;
  isrc?: string | null;
  artistLanguage?: string | null;
}

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-䶿一-鿿]/;
const OTHER_SCRIPTS: [string, RegExp][] = [
  ['ru', /[Ѐ-ӿ]/],
  ['ar', /[؀-ۿ]/],
  ['he', /[֐-׿]/],
  ['el', /[Ͱ-Ͽ]/],
  ['th', /[฀-๿]/],
  ['hi', /[ऀ-ॿ]/],
];

// Title words that describe the release rather than the song's language
const DECORATION = /\s*[([（【][^)\]）】]*[)\]）】]/g;
// Words of 2+ letters: dotted acronyms ("P.I.M.P.", "B.Y.O.B.") carry no language evidence
const TITLE_WORD = /[\p{L}\p{N}]{2,}/gu;
const LETTER = /\p{L}/gu;

// A non-English verdict must beat the English n-gram score by a margin that grows as the text
// shrinks. Short English titles often score a hair above English in another language ("Moth To
// A Flame" sq 0.702 vs en 0.698) and two words can be far off ("Cutie Pie" lv +0.67), while
// real foreign titles lead clearly ("Te Quería Ver" es +0.81). Deleting is irreversible, so
// doubtful titles stay English.
export function requiredMargin(words: number): number {
  if (words >= 4) return 0.15;
  return words === 3 ? 0.2 : 0.3;
}

// Two words are only enough for languages ELD separates from English on catalog samples
const SHORT_TEXT_LANGUAGES = new Set(['es', 'pt', 'fr', 'de', 'it']);

// An artist is voted non-English only on this much title text, with this lead over English
const ARTIST_MIN_WORDS = 6;
const ARTIST_MARGIN = 0.15;
// With ISRC or genre evidence for the leading language, any lead on this much text is enough
const EVIDENCE_MIN_WORDS = 3;

/**
 * ISRC registrant countries that release mostly in one language. Bilingual countries (CA, CH, BE)
 * are left out, and registrant codes of distributors (QM, QZ, TC, …) appear in no list.
 */
const LANGUAGE_REGISTRANTS: Readonly<Record<string, readonly string[]>> = {
  en: ['US', 'GB', 'UK', 'IE', 'AU', 'NZ'],
  fr: ['FR', 'LU', 'MC', 'CI', 'SN', 'CM', 'CD', 'ML', 'HT', 'MA', 'DZ', 'TN'],
  es: ['ES', 'MX', 'CO', 'AR', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR'],
  ca: ['ES', 'AD'],
  pt: ['BR', 'PT', 'AO', 'MZ'],
  it: ['IT', 'SM'],
  de: ['DE', 'AT'],
  nl: ['NL'],
  sv: ['SE'],
  da: ['DK'],
  no: ['NO'],
  fi: ['FI'],
  pl: ['PL'],
  cs: ['CZ'],
  hu: ['HU'],
  hr: ['HR'],
  ro: ['RO'],
  tr: ['TR'],
  el: ['GR'],
};
const COUNTRY_REGISTRANTS = new Set(Object.values(LANGUAGE_REGISTRANTS).flat());

// Deezer genres that only one language's music carries
const LANGUAGE_GENRES: Readonly<Record<string, readonly string[]>> = {
  es: ['Latin Music', 'Latin', 'Salsa', 'Cumbia', 'Reggaeton', 'Traditional Mexicano', 'Bachata', 'Bolero', 'Norteño', 'Corridos', 'Ranchera', 'Regional Mexican'],
  pt: ['Brazilian Music', 'Bossa Nova'],
};

function isRegisteredIn(language: string, registrant: string | null): boolean {
  return Boolean(registrant) && Boolean(LANGUAGE_REGISTRANTS[language]?.includes(registrant!));
}

/** Whether most of the artist's country-coded ISRCs, or one of its genres, point to `language`. */
function hasLanguageEvidence(language: string, registrants: string[], genres: readonly string[]): boolean {
  if (LANGUAGE_GENRES[language]?.some(genre => genres.includes(genre))) return true;
  const countryCoded = registrants.filter(r => COUNTRY_REGISTRANTS.has(r));
  const own = countryCoded.filter(r => isRegisteredIn(language, r)).length;
  return own > 0 && own * 2 >= countryCoded.length;
}

/** Title text used for language detection: bracketed credits/versions removed. */
export function languageText(title: string | null = ''): string {
  return String(title || '').replace(DECORATION, ' ').replace(/\s[-–—]\s.*$/, ' ').trim();
}

function isrcRegistrant(isrc: unknown): string | null {
  return typeof isrc === 'string' && /^[A-Z]{2}/i.test(isrc.trim()) ? isrc.trim().slice(0, 2).toUpperCase() : null;
}

/**
 * Script-level language of a string, or null for Latin/neutral text.
 * Any hangul/kana/Han character decides; other scripts must be at least half of the letters,
 * so a stylized letter ("KoЯn", "DISCIPLΞS") doesn't make a name Russian or Greek.
 * Returns 'ko', 'ja', 'han' (Han-only), another ISO 639-1 code, or null.
 */
export function scriptLanguage(text = ''): string | null {
  if (HANGUL.test(text)) return 'ko';
  if (KANA.test(text)) return 'ja';
  if (HAN.test(text)) return 'han';
  const letters = text.match(LETTER)?.length || 0;
  for (const [code, pattern] of OTHER_SCRIPTS) {
    if (!pattern.test(text)) continue;
    const inScript = text.match(new RegExp(pattern.source, 'g'))?.length || 0;
    if (inScript * 2 >= letters) return code;
  }
  return null;
}

/**
 * Language of a (Latin-script) title from the n-gram detector.
 * `margin` is how far the verdict's score leads English (0 when the verdict is English).
 */
export function detectTitleLanguage(title = ''): TitleDetection {
  const text = languageText(title);
  const words = text.match(TITLE_WORD)?.length || 0;
  if (words === 0) return { language: null, reliable: false, words, margin: 0 };
  const result = eld.detect(text);
  const language = result.language || null;
  let margin = 0;
  if (language && language !== 'en') {
    const scores = result.getScores();
    margin = (scores[language] || 0) - (scores.en || 0);
  }
  return { language, reliable: Boolean(language) && result.isReliable(), words, margin };
}

/** Whether a title detection is strong enough to call the title non-English. */
export function isClearlyForeign(detected: TitleDetection | null | undefined): boolean {
  if (!detected?.reliable || !detected.language || detected.language === 'en') return false;
  if (detected.words < 2) return false;
  if (detected.words === 2 && !SHORT_TEXT_LANGUAGES.has(detected.language)) return false;
  return detected.margin >= requiredMargin(detected.words);
}

/**
 * Korean and Japanese acts often have romanized titles and US-registered ISRCs, which the script
 * and ISRC vote misses. A scene genre (from a theme playlist) places them when Deezer files the
 * artist under Asian Music or the ISRCs show the country: any KR registration, or a fifth JP ones
 * (Japan editions of Western records carry JP codes too). K-Pop comes first: K-pop acts also
 * release in Japan and appear on anime playlists. A confirmed scene weighs like an ISRC majority,
 * so a K-pop group whose catalog is mostly Japanese live recordings stays Korean.
 */
const SCENES = [
  { language: 'ko', genres: SCENE_GENRES.ko, country: 'KR', minShare: 0 },
  { language: 'ja', genres: SCENE_GENRES.ja, country: 'JP', minShare: 0.2 },
];

function sceneLanguage(genres: readonly string[], registrants: string[]): string | null {
  const asianMusic = genres.includes(ASIAN_MUSIC);
  for (const scene of SCENES) {
    if (!scene.genres.some(genre => genres.includes(genre))) continue;
    const fromCountry = registrants.filter(r => r === scene.country).length;
    if (asianMusic || (fromCountry > 0 && fromCountry / registrants.length >= scene.minShare)) return scene.language;
  }
  return null;
}

/** Votes an artist's language over its catalog titles, album names, ISRC registrants and genres. */
export function classifyArtistLanguage(
  { titles = [], albums = [], isrcs = [], name = '', genres = [] }: {
    titles?: string[];
    albums?: (string | null)[];
    isrcs?: (string | null)[];
    name?: string;
    genres?: readonly string[];
  } = {},
): { language: string | null; basis: string } {
  const cleaned = titles.map(languageText).filter(Boolean);
  const total = cleaned.length;

  let hangul = 0;
  let kana = 0;
  let hanOnly = 0;
  const otherScripts = new Map<string, number>();
  for (const text of cleaned) {
    const script = scriptLanguage(text);
    if (script === 'ko') hangul++;
    else if (script === 'ja') kana++;
    else if (script === 'han') hanOnly++;
    else if (script) otherScripts.set(script, (otherScripts.get(script) || 0) + 1);
  }

  const registrants = isrcs.map(isrcRegistrant).filter((r): r is string => Boolean(r));
  const jp = registrants.filter(r => r === 'JP').length;
  const kr = registrants.filter(r => r === 'KR').length;
  const nameScript = scriptLanguage(name);

  const enough = (count: number) => count >= 2 || (total > 0 && count / total >= 0.1);
  const scene = sceneLanguage(genres, registrants);
  const koScore = hangul + (registrants.length >= 2 && kr / registrants.length >= 0.5 ? total : 0) + (nameScript === 'ko' ? total : 0) + (scene === 'ko' ? total : 0);
  const jaScore = kana + (registrants.length >= 2 && jp / registrants.length >= 0.5 ? total : 0) + (nameScript === 'ja' ? total : 0) + (scene === 'ja' ? total : 0);
  if ((enough(hangul) || koScore > hangul) && koScore >= jaScore && koScore > 0) return { language: 'ko', basis: 'script/isrc' };
  if ((enough(kana) || jaScore > kana) && jaScore > 0) return { language: 'ja', basis: 'script/isrc' };
  if (total > 0 && hanOnly / total >= 0.5) return { language: 'zh', basis: 'script' };
  for (const [code, count] of otherScripts) {
    if (count / Math.max(total, 1) >= 0.5) return { language: code, basis: 'script' };
  }

  const latin = cleaned.filter(text => !scriptLanguage(text));
  // Album names add text, except the ones named after a title (singles)
  const titleKeys = new Set(latin.map(text => text.toLowerCase()));
  const albumTexts = [...new Set(albums.map(album => languageText(album)))]
    .filter(text => text && !scriptLanguage(text) && !titleKeys.has(text.toLowerCase()));
  const text = [...latin, ...albumTexts];
  const words = text.join(' ').match(TITLE_WORD)?.length || 0;
  const enoughText = latin.length >= 3 && words >= ARTIST_MIN_WORDS;
  const insufficient = { language: null, basis: 'insufficient' };
  if (!enoughText && words < EVIDENCE_MIN_WORDS) return insufficient;
  const result = eld.detect(text.join('. '));
  if (!result.language) return { language: null, basis: 'undetected' };
  if (result.language === 'en') return enoughText ? { language: 'en', basis: 'text' } : insufficient;
  // A few short English titles can tip the detector ("Brown Sugar. The Door. Playa Playa" -> tl),
  // so a narrow lead needs the artist's ISRC countries or a genre to agree
  const scores = result.getScores();
  const margin = (scores[result.language] || 0) - (scores.en || 0);
  if (enoughText && margin >= ARTIST_MARGIN) return { language: result.language, basis: 'text' };
  if (margin > 0 && hasLanguageEvidence(result.language, registrants, genres)) return { language: result.language, basis: 'text+evidence' };
  return enoughText ? { language: 'en', basis: 'text-close' } : insufficient;
}

/** Final language of one track, as an ISO 639-1 code. */
export function resolveTrackLanguage(
  { title = '', artist = '', isrc = null, artistLanguage = null }: TrackLanguageInput = {},
): string {
  const registrant = isrcRegistrant(isrc);
  const titleScript = scriptLanguage(title);
  const nameScript = scriptLanguage(artist);

  // 1. Script
  const script = titleScript || (nameScript && nameScript !== 'han' ? nameScript : null) || (nameScript === 'han' ? 'han' : null);
  if (script === 'ko' || script === 'ja') return script;
  if (script === 'han') {
    if (registrant === 'JP' || artistLanguage === 'ja') return 'ja';
    if (registrant === 'KR' || artistLanguage === 'ko') return 'ko';
    return 'zh';
  }
  if (script) return script;

  // 2. Japanese/Korean artists keep romanized and English-titled songs
  if (artistLanguage === 'ja' || artistLanguage === 'ko') return artistLanguage;
  if (!artistLanguage && registrant === 'JP') return 'ja';
  if (!artistLanguage && registrant === 'KR') return 'ko';

  // 3. Title text vs. artist vote
  // Single words are too short for n-gram detection ("PENTHOUSE" reads as Romanian), so a
  // non-English verdict needs 2+ words without an artist vote, and 4+ words to overrule one.
  // Either way it must clearly beat English (isClearlyForeign).
  const detected = detectTitleLanguage(title);
  if (detected.reliable && detected.language && detected.language !== 'en') {
    if (artistLanguage === detected.language) return detected.language;
    if (!artistLanguage && isClearlyForeign(detected)) return detected.language;
    if (artistLanguage && detected.words >= 4 && isClearlyForeign(detected)) return detected.language;
    // Shorter titles overrule an English vote when the ISRC comes from a country of that language
    if (artistLanguage === 'en' && isClearlyForeign(detected) && isRegisteredIn(detected.language, registrant)) return detected.language;
  }
  return artistLanguage || 'en';
}
