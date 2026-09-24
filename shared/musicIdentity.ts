/** The fields a blacklist entry is matched against; ids may arrive as numbers from providers. */
export interface MusicIdentityTrack {
  provider?: string;
  providerTrackId?: string | number | null;
  providerArtistId?: string | number | null;
  title: string;
  artist: string;
}

export interface BlacklistIdentityItem {
  type: 'artist' | 'song';
  name: string;
  canonicalKey?: string;
  provider?: string;
  providerTrackId?: string;
  providerArtistId?: string;
}

const TRANSLITERATIONS = new Map([
  ['ß', 'ss'], ['ẞ', 'SS'], ['æ', 'ae'], ['Æ', 'AE'], ['œ', 'oe'], ['Œ', 'OE'],
  ['ø', 'o'], ['Ø', 'O'], ['đ', 'd'], ['Đ', 'D'], ['ð', 'd'], ['Ð', 'D'],
  ['ł', 'l'], ['Ł', 'L'], ['þ', 'th'], ['Þ', 'TH'], ['ı', 'i'], ['İ', 'I'],
]);

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function transliterate(value: string): string {
  return Array.from(value, character => TRANSLITERATIONS.get(character) || character).join('');
}

/**
 * Produces a Unicode-aware identity key for comparisons, without changing the
 * provider-supplied display value. Letters and numbers (including "21") remain
 * significant; whitespace and punctuation become a single separator.
 */
export function canonicalMusicKey(value: unknown): string {
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

export function blacklistIdentityKey(item: BlacklistIdentityItem | null | undefined): string {
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
export function toCrosswordAnswer(displayName: unknown, { minLength = 2, maxLength = 20 } = {}): string | null {
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

/**
 * Compiles a blacklist once per request into id and name sets; the returned matcher costs
 * O(words²) per track, whatever the list's size.
 *
 * An artist hidden by provider id matches that id exactly. The song may not carry an id from
 * that provider (catalog rows without a Deezer artist id, iTunes results): then the hidden name
 * decides, so a hide made from a live Deezer song also hides the artist's other songs. A song
 * with a provider id is hidden by that id only (a title alone is too common); without one, by
 * title.
 */
export function compileBlacklist(blacklist: BlacklistIdentityItem[] | null | undefined): (track: MusicIdentityTrack) => boolean {
  const artistIds = new Set<string>();
  const trackIds = new Set<string>();
  const artistNames = new Set<string>();
  const songNames = new Set<string>();
  // Names of artists hidden by id, per provider ('*' when the provider is unknown)
  const identifiedArtistNames = new Map<string, Set<string>>();

  for (const item of blacklist || []) {
    if (item?.type !== 'artist' && item?.type !== 'song') continue;
    const name = canonicalMusicKey(item.name) || item.canonicalKey || '';
    const provider = item.provider || '*';
    if (item.type === 'artist' && item.providerArtistId) {
      artistIds.add(`${provider}:${item.providerArtistId}`);
      if (name) identifiedArtistNames.set(provider, (identifiedArtistNames.get(provider) || new Set()).add(name));
    } else if (item.type === 'artist') {
      if (name) artistNames.add(name);
    } else if (item.providerTrackId) {
      trackIds.add(`${provider}:${item.providerTrackId}`);
    } else if (name) {
      songNames.add(name);
    }
  }
  const hasId = (ids: Set<string>, provider: string | undefined, id: string | number | null | undefined): boolean =>
    id !== null && id !== undefined && id !== '' && (ids.has(`*:${id}`) || ids.has(`${provider}:${id}`));

  return track => {
    if (hasId(artistIds, track.provider, track.providerArtistId) || hasId(trackIds, track.provider, track.providerTrackId)) return true;
    const artistKey = canonicalArtistKey(track.artist);
    if (containsAnyPhrase(artistKey, artistNames) || containsAnyPhrase(canonicalTrackKey(track.title), songNames)) return true;
    const hasArtistId = track.providerArtistId !== null && track.providerArtistId !== undefined && track.providerArtistId !== '';
    for (const [provider, names] of identifiedArtistNames) {
      const idWasComparable = hasArtistId && (provider === '*' || provider === track.provider);
      if (!idWasComparable && containsAnyPhrase(artistKey, names)) return true;
    }
    return false;
  };
}

export function blacklistMatchesTrack(blacklist: BlacklistIdentityItem[] | null | undefined, track: MusicIdentityTrack): boolean {
  return compileBlacklist(blacklist)(track);
}

/**
 * Whole-word match on canonical keys: true when `phrases` holds a run of consecutive words of
 * `key`. "drake" matches "drake feat future" and "hey jude" matches "hey jude remastered 2015",
 * but "iu" does not match "julius" and "queen latifah" not "queen".
 */
function containsAnyPhrase(key: string, phrases: ReadonlySet<string>): boolean {
  if (!key || phrases.size === 0) return false;
  const words = key.split(' ');
  for (let start = 0; start < words.length; start++) {
    let phrase = '';
    for (let end = start; end < words.length; end++) {
      phrase = phrase ? `${phrase} ${words[end]}` : words[end];
      if (phrases.has(phrase)) return true;
    }
  }
  return false;
}
