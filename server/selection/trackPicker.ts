/**
 * Picks puzzle songs from ordered candidates: recency, duplicate track/title/answer, blacklist,
 * language/thematic/authenticity/year policy, one track per artist (unless the prompt targets
 * an artist), then the crossword answer and clue with clue-type and answer-length rotation.
 */
import { extractAnswerKeyword, splitArtistNames, formatCrosswordClue } from '../../shared/musicKeywords.ts';
import { blacklistMatchesTrack, canonicalArtistKey, canonicalTrackKey, type MusicIdentityTrack } from '../../shared/musicIdentity.js';
import { classifyVersion, isAcceptedVersion } from '../db/trackNormalization.js';
import {
  isAuthenticTrack,
  isLanguagePermitted,
  isTemporalPermitted,
  isThematicallyPermitted,
  resolveReleaseYear,
} from '../policy/selectionPolicy.ts';
import type { AnswerCandidate, ExtractKeywordOptions, LengthBucket } from '../../shared/musicKeywords.ts';
import type { BlacklistEntry } from '../db/userStore.ts';
import type { QueryPlan } from '../services/queryBuilder.ts';
import type { SongCandidate } from '../types.ts';

type PreferredType = NonNullable<ExtractKeywordOptions['preferredType']>;

/** A picked song with its crossword answer and clue. */
export type PickedSong = SongCandidate & { answer: string; clueType: string; clueText: string };

const PREFERRED_CLUE_ROTATION: PreferredType[] = ['title', 'artist', 'title', 'artist', 'keyword'];
const ANIME_CLUE_ROTATION: PreferredType[] = ['anime', 'title', 'artist', 'keyword'];
const LENGTH_BUCKET_ROTATION: LengthBucket[] = ['short', 'medium', 'long', 'medium', 'short', 'long', 'medium'];
const GENERIC_ABBREVIATIONS = ['TV', 'OP', 'ED', 'OST', 'BGM'];

/**
 * How often each candidate appeared in the player's recent history (track ids, legacy
 * `hit-` ids, and recently played artists).
 */
export function createRecentCounter(recentIds: readonly unknown[] = []): (track: SongCandidate) => number {
  const frequency = new Map<string, number>();
  for (const item of Array.isArray(recentIds) ? recentIds : []) {
    if (!item) continue;
    const key = String(item);
    frequency.set(key, (frequency.get(key) || 0) + 1);
  }
  return (track) => {
    const providerTrackId = String(track.providerTrackId);
    const artistKey = canonicalArtistKey(track.artist);
    let playCount = 0;
    for (const key of [String(track.id), providerTrackId, `deezer:${providerTrackId}`, `itunes:${providerTrackId}`, `hit-${providerTrackId}`]) {
      if (frequency.has(key)) playCount = Math.max(playCount, frequency.get(key)!);
    }
    // Recently played artists count too, which keeps consecutive puzzles varied
    if (frequency.has(artistKey) || frequency.has(`artist:${artistKey}`)) {
      playCount = Math.max(playCount, frequency.get(artistKey) || frequency.get(`artist:${artistKey}`) || 1);
    }
    return playCount;
  };
}

export function createTrackPicker({ count, queryPlan, prompt = '', blacklist = [], recentCount, animeKeyphrase = null, isTargetingAnimeKeyphrase = false }: {
  count: number;
  queryPlan: QueryPlan;
  prompt?: string;
  blacklist?: BlacklistEntry[];
  recentCount: (track: SongCandidate) => number;
  animeKeyphrase?: string | null;
  isTargetingAnimeKeyphrase?: boolean;
}) {
  const songs: PickedSong[] = [];
  const seenTracks = new Set<string>();
  const seenArtists = new Set<string>();
  const seenTitles = new Set<string>();
  const seenAnswers = new Set<string>();
  const clueStats = { title: 0, artist: 0, keyword: 0, anime: 0 };
  const rejections = {
    recent: 0,
    duplicateTrack: 0,
    duplicateTitle: 0,
    duplicateArtist: 0,
    duplicateAnswer: 0,
    blacklist: 0,
    language: 0,
    version: 0,
    thematic: 0,
    temporal: 0,
    noKeyword: 0,
  };

  // The prompt's own keyphrase (artist or anime title) must never be a grid answer
  const banTokens = (text: string) => text.split(/[^a-zA-Z0-9]+/).forEach(token => {
    if (token.length >= 3) seenAnswers.add(token.toUpperCase());
  });
  if (queryPlan.artist) banTokens(queryPlan.artist);
  if (isTargetingAnimeKeyphrase && animeKeyphrase) banTokens(animeKeyphrase);

  const policyContext = prompt || queryPlan.prompt;
  const isTargetingSingleArtist = Boolean(queryPlan.artist);
  const targetArtistKey = queryPlan.artist ? canonicalArtistKey(queryPlan.artist) : '';

  function chooseKeyword(track: SongCandidate, preferredType: PreferredType, allowArtist: boolean, targetLengthBucket: LengthBucket): AnswerCandidate | 'generic' | null {
    const base: ExtractKeywordOptions = { allowArtist, animeTitle: track.animeTitle, seenAnswers };
    let keyword = extractAnswerKeyword(track.title, track.artist, { ...base, preferredType, targetLengthBucket });

    // Answer already on the grid: try a co-performer, then the other clue types
    if (keyword && seenAnswers.has(keyword.answer)) {
      if (keyword.clueType === 'Artist name') {
        keyword = extractAnswerKeyword(track.title, track.artist, { ...base, preferredType: 'artist', artistIndex: 1, targetLengthBucket });
      }
      for (const fallbackType of ['anime', 'title', 'keyword'] as const) {
        if (!keyword || !seenAnswers.has(keyword.answer)) break;
        keyword = extractAnswerKeyword(track.title, track.artist, { ...base, preferredType: fallbackType, targetLengthBucket });
      }
    }
    if (!keyword || seenAnswers.has(keyword.answer)) {
      // Without the length bucket
      keyword = extractAnswerKeyword(track.title, track.artist, { ...base, preferredType });
    }
    if (!keyword || seenAnswers.has(keyword.answer)) return null;

    // Generic soundtrack abbreviations only as an artist's actual name
    if (GENERIC_ABBREVIATIONS.includes(keyword.answer) && keyword.clueType !== 'Artist name') {
      const alternative = extractAnswerKeyword(track.title, track.artist, { ...base, preferredType: allowArtist ? 'artist' : 'title', targetLengthBucket });
      if (alternative && !GENERIC_ABBREVIATIONS.includes(alternative.answer)) return alternative;
      return 'generic';
    }
    return keyword;
  }

  /** Adds eligible candidates (played at most `maxPlays` times) until `count` songs are picked. */
  function pick(candidates: readonly SongCandidate[], maxPlays: number): void {
    for (const track of candidates) {
      if (songs.length >= count) break;

      const artistIdentity = canonicalArtistKey(track.artist);
      const titleIdentity = canonicalTrackKey(track.title);
      const trackIdentity = `${artistIdentity}|${titleIdentity}`;

      if (recentCount(track) > maxPlays) {
        rejections.recent++;
        continue;
      }
      if (seenTracks.has(trackIdentity)) {
        rejections.duplicateTrack++;
        continue;
      }
      if (seenTitles.has(titleIdentity)) {
        rejections.duplicateTitle++;
        continue;
      }
      // musicIdentity.d.ts types ids as strings; the matcher compares String(id) (T7 widens the type)
      if (blacklistMatchesTrack(blacklist, track as MusicIdentityTrack)) {
        rejections.blacklist++;
        continue;
      }
      if (!isLanguagePermitted(track, queryPlan.genre, policyContext, { languages: queryPlan.languages })) {
        rejections.language++;
        continue;
      }
      // Live-provider candidates never passed the catalog's original-version rule
      if (!track.isAnimeOped && !isAcceptedVersion(classifyVersion(track.title, track.album || ''))) {
        rejections.version++;
        continue;
      }
      if (!isThematicallyPermitted(track, queryPlan.genre, policyContext) || !isAuthenticTrack(track)) {
        rejections.thematic++;
        continue;
      }
      if (!isTemporalPermitted(track, queryPlan.yearRange)) {
        rejections.temporal++;
        continue;
      }

      const isTargetArtist = isTargetingSingleArtist && (artistIdentity.includes(targetArtistKey) || targetArtistKey.includes(artistIdentity));
      const isKeyphraseAnimeMatch = isTargetingAnimeKeyphrase && Boolean(track.isAnimeOped);
      const artistNames = splitArtistNames(track.artist);
      const isDuplicateArtist = !isTargetArtist && !isKeyphraseAnimeMatch && (
        seenArtists.has(artistIdentity) || artistNames.some(name => seenArtists.has(canonicalArtistKey(name)))
      );
      if (isDuplicateArtist) {
        rejections.duplicateArtist++;
        continue;
      }

      // A targeted artist never gets artist-name clues; anime themes rotate the anime title in
      let preferredType: PreferredType;
      if (isTargetingSingleArtist) {
        preferredType = songs.length % 2 === 0 ? 'title' : 'keyword';
      } else if (track.isAnimeOped) {
        preferredType = ANIME_CLUE_ROTATION[songs.length % ANIME_CLUE_ROTATION.length];
      } else {
        preferredType = PREFERRED_CLUE_ROTATION[songs.length % PREFERRED_CLUE_ROTATION.length];
      }
      const targetLengthBucket = LENGTH_BUCKET_ROTATION[songs.length % LENGTH_BUCKET_ROTATION.length];

      const keyword = chooseKeyword(track, preferredType, !isTargetingSingleArtist, targetLengthBucket);
      if (keyword === 'generic') {
        rejections.thematic++;
        continue;
      }
      if (!keyword) {
        rejections.noKeyword++;
        continue;
      }
      if (seenAnswers.has(keyword.answer)) {
        rejections.duplicateAnswer++;
        continue;
      }

      seenTracks.add(trackIdentity);
      seenArtists.add(artistIdentity);
      artistNames.forEach(name => seenArtists.add(canonicalArtistKey(name)));
      seenTitles.add(titleIdentity);
      seenAnswers.add(keyword.answer);

      if (keyword.clueType === 'Song title') clueStats.title++;
      else if (keyword.clueType === 'Artist name') clueStats.artist++;
      else if (keyword.clueType === 'Anime title') clueStats.anime++;
      else clueStats.keyword++;

      // A requested year window pins the song to the year it was matched on
      const year = queryPlan.yearRange ? resolveReleaseYear(track) : null;
      const song = year ? { ...track, releaseYear: year, releaseDate: `${year}-01-01` } : { ...track };
      songs.push({
        ...song,
        answer: keyword.answer,
        clueType: keyword.clueType,
        clueText: formatCrosswordClue(song, keyword),
      });
    }
  }

  return { songs, clueStats, rejections, pick };
}
