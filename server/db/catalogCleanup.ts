/**
 * Idempotent cleanup of an existing catalog so every row obeys the admission policy that
 * upsertTrack enforces for new rows (en/ja/ko, original recordings, authentic music, valid
 * duration, one row per song and artist).
 *
 * All steps run in ONE transaction. A dry run executes the same steps and rolls back, so the
 * reported counts are exactly what an apply would change. Running it twice changes nothing.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { canonicalArtistKey } from '../../shared/musicIdentity.js';
import { checkAuthenticity } from '../policy/authenticityRules.js';
import { createTracksFts } from './catalogMigrations.js';
import { recomputeCatalogLanguages } from './catalogLanguages.js';
import { findCoverActs, findTracksBelowFloor, recomputeCatalogPopularity } from './catalogPopularity.js';
import {
  ACCEPTED_VERSION_TYPES,
  baseTitleKey,
  classifyVersion,
  cleanDisplayText,
  DEEZER_PLACEHOLDER_RANK,
  extractIsrcCountryCode,
  isAcceptedVersion,
  isAllowedLanguage,
  isValidDuration,
  normalizeIsrc,
  normalizeReleaseDate,
  normalizeReleaseYear,
} from './trackNormalization.js';

// Order matters: rows of one song are merged before artist languages are voted and rows are
// deleted (so the vote sees the final title set), and provider links are restored before the
// policy step treats unlinked rows as unusable.
export const CLEANUP_STEPS = Object.freeze(['text', 'classify', 'recordings', 'links', 'duplicates', 'languages', 'policy', 'popularity', 'fields', 'orphans'] as const);
export type CleanupStep = (typeof CLEANUP_STEPS)[number];

/** A dry-run example; which fields are set depends on the step. */
export interface CleanupExample {
  popularity?: number | null;
  artist?: string;
  title?: string;
  detail?: string | null;
  kept?: string;
  merged?: string;
  removed?: string[];
  tracks?: number;
  copied?: number;
}

/** A step's counters (numbers), plus optional reasons and examples. */
export type StepCounts = {
  reasons?: Record<string, number>;
  examples?: CleanupExample[] | Record<string, CleanupExample[]>;
  rebuilt?: boolean;
} & Record<string, unknown>;

export type StepResult = StepCounts & { name: string; ms: number };

export interface CatalogSummary {
  tracks: number;
  artists: number;
  samples: number;
  providers: number;
}

export interface CleanupResult {
  applied: boolean;
  before: CatalogSummary;
  after: CatalogSummary;
  steps: StepResult[];
}

interface ArtistRow {
  id: number;
  canonical_name: string;
  display_name: string;
  spotify_id: string | null;
  deezer_id: number | null;
  itunes_artist_id: number | null;
  genres_json: string | null;
  fans_count: number | null;
  track_count: number;
}

interface PolicyRow {
  id: number;
  display_title: string;
  album_name: string | null;
  canonical_title: string | null;
  version_type: string;
  language: string | null;
  duration_ms: number | null;
  popularity: number | null;
  artist: string;
  has_provider: number;
}

/** Columns read by the track merger (TRACK_MERGE_COLUMNS). */
interface MergeRow {
  id: number;
  artist_id: number;
  canonical_title: string;
  display_title: string;
  version_type: string;
  isrc: string | null;
  popularity: number | null;
  deezer_rank: number | null;
  spotify_popularity: number | null;
  release_year: number | null;
  release_date: string | null;
  artist: string;
  has_sample: number;
}

type NumericMergeField = 'popularity' | 'deezer_rank' | 'spotify_popularity';
type PolicyReason = 'language' | 'version' | 'inauthentic' | 'duration' | 'title' | 'unlinked';

const EXAMPLE_LIMIT = 10;
const ACCEPTED_SQL = ACCEPTED_VERSION_TYPES.map(type => `'${type}'`).join(', ');

function registerCleanupFunctions(db: DatabaseSync): void {
  db.function('ss_clean_text', { deterministic: true }, (value) => (value === null ? null : cleanDisplayText(String(value))));
  db.function('ss_base_title', { deterministic: true }, (title) => baseTitleKey(String(title || '')));
  db.function('ss_version_type', { deterministic: true }, (title, album) => String(classifyVersion(String(title || ''), String(album || ''))));
  db.function('ss_artist_key', { deterministic: true }, (name) => canonicalArtistKey(String(name || '')));
  db.function('ss_isrc', { deterministic: true }, (isrc) => normalizeIsrc(isrc));
  db.function('ss_isrc_country', { deterministic: true }, (isrc) => extractIsrcCountryCode(String(isrc || '')));
  db.function('ss_year', { deterministic: true }, (year) => normalizeReleaseYear(year));
  db.function('ss_date', { deterministic: true }, (date) => normalizeReleaseDate(date));
}

/** Keeps the N most popular examples seen, for dry-run review. */
class ExampleList {
  readonly limit: number;
  items: CleanupExample[] = [];

  constructor(limit = EXAMPLE_LIMIT) {
    this.limit = limit;
  }

  add(item: CleanupExample): void {
    if (this.items.length < this.limit) {
      this.items.push(item);
      this.items.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      return;
    }
    if ((item.popularity || 0) > (this.items[this.items.length - 1].popularity || 0)) {
      this.items[this.items.length - 1] = item;
      this.items.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }
  }
}

/** Headline counts used before/after a cleanup and by the report. */
export function summarizeCatalog(db: DatabaseSync): CatalogSummary {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tracks) AS tracks,
      (SELECT COUNT(*) FROM artists) AS artists,
      (SELECT COUNT(*) FROM track_samples) AS samples,
      (SELECT COUNT(*) FROM track_providers) AS providers
  `).get() as unknown as CatalogSummary;
  return { tracks: row.tracks, artists: row.artists, samples: row.samples, providers: row.providers };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Decodes HTML entities / trims display text, then merges artists whose names now share a key. */
function stepText(db: DatabaseSync): StepCounts {
  const titles = db.prepare(`
    UPDATE tracks SET display_title = ss_clean_text(display_title)
    WHERE display_title IS NOT ss_clean_text(display_title) AND ss_clean_text(display_title) <> ''
  `).run().changes;
  const albums = db.prepare(`
    UPDATE tracks SET album_name = NULLIF(ss_clean_text(album_name), '')
    WHERE album_name IS NOT NULLIF(ss_clean_text(album_name), '')
  `).run().changes;
  const artistNames = db.prepare(`
    UPDATE artists SET display_name = ss_clean_text(display_name)
    WHERE display_name IS NOT ss_clean_text(display_name) AND ss_clean_text(display_name) <> ''
  `).run().changes;

  // Group artists by their current identity key; a key shared by several rows is one artist
  const groups = new Map<string, ArtistRow[]>();
  const artists = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM tracks t WHERE t.artist_id = a.id) AS track_count
    FROM artists a
  `).iterate() as Iterable<ArtistRow>;
  for (const artist of artists) {
    const key = canonicalArtistKey(artist.display_name);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(artist);
    groups.set(key, group);
  }

  const repointTracks = db.prepare('UPDATE tracks SET artist_id = ? WHERE artist_id = ?');
  const clearIds = db.prepare('UPDATE artists SET spotify_id = NULL, deezer_id = NULL, itunes_artist_id = NULL WHERE id = ?');
  const mergeInto = db.prepare(`
    UPDATE artists SET
      spotify_id = COALESCE(spotify_id, ?),
      deezer_id = COALESCE(deezer_id, ?),
      itunes_artist_id = COALESCE(itunes_artist_id, ?),
      genres_json = COALESCE(genres_json, ?),
      fans_count = MAX(COALESCE(fans_count, 0), COALESCE(?, 0)),
      primary_language = NULL
    WHERE id = ?
  `);
  const deleteArtist = db.prepare('DELETE FROM artists WHERE id = ?');
  const setKey = db.prepare('UPDATE OR IGNORE artists SET canonical_name = ? WHERE id = ?');

  let artistsMerged = 0;
  let keysUpdated = 0;
  const examples = new ExampleList();
  for (const [key, members] of groups) {
    members.sort((a, b) => b.track_count - a.track_count || a.id - b.id);
    const [keeper, ...losers] = members;
    for (const loser of losers) {
      repointTracks.run(keeper.id, loser.id);
      clearIds.run(loser.id);
      mergeInto.run(loser.spotify_id, loser.deezer_id, loser.itunes_artist_id, loser.genres_json, loser.fans_count, keeper.id);
      deleteArtist.run(loser.id);
      artistsMerged++;
      examples.add({ kept: keeper.display_name, merged: loser.display_name, popularity: loser.track_count });
    }
    if (keeper.canonical_name !== key) keysUpdated += Number(setKey.run(key, keeper.id).changes);
  }

  return { titles, albums, artistNames, artistsMerged, keysUpdated, examples: examples.items };
}

/** Rebuilds missing provider links from stored samples (a sample carries its provider track id). */
function stepLinks(db: DatabaseSync): StepCounts {
  const restored = db.prepare(`
    INSERT OR IGNORE INTO track_providers (track_id, provider, provider_track_id)
    SELECT s.track_id, s.provider, s.provider_track_id
    FROM track_samples s
    WHERE s.provider_track_id <> ''
      AND NOT EXISTS (SELECT 1 FROM track_providers p WHERE p.track_id = s.track_id AND p.provider = s.provider)
  `).run().changes;
  return { restored };
}

/** Recomputes base-title keys and version classes with the current rules. */
function stepClassify(db: DatabaseSync): StepCounts {
  const baseTitles = db.prepare(`
    UPDATE tracks SET canonical_title = ss_base_title(display_title)
    WHERE canonical_title IS NOT ss_base_title(display_title)
  `).run().changes;
  const versions = db.prepare(`
    UPDATE tracks SET version_type = ss_version_type(display_title, album_name)
    WHERE version_type IS NOT ss_version_type(display_title, album_name)
  `).run().changes;
  return { baseTitles, versions };
}

function stepLanguages(db: DatabaseSync): StepCounts {
  return recomputeCatalogLanguages(db);
}

/**
 * Deletes rows the admission policy would refuse today (D1 languages, D2 versions,
 * authenticity, duration, empty title key) and rows with no provider link (nothing to play or enrich).
 */
function deletePolicyViolations(db: DatabaseSync, reasons: Record<PolicyReason, number>, examples: Record<PolicyReason, ExampleList>): number {
  const doomed: number[] = [];

  const rows = db.prepare(`
    SELECT t.id, t.display_title, t.album_name, t.canonical_title, t.version_type, t.language,
           t.duration_ms, t.popularity, a.display_name AS artist,
           EXISTS (SELECT 1 FROM track_providers p WHERE p.track_id = t.id) AS has_provider
    FROM tracks t JOIN artists a ON a.id = t.artist_id
  `);
  for (const row of rows.iterate() as Iterable<PolicyRow>) {
    let reason: PolicyReason | null = null;
    if (!isAllowedLanguage(row.language)) reason = 'language';
    else if (!isAcceptedVersion(row.version_type)) reason = 'version';
    else if (!checkAuthenticity({ title: row.display_title, artist: row.artist, album: row.album_name || '' }).authentic) reason = 'inauthentic';
    else if (!isValidDuration(Number(row.duration_ms))) reason = 'duration';
    else if (!row.canonical_title) reason = 'title';
    else if (!row.has_provider) reason = 'unlinked';
    if (!reason) continue;

    reasons[reason]++;
    doomed.push(row.id);
    examples[reason].add({
      title: row.display_title,
      artist: row.artist,
      detail: reason === 'language' ? row.language : reason === 'version' ? row.version_type : undefined,
      popularity: row.popularity,
    });
  }

  const deleteTrack = db.prepare('DELETE FROM tracks WHERE id = ?');
  for (const id of doomed) deleteTrack.run(id);
  return doomed.length;
}

/**
 * Deleting rows changes the title sets artists are voted on, so with the languages step selected
 * the vote and the deletion repeat until they agree (a second cleanup run then changes nothing).
 */
function stepPolicy(db: DatabaseSync, { relanguage = false }: { relanguage?: boolean } = {}): StepCounts {
  const reasons: Record<PolicyReason, number> = { language: 0, version: 0, inauthentic: 0, duration: 0, title: 0, unlinked: 0 };
  const examples = Object.fromEntries(Object.keys(reasons).map(k => [k, new ExampleList()])) as Record<PolicyReason, ExampleList>;

  let deleted = deletePolicyViolations(db, reasons, examples);
  let rounds = 1;
  while (relanguage && rounds < 5) {
    if (recomputeCatalogLanguages(db).changed === 0) break;
    rounds++;
    const more = deletePolicyViolations(db, reasons, examples);
    deleted += more;
    if (more === 0) break;
  }

  return {
    deleted,
    rounds,
    reasons,
    examples: Object.fromEntries(Object.entries(examples).map(([k, list]) => [k, list.items])),
  };
}

const TRACK_MERGE_COLUMNS = `t.id, t.artist_id, t.canonical_title, t.display_title, t.version_type, t.isrc, t.popularity,
           t.deezer_rank, t.spotify_popularity, t.release_year, t.release_date, a.display_name AS artist,
           EXISTS (SELECT 1 FROM track_samples s WHERE s.track_id = t.id) AS has_sample`;

/**
 * Folds duplicate rows into one kept row: provider links and samples move over (the kept row's
 * own sample per provider wins), the earliest release date and highest popularity inputs are
 * kept, and a missing ISRC is taken from a duplicate.
 */
function createTrackMerger(db: DatabaseSync): (keeper: MergeRow, losers: MergeRow[]) => number {
  const moveProviders = db.prepare('UPDATE OR IGNORE track_providers SET track_id = ? WHERE track_id = ?');
  const moveSamples = db.prepare('UPDATE OR IGNORE track_samples SET track_id = ? WHERE track_id = ?');
  const clearIsrc = db.prepare('UPDATE tracks SET isrc = NULL WHERE id = ?');
  const deleteTrack = db.prepare('DELETE FROM tracks WHERE id = ?');
  const mergeInto = db.prepare(`
    UPDATE tracks SET
      isrc = COALESCE(isrc, ?),
      country_code = COALESCE(country_code, ?),
      popularity = MAX(COALESCE(popularity, 0), ?),
      deezer_rank = CASE WHEN ? IS NULL THEN deezer_rank ELSE MAX(COALESCE(deezer_rank, 0), ?) END,
      spotify_popularity = CASE WHEN ? IS NULL THEN spotify_popularity ELSE MAX(COALESCE(spotify_popularity, 0), ?) END,
      release_year = ?,
      release_date = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  return (keeper, losers) => {
    const group = [keeper, ...losers];
    const maxOf = (field: NumericMergeField): number | null => {
      const values = group.map(row => row[field]).filter((v): v is number => v !== null && v !== undefined);
      return values.length ? Math.max(...values) : null;
    };
    // The earliest known release of the song is its original release
    const dated = group.filter(row => row.release_year);
    const earliest = dated.length ? dated.reduce((a, b) => (b.release_year! < a.release_year! ? b : a)) : null;
    const isrcDonor = keeper.isrc ? null : losers.find(row => row.isrc);

    for (const loser of losers) {
      moveProviders.run(keeper.id, loser.id);
      moveSamples.run(keeper.id, loser.id);
    }
    if (isrcDonor) clearIsrc.run(isrcDonor.id);
    const deezerRank = maxOf('deezer_rank');
    const spotify = maxOf('spotify_popularity');
    mergeInto.run(
      isrcDonor?.isrc ?? null,
      isrcDonor ? extractIsrcCountryCode(isrcDonor.isrc || '') : null,
      maxOf('popularity') ?? 0,
      deezerRank, deezerRank,
      spotify, spotify,
      earliest ? earliest.release_year : keeper.release_year,
      earliest
        ? earliest.release_date ?? (keeper.release_year === earliest.release_year ? keeper.release_date : null)
        : keeper.release_date,
      keeper.id
    );
    for (const loser of losers) deleteTrack.run(loser.id);
    return maxOf('popularity') ?? 0;
  };
}

/**
 * Collaborations used to be stored once per credited artist ("Die With A Smile" under Bruno Mars
 * and under Lady Gaga) with the provider link kept by only one row. A row whose sample points at a
 * provider track owned by another row is the same recording: fold it into the owner.
 */
function stepRecordings(db: DatabaseSync): StepCounts {
  const pairs = db.prepare(`
    SELECT DISTINCT s.track_id AS duplicate_id, p.track_id AS owner_id
    FROM track_samples s
    JOIN track_providers p ON p.provider = s.provider AND p.provider_track_id = s.provider_track_id
    WHERE p.track_id <> s.track_id
    ORDER BY s.track_id
  `).all() as { duplicate_id: number; owner_id: number }[];

  // Resolve chains (A -> B -> C) so every duplicate lands on a row that survives
  const ownerOf = new Map(pairs.map(pair => [pair.duplicate_id, pair.owner_id]));
  const resolve = (id: number): number => {
    const seen = new Set<number>();
    while (ownerOf.has(id) && !seen.has(id)) {
      seen.add(id);
      id = ownerOf.get(id)!;
    }
    return id;
  };
  const byOwner = new Map<number, number[]>();
  for (const duplicateId of ownerOf.keys()) {
    const ownerId = resolve(duplicateId);
    if (ownerId === duplicateId) continue;
    const duplicates = byOwner.get(ownerId) ?? [];
    duplicates.push(duplicateId);
    byOwner.set(ownerId, duplicates);
  }

  const getTrackStatement: StatementSync = db.prepare(`SELECT ${TRACK_MERGE_COLUMNS} FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE t.id = ?`);
  const getTrack = (id: number) => getTrackStatement.get(id) as unknown as MergeRow | undefined;
  const merge = createTrackMerger(db);
  let removed = 0;
  const examples = new ExampleList();
  for (const [ownerId, duplicateIds] of byOwner) {
    const keeper = getTrack(ownerId);
    const losers = duplicateIds.map(getTrack).filter((row): row is MergeRow => Boolean(row));
    if (!keeper || losers.length === 0) continue;
    const popularity = merge(keeper, losers);
    removed += losers.length;
    examples.add({
      kept: `${keeper.artist} - ${keeper.display_title}`,
      removed: losers.map(row => `${row.artist} - ${row.display_title}`),
      popularity,
    });
  }
  return { groups: byOwner.size, removed, examples: examples.items };
}

/**
 * One row per (artist, base title) among accepted versions (live/remix/... rows are left for the
 * policy step to delete, so their popularity never inflates the original). The kept row is the
 * plain original with a sample, an ISRC and the highest popularity; the others' provider links,
 * samples and metadata are merged in.
 */
function stepDuplicates(db: DatabaseSync): StepCounts {
  const rows = db.prepare(`
    SELECT ${TRACK_MERGE_COLUMNS}
    FROM tracks t
    JOIN artists a ON a.id = t.artist_id
    JOIN (
      SELECT artist_id, canonical_title FROM tracks WHERE version_type IN (${ACCEPTED_SQL})
      GROUP BY artist_id, canonical_title HAVING COUNT(*) > 1
    ) d ON d.artist_id = t.artist_id AND d.canonical_title = t.canonical_title
    WHERE t.version_type IN (${ACCEPTED_SQL})
    ORDER BY t.artist_id, t.canonical_title
  `).all() as unknown as MergeRow[];

  const rank = (row: MergeRow): number[] => [
    row.version_type === 'original' ? 1 : 0,
    row.has_sample ? 1 : 0,
    row.isrc ? 1 : 0,
    row.popularity || 0,
    -row.id,
  ];
  const better = (a: MergeRow, b: MergeRow): boolean => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
    return false;
  };

  const merge = createTrackMerger(db);
  let groups = 0;
  let removed = 0;
  const examples = new ExampleList();
  const flush = (group: MergeRow[]) => {
    if (group.length < 2) return;
    groups++;
    const keeper = group.reduce((best, row) => (better(row, best) ? row : best));
    const losers = group.filter(row => row !== keeper);
    const popularity = merge(keeper, losers);
    removed += losers.length;
    examples.add({
      artist: keeper.artist,
      kept: keeper.display_title,
      removed: losers.map(row => row.display_title),
      popularity,
    });
  };

  let group: MergeRow[] = [];
  for (const row of rows) {
    if (group.length && (row.artist_id !== group[0].artist_id || row.canonical_title !== group[0].canonical_title)) {
      flush(group);
      group = [];
    }
    group.push(row);
  }
  flush(group);

  return { groups, removed, examples: examples.items };
}

/**
 * Deletes every song of an enriched cover or stock-music act, then tracks under the popularity
 * floor whose artist has been enriched (rules in catalogPopularity.js). Tracks of artists that
 * were not enriched yet have unknown fans: they are counted as `unjudged`, not deleted.
 */
function stepPopularity(db: DatabaseSync): StepCounts {
  const coverActs = findCoverActs(db);
  const deleteArtistTracks = db.prepare('DELETE FROM tracks WHERE artist_id = ?');
  let coverTracks = 0;
  for (const act of coverActs as { id: number }[]) coverTracks += Number(deleteArtistTracks.run(act.id).changes);

  const { below, unjudged } = findTracksBelowFloor(db);
  const deleteTrack = db.prepare('DELETE FROM tracks WHERE id = ?');
  for (const id of below) deleteTrack.run(id);

  return {
    deleted: coverTracks + below.length,
    belowFloor: below.length,
    coverActs: coverActs.length,
    coverTracks,
    unjudged,
    examples: {
      coverActs: (coverActs as { name: string; tracks: number; copied: number }[]).slice(0, EXAMPLE_LIMIT)
        .map(act => ({ artist: act.name, tracks: act.tracks, copied: act.copied })),
    },
  };
}

/** Normalizes stored fields: ISRC format, registrant country, years/dates, Deezer ranks and the popularity score. */
function stepFields(db: DatabaseSync): StepCounts {
  const isrcNormalized = db.prepare(`
    UPDATE OR IGNORE tracks SET isrc = ss_isrc(isrc)
    WHERE isrc IS NOT NULL AND ss_isrc(isrc) IS NOT NULL AND isrc <> ss_isrc(isrc)
  `).run().changes;
  // Invalid ISRCs, or ones whose normalized form another row already owns
  const isrcCleared = db.prepare(`
    UPDATE tracks SET isrc = NULL WHERE isrc IS NOT NULL AND isrc IS NOT ss_isrc(isrc)
  `).run().changes;
  const countryCodes = db.prepare(`
    UPDATE tracks SET country_code = ss_isrc_country(isrc) WHERE country_code IS NOT ss_isrc_country(isrc)
  `).run().changes;
  const dates = db.prepare(`
    UPDATE tracks SET release_date = ss_date(release_date) WHERE release_date IS NOT ss_date(release_date)
  `).run().changes;
  const years = db.prepare(`
    UPDATE tracks SET release_year = COALESCE(ss_year(release_year), ss_year(release_date))
    WHERE release_year IS NOT COALESCE(ss_year(release_year), ss_year(release_date))
  `).run().changes;
  // Legacy rows kept the Deezer rank in `popularity`; the placeholder rank carries no signal
  const ranks = Number(db.prepare('UPDATE tracks SET deezer_rank = popularity WHERE deezer_rank IS NULL AND popularity > 100').run().changes)
    + Number(db.prepare(`UPDATE tracks SET deezer_rank = NULL WHERE deezer_rank = ${DEEZER_PLACEHOLDER_RANK}`).run().changes);
  const popularity = recomputeCatalogPopularity(db);
  const explicit = db.prepare(`
    UPDATE tracks SET is_explicit = CASE WHEN is_explicit THEN 1 ELSE 0 END WHERE is_explicit NOT IN (0, 1) OR is_explicit IS NULL
  `).run().changes;
  const randKeys = db.prepare(`
    UPDATE tracks SET rand_key = (ABS(RANDOM()) % 1000000000) / 1000000000.0 WHERE rand_key IS NULL OR rand_key = 0
  `).run().changes;
  return { isrcNormalized, isrcCleared, countryCodes, dates, years, ranks, popularity, explicit, randKeys };
}

function stepOrphans(db: DatabaseSync): StepCounts {
  const samples = db.prepare('DELETE FROM track_samples WHERE track_id NOT IN (SELECT id FROM tracks)').run().changes;
  const providers = db.prepare('DELETE FROM track_providers WHERE track_id NOT IN (SELECT id FROM tracks)').run().changes;
  const artists = db.prepare('DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)').run().changes;
  return { samples, providers, artists };
}

const STEP_IMPLEMENTATIONS: Record<CleanupStep, (db: DatabaseSync, options: { relanguage: boolean }) => StepCounts> = {
  text: stepText,
  classify: stepClassify,
  recordings: stepRecordings,
  links: stepLinks,
  duplicates: stepDuplicates,
  languages: stepLanguages,
  policy: stepPolicy,
  popularity: stepPopularity,
  fields: stepFields,
  orphans: stepOrphans,
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Runs the cleanup on a migrated (latest schema) catalog. With `apply: false` (default)
 * everything is rolled back afterwards.
 */
export function runCatalogCleanup(
  db: DatabaseSync,
  { apply = false, steps = CLEANUP_STEPS, onStep = () => {} }: {
    apply?: boolean;
    steps?: readonly string[];
    onStep?: (name: string, result: StepResult) => void;
  } = {},
): CleanupResult {
  const unknown = steps.filter(step => !(CLEANUP_STEPS as readonly string[]).includes(step));
  if (unknown.length) throw new Error(`Unknown cleanup step(s): ${unknown.join(', ')}`);

  registerCleanupFunctions(db);
  const before = summarizeCatalog(db);
  const results: StepResult[] = [];

  db.exec('BEGIN IMMEDIATE;');
  try {
    // The FTS index is rebuilt once at the end instead of updated by triggers on every change
    db.exec('DROP TRIGGER IF EXISTS tracks_fts_ai; DROP TRIGGER IF EXISTS tracks_fts_ad; DROP TRIGGER IF EXISTS tracks_fts_au;');

    for (const name of CLEANUP_STEPS.filter(step => steps.includes(step))) {
      const started = Date.now();
      const result: StepResult = { name, ...STEP_IMPLEMENTATIONS[name](db, { relanguage: steps.includes('languages') }), ms: 0 };
      result.ms = Date.now() - started;
      results.push(result);
      onStep(name, result);
    }

    const ftsStarted = Date.now();
    createTracksFts(db);
    results.push({ name: 'fts', rebuilt: true, ms: Date.now() - ftsStarted });

    const after = summarizeCatalog(db);
    db.exec(apply ? 'COMMIT;' : 'ROLLBACK;');
    return { applied: apply, before, after, steps: results };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/** Post-apply maintenance: planner statistics, WAL truncation and (optionally) VACUUM. */
export function compactCatalog(db: DatabaseSync, { vacuum = true }: { vacuum?: boolean } = {}): void {
  db.exec('ANALYZE;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  if (vacuum) db.exec('VACUUM;');
}
