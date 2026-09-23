const TRANSLITERATIONS = new Map([
  ['ß', 'ss'], ['ẞ', 'SS'], ['æ', 'ae'], ['Æ', 'AE'], ['œ', 'oe'], ['Œ', 'OE'],
  ['ø', 'o'], ['Ø', 'O'], ['đ', 'd'], ['Đ', 'D'], ['ð', 'd'], ['Ð', 'D'],
  ['ł', 'l'], ['Ł', 'L'], ['þ', 'th'], ['Þ', 'TH'], ['ı', 'i'], ['İ', 'I'],
]);

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function transliterate(value) {
  return Array.from(value, character => TRANSLITERATIONS.get(character) || character).join('');
}

/**
 * Produces a Unicode-aware identity key for comparisons, without changing the
 * provider-supplied display value. Letters and numbers (including "21") remain
 * significant; whitespace and punctuation become a single separator.
 */
export function canonicalMusicKey(value) {
  const input = asString(value);
  if (!input) return '';

  return transliterate(input)
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .normalize('NFKD')
    // Fold accents on Latin letters only: kana dakuten (ド vs ト) and hangul are meaningful
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const canonicalArtistKey = canonicalMusicKey;
export const canonicalTrackKey = canonicalMusicKey;

export function blacklistIdentityKey(item) {
  if (!item || (item.type !== 'artist' && item.type !== 'song')) return '';

  const provider = asString(item.provider).toLocaleLowerCase();
  const providerId = item.type === 'artist'
    ? String(item.providerArtistId ?? '').trim()
    : String(item.providerTrackId ?? '').trim();

  if (provider && providerId) {
    return JSON.stringify([item.type, 'provider', provider, providerId]);
  }

  const canonicalKey = canonicalMusicKey(item.name) || item.canonicalKey;
  return JSON.stringify([item.type, 'generic', canonicalKey]);
}

/**
 * Converts a complete display name into a grid-safe answer. It intentionally
 * does not choose a word from the name: "21 pilots" becomes "21PILOTS".
 * Ampersands ('&') and '+' in single entities or titles are replaced with 'AND'
 * (e.g. "Above & Beyond" -> "ABOVEANDBEYOND", "Rock & Roll" -> "ROCKANDROLL").
 * Unsupported scripts, empty values, and answers outside the grid limits are
 * rejected instead of being silently mangled.
 */
export function toCrosswordAnswer(displayName, { minLength = 2, maxLength = 20 } = {}) {
  const input = asString(displayName);
  if (!input) return null;

  const unescaped = input
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  const expanded = unescaped
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ');

  const normalized = transliterate(expanded)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');

  let answer = '';
  for (const character of normalized) {
    if (/[A-Za-z0-9]/.test(character)) {
      answer += character.toUpperCase();
    } else if (/\p{L}|\p{N}/u.test(character)) {
      return null;
    }
  }

  return answer.length >= minLength && answer.length <= maxLength ? answer : null;
}

export function blacklistMatchesTrack(blacklist, track) {
  const artistKey = canonicalArtistKey(track.artist);
  const titleKey = canonicalTrackKey(track.title);

  return (blacklist || []).some(item => {
    if (!item || (item.type !== 'artist' && item.type !== 'song')) return false;

    if (item.type === 'artist' && item.providerArtistId) {
      return (!item.provider || item.provider === track.provider) &&
        String(item.providerArtistId) === String(track.providerArtistId);
    }

    if (item.type === 'song' && item.providerTrackId) {
      return (!item.provider || item.provider === track.provider) &&
        String(item.providerTrackId) === String(track.providerTrackId);
    }

    const candidateKey = item.type === 'artist' ? artistKey : titleKey;
    const blacklistKey = canonicalMusicKey(item.name) || item.canonicalKey;
    return Boolean(candidateKey && blacklistKey && (
      candidateKey === blacklistKey ||
      candidateKey.includes(blacklistKey) ||
      blacklistKey.includes(candidateKey)
    ));
  });
}
