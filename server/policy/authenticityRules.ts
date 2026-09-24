/**
 * Single source of truth for "is this an authentic music recording by the credited artist?".
 * Used by the crawler filter (isAuthenticCandidate), the catalog write path (upsertTrack)
 * and song selection (isAuthenticTrack). Version variants (live, remix, ...) are handled
 * separately by classifyVersion in server/db/trackNormalization.ts.
 */

const COVER_TITLE = [
  /\bcover\b/i, /\btribute\b/i, /\bkaraoke\b/i, /\bfanmade\b/i, /\bfan\s*cover\b/i, /\bremake\b/i, /\bparody\b/i,
  /\b(acoustic|metal|rock|piano|guitar|violin|orchestral|synth|bgm)\s+cover\b/i,
  /\bin\s+the\s+style\s+of\b/i, /\boriginally\s+performed\s+by\b/i, /\bmade\s+famous\s+by\b/i, /\btribute\s+(version|to)\b/i,
];

const UTILITY_TITLE = [
  /\bmusic\s*box\b/i, /\blullaby\b/i, /\b8-?bit\b/i, /\bcomputer\s+game\s+version\b/i,
  /\blo-?fi\s*remix\b/i, /\bphonk\s*remix\b/i, /\bslowed(\s*\+?\s*reverb)?\b/i, /\bsped\s+up\b/i, /\bspeed\s+up\b/i,
  /\bpitched\b/i, /\bnightcore\b/i, /\bbacking\s+track\b/i, /\bworkout\s+mix\b/i, /\bfitness\s+beats\b/i,
  /\bwhite\s+noise\b/i, /\bsoundtrack\s+cue\b/i, /\b\d+\s*bpm\b/i, /\bbass\s*boost(ed)?\b/i,
  /\b(drum|waiting|synth)\s*loop\b/i, /^untitled\b.*\d+$/i, /\bsans\s+paroles\b/i, /\binstrumental(\s+version)?\b/i,
  /\b(acoustic|piano|guitar|harp)\s+version\b/i, /\bkaraoke(\s+version)?\b/i, /\bno\s*vocals?\b/i, /\bguide\s*vocal\b/i, /\bminus\s*one\b/i,
  /[([](?:piano|acoustic|instrumental|orchestral|violin|cello|harp|flute|guitar|music\s*box|karaoke|backing\s*track)[)\]]/i,
];

// Audiobooks and radio plays ("Kapitel 190 - Tintenherz", "Folge 12: ...")
const SPOKEN_WORD_TITLE = [
  /^(kapitel|chapter|teil|folge|episode|track)\s*\d+\b/i,
  /\b(kapitel|chapter)\s+\d+\s*[-–:.]/i,
  /\b(h[öo]rspiel|h[öo]rbuch|audiobook|audio\s*drama|ungek[üu]rzt|unabridged)\b/i,
];

const INAUTHENTIC_ARTIST = [
  /\bkaraoke\b/i, /\btribute\b/i, /\bsoundalike\b/i, /\bthe\s+hit\s+crew\b/i, /\bcountdown\s+singers\b/i,
  /\bcover\s+(band|crew)\b/i, /\bcovers\b/i, /\bmidifine\b/i, /\blittle\s+v\.?(?=\s|$)/i, /\bpellek\b/i, /\bshironeko\b/i,
  /\bpickin'\s+on\b/i, /\brockabye\s+baby!?/i, /\bsweet\s+little\s+band\b/i, /\bwhite\s+noise\b/i,
  /\bsleep\s+sounds\b/i, /\bnature\s+sounds\b/i, /\bmeditation\s+spa\b/i, /\bradio\s+theatre\b/i,
  /\bworkout\s+(music|dj|mix|party|electronica|hits|mafia)\b/i, /\bpower\s+music\s+workout\b/i, /\bfitness\s+workout\b/i,
  /\brunning\s+songs\b/i, /\bgym\s+music\b/i, /\b8-bit\s+arcade\b/i, /\bkaraoke\s+band\b/i, /\bclassic\s+rock\b/i,
  /\brock\s+classics\b/i, /\bhits\s+band\b/i, /\bvarious\s+artists\b/i, /\bsounds?\s+dj\b/i, /\bdj\s+remix\s+crew\b/i,
  /\bmusic\s*box\s*(ensemble|lullaby|collection|band)\b/i, /\blullaby\s*(baby|ensemble|band)\b/i,
  /\banime\s*(keys|piano|relax|chill|cafe|project|ensemble|orchestra|tribute|band|music|soundtrack)\b/i,
  /\bpeaceful\s*(anime|piano|music)\b/i, /\bultra\s*beats\b/i, /\brelaxing\s*piano\b/i,
  /\bjonathan\s*young\b/i, /\bnatewantstobattle\b/i, /\btsuko\s*g\.?/i, /\brichaadeb\b/i, /\brainych\b/i, /\bamalee\b/i,
  /\bfonzi\s*m\b/i, /\bmix\s*factor\b/i, /\bjapanese\s+city\s+pop\b/i,
  // "Various Artists" in other languages, stock/background music labels and cover "factories"
  /^(verschiedene|diverse)\s+interpreten$/i, /^artistes\s+divers$/i, /^v[aá]rios\s+artistas$/i, /^artisti\s+vari$/i,
  /\bstingray\s+music\b/i, /\b(fake\s+music|ultimate\s+remix|punk\s+rock|remix)\s+factory\b/i, /\br&b\s+songbook\b/i,
  /\bsleepy\s+tunes\b/i, /^relax(ing)?\s+(r&b|soul|jazz|music)\b/i, /^(dj\s+hits|hits,?\s+etc\.?)$/i, /^\d{2}'?s\s+greatest\s+hits$/i, /\bcity\s+pop\s+(radio|station|channel|collective)\b/i, /\bgraham\s*blvd\b/i, /\bparty\s*tyme\b/i, /\bknightsbridge\b/i,
];

const SPOKEN_WORD_ARTIST = [
  /\bgruselkabinett\b/i, /\bdie\s+drei\s+(\?\?\?|fragezeichen)/i, /\bf[üu]nf\s+freunde\b/i, /\btkkg\b/i,
  /\bbenjamin\s+bl[üu]mchen\b/i, /\bbibi\s+blocksberg\b/i, /\bcornelia\s+funke\b/i, /\bjohn\s+sinclair\b/i,
  /\b(h[öo]rspiel|h[öo]rbuch|audiobook|audio\s*drama)\b/i,
];

const INAUTHENTIC_ALBUM = [
  /\bkaraoke\b/i, /\btribute\b/i, /\bworkout\b/i, /\bfitness\b/i, /\bmusic\s*box\b/i, /\blullaby\b/i, /\b8-?bit\b/i,
  /\bcover\s+(versions?|music\s+selection)\b/i, /\bcovers\b/i, /\btribute\s+album\b/i,
];

const SPOKEN_WORD_ALBUM = [
  /\b(h[öo]rspiel|h[öo]rbuch|audiobook|audio\s*drama|ungek[üu]rzt|unabridged)\b/i,
  /^folge\s+\d+\b/i,
];

export type InauthenticReason = 'spoken_word' | 'cover' | 'utility' | 'artist' | 'album';

/** The metadata the rules read; missing or null fields count as empty. */
export interface AuthenticityInput {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
}

const matches = (patterns: RegExp[], text: string) => Boolean(text) && patterns.some(pattern => pattern.test(text));

export function checkAuthenticity(
  { title = '', artist = '', album = '' }: AuthenticityInput = {},
): { authentic: true; reason: null } | { authentic: false; reason: InauthenticReason } {
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  const al = String(album || '').trim();

  if (matches(SPOKEN_WORD_TITLE, t) || matches(SPOKEN_WORD_ARTIST, a) || matches(SPOKEN_WORD_ALBUM, al)) {
    return { authentic: false, reason: 'spoken_word' };
  }
  if (matches(COVER_TITLE, t)) return { authentic: false, reason: 'cover' };
  if (matches(UTILITY_TITLE, t)) return { authentic: false, reason: 'utility' };
  if (matches(INAUTHENTIC_ARTIST, a)) return { authentic: false, reason: 'artist' };
  if (matches(INAUTHENTIC_ALBUM, al)) return { authentic: false, reason: 'album' };
  return { authentic: true, reason: null };
}

export function isAuthenticMetadata(track: AuthenticityInput): boolean {
  return checkAuthenticity(track).authentic;
}
