/**
 * Song language classification for the catalog admission policy (en / ja / ko).
 *
 * Signals, strongest first:
 *   1. Script: hangul -> ko, kana -> ja, Han-only -> ja/ko with a JP/KR ISRC or artist, else zh.
 *   2. Artist language: an artist whose catalog is Japanese/Korean (by script or ISRC registrant)
 *      keeps romanized/English-titled songs in ja/ko. Voted over all of the artist's titles.
 *   3. Title language from the ELD n-gram detector (short-text friendly), used when the artist is
 *      unknown or the title is long enough to outweigh the artist vote.
 * Artist *names* are never run through the text detector ("King Von" is not German).
 */
import { eld } from 'eld/medium';

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-䶿一-鿿]/;
const OTHER_SCRIPTS = [
  ['ru', /[Ѐ-ӿ]/],
  ['ar', /[؀-ۿ]/],
  ['he', /[֐-׿]/],
  ['el', /[Ͱ-Ͽ]/],
  ['th', /[฀-๿]/],
  ['hi', /[ऀ-ॿ]/],
];

// Title words that describe the release rather than the song's language
const DECORATION = /\s*[([（【][^)\]）】]*[)\]）】]/g;
const TITLE_WORD = /[\p{L}\p{N}]+/gu;

/** Title text used for language detection: bracketed credits/versions removed. */
export function languageText(title = '') {
  return String(title || '').replace(DECORATION, ' ').replace(/\s[-–—]\s.*$/, ' ').trim();
}

function isrcRegistrant(isrc) {
  return typeof isrc === 'string' && /^[A-Z]{2}/i.test(isrc.trim()) ? isrc.trim().slice(0, 2).toUpperCase() : null;
}

/**
 * Script-level language of a string, or null for Latin/neutral text.
 * @returns {'ko'|'ja'|'han'|string|null}
 */
export function scriptLanguage(text = '') {
  if (HANGUL.test(text)) return 'ko';
  if (KANA.test(text)) return 'ja';
  if (HAN.test(text)) return 'han';
  for (const [code, pattern] of OTHER_SCRIPTS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/**
 * Language of a (Latin-script) title from the n-gram detector.
 * @returns {{ language: string|null, reliable: boolean, words: number }}
 */
export function detectTitleLanguage(title = '') {
  const text = languageText(title);
  const words = text.match(TITLE_WORD)?.length || 0;
  if (words === 0) return { language: null, reliable: false, words };
  const result = eld.detect(text);
  const language = result.language || null;
  return { language, reliable: Boolean(language) && result.isReliable(), words };
}

/**
 * Votes an artist's language over its catalog titles and ISRC registrants.
 * @param {{ titles?: string[], isrcs?: (string|null)[], name?: string }} input
 * @returns {{ language: string|null, basis: string }}
 */
export function classifyArtistLanguage({ titles = [], isrcs = [], name = '' } = {}) {
  const cleaned = titles.map(languageText).filter(Boolean);
  const total = cleaned.length;

  let hangul = 0;
  let kana = 0;
  let hanOnly = 0;
  const otherScripts = new Map();
  for (const text of cleaned) {
    const script = scriptLanguage(text);
    if (script === 'ko') hangul++;
    else if (script === 'ja') kana++;
    else if (script === 'han') hanOnly++;
    else if (script) otherScripts.set(script, (otherScripts.get(script) || 0) + 1);
  }

  const registrants = isrcs.map(isrcRegistrant).filter(Boolean);
  const jp = registrants.filter(r => r === 'JP').length;
  const kr = registrants.filter(r => r === 'KR').length;
  const nameScript = scriptLanguage(name);

  const enough = (count) => count >= 2 || (total > 0 && count / total >= 0.1);
  const koScore = hangul + (registrants.length >= 2 && kr / registrants.length >= 0.5 ? total : 0) + (nameScript === 'ko' ? total : 0);
  const jaScore = kana + (registrants.length >= 2 && jp / registrants.length >= 0.5 ? total : 0) + (nameScript === 'ja' ? total : 0);
  if ((enough(hangul) || koScore > hangul) && koScore >= jaScore && koScore > 0) return { language: 'ko', basis: 'script/isrc' };
  if ((enough(kana) || jaScore > kana) && jaScore > 0) return { language: 'ja', basis: 'script/isrc' };
  if (total > 0 && hanOnly / total >= 0.5) return { language: 'zh', basis: 'script' };
  for (const [code, count] of otherScripts) {
    if (count / Math.max(total, 1) >= 0.5) return { language: code, basis: 'script' };
  }

  const latin = cleaned.filter(text => !scriptLanguage(text));
  if (latin.length < 3) return { language: null, basis: 'insufficient' };
  const result = eld.detect(latin.join('. '));
  return result.language ? { language: result.language, basis: 'text' } : { language: null, basis: 'undetected' };
}

/**
 * Final language of one track.
 * @param {{ title: string, artist?: string, isrc?: string|null, artistLanguage?: string|null }} input
 * @returns {string} ISO 639-1 code
 */
export function resolveTrackLanguage({ title = '', artist = '', isrc = null, artistLanguage = null } = {}) {
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
  const detected = detectTitleLanguage(title);
  if (detected.reliable && detected.language && detected.language !== 'en') {
    if (artistLanguage === detected.language) return detected.language;
    if (!artistLanguage && detected.words >= 2) return detected.language;
    if (artistLanguage && detected.words >= 4) return detected.language;
  }
  return artistLanguage || 'en';
}
