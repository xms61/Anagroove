#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';
import { sqliteCatalog, detectTrackLanguage, extractIsrcCountryCode } from '../server/db/sqliteCatalog.js';
import { normalizeDeezerRank, provisionalPopularity } from '../server/db/trackNormalization.js';
import { isAbovePopularityFloor } from '../server/db/catalogPopularity.js';
import { isAuthenticCandidate } from '../server/crawler/authenticityFilter.ts';
import { intFlag, parseFlags, parseOrExit } from './lib/cli.js';

const USAGE = `
Stream-ingests MusicMoveArr dumps (one source per run):
  node scripts/ingest_musicmovearr.js --csv-file=./data/deezer_tracks.csv --provider=deezer
  node scripts/ingest_musicmovearr.js --sql-file=./data/changes_2026_03.sql.gz --provider=deezer
  node scripts/ingest_musicmovearr.js --base-dir=./data/base_tables/ --min-popularity=31
  node scripts/ingest_musicmovearr.js --incremental-dir=./data/changes/ --dry-run
Other flags: --limit=N  --batch-size=2000`;

const OPTIONS = {
  'dry-run': { type: 'boolean' },
  'min-popularity': { type: 'string' },
  limit: { type: 'string' },
  'batch-size': { type: 'string' },
  'csv-file': { type: 'string' },
  'sql-file': { type: 'string' },
  'base-dir': { type: 'string' },
  'incremental-dir': { type: 'string' },
  provider: { type: 'string' },
};
const flags = import.meta.main
  ? parseOrExit(() => {
    const values = parseFlags(OPTIONS);
    return {
      ...values,
      minPopularity: intFlag(values, 'min-popularity'),
      limit: intFlag(values, 'limit'),
      batchSize: intFlag(values, 'batch-size'),
    };
  }, USAGE)
  : {};

const isDryRun = Boolean(flags['dry-run']);
const minPopularity = flags.minPopularity ?? 31;
const limit = flags.limit ?? Infinity;
const csvFilePath = flags['csv-file'];
const sqlFilePath = flags['sql-file'];
const baseDirPath = flags['base-dir'];
const incrementalDirPath = flags['incremental-dir'];
const providerOverride = (flags.provider ?? 'deezer').toLowerCase();
const batchSize = flags.batchSize || 2000;

/** Spotify popularity from the dump reaches --min-popularity, or the Deezer rank reaches its language's floor. */
function passesPopularityFloor(candidate) {
  return (candidate.spotifyPopularity ?? -1) >= minPopularity
    || isAbovePopularityFloor({ language: candidate.language, deezerRank: candidate.deezerRank });
}

/**
 * Parses a standard CSV/TSV line respecting quoted fields.
 */
export function parseDelimitedLine(line = '', delimiter = ',') {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Converts raw row values into a standardized Anagroove catalog candidate.
 */
export function mapRowToCandidate(row, headers = [], defaultProvider = 'deezer') {
  const getVal = (fieldNames) => {
    for (const name of fieldNames) {
      const idx = headers.indexOf(name.toLowerCase());
      if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
        return row[idx];
      }
    }
    return null;
  };

  const providerTrackId = getVal(['id', 'track_id', 'provider_track_id', 'spotify_id', 'deezer_id']);
  const title = getVal(['title', 'track_name', 'name']);
  const artist = getVal(['artist', 'artist_name', 'artists']);
  const album = getVal(['album', 'album_name']) || 'Single';
  const isrc = getVal(['isrc', 'track_isrc']);
  const rawDuration = getVal(['duration_ms', 'duration', 'length']);
  const rawPopularity = getVal(['popularity', 'rank', 'rating']);
  const releaseDate = getVal(['release_date', 'year', 'date']) || '';
  const explicitVal = getVal(['is_explicit', 'explicit']);

  if (!title || !artist || !providerTrackId) {
    return null;
  }

  let durationMs = parseInt(rawDuration || '0', 10);
  // If duration is in seconds (e.g. 180s instead of 180000ms), normalize to ms
  if (durationMs > 0 && durationMs < 1000) {
    durationMs = durationMs * 1000;
  }

  const rawValue = parseInt(rawPopularity || '0', 10) || 0;
  // Values above 100 are Deezer ranks (0 - ~1,000,000); 1-100 is a Spotify popularity
  const deezerRank = rawValue > 100 ? normalizeDeezerRank(rawValue) : null;
  const spotifyPopularity = rawValue > 0 && rawValue <= 100 ? rawValue : null;
  const popularity = provisionalPopularity({ deezerRank, spotifyPopularity });

  const releaseYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;
  const isExplicit = explicitVal === '1' || String(explicitVal).toLowerCase() === 'true';

  const cleanIsrc = isrc ? String(isrc).trim().toUpperCase() : null;
  const countryCode = extractIsrcCountryCode(cleanIsrc);
  const language = detectTrackLanguage(title, artist, { isrc: cleanIsrc });

  return {
    provider: defaultProvider,
    providerTrackId: String(providerTrackId).trim(),
    title: String(title).trim(),
    artist: String(artist).trim(),
    album: String(album).trim(),
    durationMs, // 0 when unknown: the catalog rejects it instead of storing a made-up length
    popularity,
    deezerRank,
    spotifyPopularity,
    isrc: cleanIsrc,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
    releaseDate: releaseDate || null,
    countryCode,
    language,
    isExplicit,
    sampleUrl: null, // Scenario C: Lazily resolved during gameplay
  };
}

/**
 * Parses SQL INSERT statement values row: (val1, val2, val3)
 */
export function parseSqlInsertTuple(tupleStr = '') {
  const clean = tupleStr.trim().replace(/^\(|\)$/g, '');
  const values = [];
  let current = '';
  let insideQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if ((char === "'" || char === '"') && !insideQuotes) {
      insideQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && insideQuotes) {
      if (clean[i + 1] === quoteChar) {
        current += quoteChar;
        i++;
      } else {
        insideQuotes = false;
        quoteChar = '';
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(current.trim() === 'NULL' ? null : current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim() === 'NULL' ? null : current.trim());
  return values;
}

/**
 * Streams through a CSV/TSV file, batches candidates, and updates SQLite.
 */
export async function streamIngestCsv(filePath, provider = 'deezer', stats) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`\n📂 Streaming CSV: ${path.basename(filePath)} (Provider: ${provider})`);

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let delimiter = ',';
  let batch = [];

  for await (const line of rl) {
    if (!line || line.trim() === '') continue;

    if (!headers) {
      delimiter = line.includes('\t') ? '\t' : ',';
      headers = parseDelimitedLine(line, delimiter).map(h => h.toLowerCase());
      console.log(`   Detected ${headers.length} columns (Delimiter: "${delimiter === '\t' ? '\\t' : ','}"): ${headers.slice(0, 6).join(', ')}...`);
      continue;
    }

    stats.totalLines++;
    const row = parseDelimitedLine(line, delimiter);
    const candidate = mapRowToCandidate(row, headers, provider);

    if (!candidate) continue;

    // Filter: Popularity threshold
    if (!passesPopularityFloor(candidate)) {
      stats.skippedPopularity++;
      continue;
    }

    // Filter: Authenticity check (no sample required for Scenario C)
    if (!isAuthenticCandidate(candidate, { requireSample: false })) {
      stats.skippedAuthenticity++;
      continue;
    }

    stats.qualifiedCandidates++;
    batch.push(candidate);

    if (batch.length >= batchSize) {
      if (!isDryRun) {
        const res = sqliteCatalog.upsertBatch(batch);
        stats.insertedCanonical += res.inserted;
        stats.mergedCross += res.merged;
      }
      batch = [];

      // Periodic WAL Compaction every 100k tracks
      if (stats.qualifiedCandidates % 100000 === 0 && !isDryRun) {
        sqliteCatalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      }

      if (stats.qualifiedCandidates % 10000 === 0) {
        process.stdout.write(`\r   Qualified: ${stats.qualifiedCandidates.toLocaleString()} | Inserted: ${stats.insertedCanonical.toLocaleString()} | Merged: ${stats.mergedCross.toLocaleString()}`);
      }
    }

    if (stats.qualifiedCandidates >= limit) {
      console.log(`\n   Hit configured limit of ${limit} tracks.`);
      break;
    }
  }

  // Flush remaining batch
  if (batch.length > 0 && !isDryRun) {
    const res = sqliteCatalog.upsertBatch(batch);
    stats.insertedCanonical += res.inserted;
    stats.mergedCross += res.merged;
  }
}

/**
 * Streams through a compressed .sql.gz or plain .sql PostgreSQL incremental diff file.
 */
export async function streamIngestSql(filePath, provider = 'deezer', stats) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`\n📦 Streaming SQL Diff: ${path.basename(filePath)} (Provider: ${provider})`);

  let inputStream = fs.createReadStream(filePath);
  if (filePath.endsWith('.gz')) {
    inputStream = inputStream.pipe(zlib.createGunzip());
  }

  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });
  let batch = [];

  for await (const line of rl) {
    if (!line || !line.startsWith('INSERT INTO')) continue;

    stats.totalLines++;

    // Match column names from INSERT INTO table_name (col1, col2, ...) VALUES
    const colMatch = line.match(/INSERT\s+INTO\s+[a-zA-Z0-9_.]+\s*\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) continue;

    const headers = colMatch[1].split(',').map(h => h.trim().toLowerCase());

    // Extract VALUES (...), (...)
    const valuesPart = line.slice(line.indexOf('VALUES') + 6);
    const tupleMatches = valuesPart.match(/\((?:[^)(]+|\([^)(]*\))*\)/g);

    if (!tupleMatches) continue;

    for (const tuple of tupleMatches) {
      const row = parseSqlInsertTuple(tuple);
      const candidate = mapRowToCandidate(row, headers, provider);

      if (!candidate) continue;

      if (!passesPopularityFloor(candidate)) {
        stats.skippedPopularity++;
        continue;
      }

      if (!isAuthenticCandidate(candidate, { requireSample: false })) {
        stats.skippedAuthenticity++;
        continue;
      }

      stats.qualifiedCandidates++;
      batch.push(candidate);

      if (batch.length >= batchSize) {
        if (!isDryRun) {
          const res = sqliteCatalog.upsertBatch(batch);
          stats.insertedCanonical += res.inserted;
          stats.mergedCross += res.merged;
        }
        batch = [];

        if (stats.qualifiedCandidates % 100000 === 0 && !isDryRun) {
          sqliteCatalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        }

        if (stats.qualifiedCandidates % 10000 === 0) {
          process.stdout.write(`\r   Qualified: ${stats.qualifiedCandidates.toLocaleString()} | Inserted: ${stats.insertedCanonical.toLocaleString()} | Merged: ${stats.mergedCross.toLocaleString()}`);
        }
      }

      if (stats.qualifiedCandidates >= limit) break;
    }

    if (stats.qualifiedCandidates >= limit) {
      console.log(`\n   Hit configured limit of ${limit} tracks.`);
      break;
    }
  }

  if (batch.length > 0 && !isDryRun) {
    const res = sqliteCatalog.upsertBatch(batch);
    stats.insertedCanonical += res.inserted;
    stats.mergedCross += res.merged;
  }
}

async function main() {
  const startTime = Date.now();
  console.log('🎵 Anagroove MusicMoveArr Dataset Ingestor (Scenario C)');
  console.log(`   Popularity floor: Spotify >= ${minPopularity} or the language's Deezer rank floor`);
  console.log(`   Sample Hydration: LAZY (on-the-fly JIT during gameplay)`);
  console.log(`   Dry Run: ${isDryRun ? 'YES (No DB Writes)' : 'NO (Persisting to SQLite)'}`);

  const initialDbStats = !isDryRun ? sqliteCatalog.getStats() : null;
  if (initialDbStats) {
    const samples = initialDbStats.audioSamples ?? initialDbStats.samples ?? 0;
    console.log(`   Initial DB: ${(initialDbStats.tracks || 0).toLocaleString()} tracks | ${(initialDbStats.artists || 0).toLocaleString()} artists | ${samples.toLocaleString()} samples`);
  }

  const stats = {
    totalLines: 0,
    qualifiedCandidates: 0,
    skippedPopularity: 0,
    skippedAuthenticity: 0,
    insertedCanonical: 0,
    mergedCross: 0,
  };

  try {
    if (csvFilePath) {
      await streamIngestCsv(csvFilePath, providerOverride, stats);
    } else if (sqlFilePath) {
      await streamIngestSql(sqlFilePath, providerOverride, stats);
    } else if (baseDirPath) {
      const files = fs.readdirSync(baseDirPath).filter(f => f.endsWith('.csv') || f.endsWith('.tsv'));
      for (const file of files) {
        const fullPath = path.join(baseDirPath, file);
        const inferredProvider = file.toLowerCase().includes('spotify') ? 'spotify'
          : file.toLowerCase().includes('tidal') ? 'tidal'
          : file.toLowerCase().includes('musicbrainz') ? 'musicbrainz'
          : 'deezer';
        await streamIngestCsv(fullPath, inferredProvider, stats);
      }
    } else if (incrementalDirPath) {
      const files = fs.readdirSync(incrementalDirPath).filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz')).sort();
      for (const file of files) {
        const fullPath = path.join(incrementalDirPath, file);
        await streamIngestSql(fullPath, providerOverride, stats);
      }
    } else {
      console.log(USAGE);
      process.exitCode = 1;
      return;
    }

    if (!isDryRun) {
      sqliteCatalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n🎉 Ingestion Completed in ${elapsedSec}s!`);
    console.log(`   Lines Processed: ${stats.totalLines.toLocaleString()}`);
    console.log(`   Below the popularity floor: ${stats.skippedPopularity.toLocaleString()}`);
    console.log(`   Filtered by Authenticity: ${stats.skippedAuthenticity.toLocaleString()}`);
    console.log(`   Qualified Tracks: ${stats.qualifiedCandidates.toLocaleString()}`);
    console.log(`   Newly Inserted Canonical Tracks: ${stats.insertedCanonical.toLocaleString()}`);
    console.log(`   Cross-Referenced / Merged Tracks: ${stats.mergedCross.toLocaleString()}`);

    if (!isDryRun) {
      const finalStats = sqliteCatalog.getStats();
      const finalSamples = finalStats.audioSamples ?? finalStats.samples ?? 0;
      const finalCross = finalStats.crossReferencedTracks ?? finalStats.crossReferenced ?? 0;
      console.log(`\n📊 Final SQLite Catalog Status:`);
      console.log(`   Total Canonical Tracks: ${(finalStats.tracks || 0).toLocaleString()}`);
      console.log(`   Total Unique Artists: ${(finalStats.artists || 0).toLocaleString()}`);
      console.log(`   Total Cross-Referenced: ${finalCross.toLocaleString()}`);
      console.log(`   Total Audio Samples: ${finalSamples.toLocaleString()}`);
    }
  } catch (err) {
    console.error(`\n❌ Ingestion failed: ${err.message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
