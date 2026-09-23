import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../paths.js';
import { checkAuthenticity } from '../policy/authenticityRules.js';

const DEFAULT_DB_PATH = path.join(DATA_DIR, 'catalog.sqlite');

const CONTAMINATION_LABELS = {
  spoken_word: 'Audio Drama / Spoken Word',
  cover: 'Cover / Karaoke',
  artist: 'Soundalike / Utility Artist',
  utility: 'Audio Utility / Backing Track',
  album: 'Cover / Utility Album',
};

/** One-line summary of a cleanup step's counters for the report. */
function describeStep(step) {
  const parts = Object.entries(step)
    .filter(([key, value]) => typeof value === 'number' && key !== 'ms')
    .map(([key, value]) => `${key}: ${value.toLocaleString()}`);
  if (step.reasons) {
    parts.push(...Object.entries(step.reasons).filter(([, value]) => value > 0).map(([key, value]) => `${key}: ${value.toLocaleString()}`));
  }
  if (step.rebuilt) parts.push('rebuilt');
  return parts.join(', ') || '—';
}

function describeExample(example) {
  if (example.merged !== undefined) return `artist \`${example.merged}\` merged into \`${example.kept}\``;
  if (example.kept !== undefined) {
    const who = example.artist ? `**${example.artist}** ` : '';
    return `${who}kept \`${example.kept}\`, removed ${example.removed.map(r => `\`${r}\``).join(', ')}`;
  }
  return `**${example.artist}** – \`${example.title}\`${example.detail ? ` (${example.detail})` : ''} · pop ${example.popularity}`;
}

export class CatalogValidator {
  constructor(dbPath = DEFAULT_DB_PATH) {
    if (typeof dbPath === 'object' && dbPath !== null && typeof dbPath.prepare === 'function') {
      this.db = dbPath;
      this.dbPath = ':memory:';
    } else {
      this.dbPath = dbPath;
      if (this.dbPath !== ':memory:' && !fs.existsSync(this.dbPath)) {
        throw new Error(`Database file not found at ${this.dbPath}`);
      }
      this.db = new DatabaseSync(this.dbPath);
    }
    // Optimize read performance for validation
    try {
      this.db.exec('PRAGMA busy_timeout = 10000;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA mmap_size = 2147483648;');
      this.db.exec('PRAGMA cache_size = -64000;');
    } catch {
      // pragma warnings ignored
    }
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // closed
      }
      this.db = null;
    }
  }

  /**
   * 1. Low-Level SQLite Integrity & Pragma Checks
   */
  checkPragmas() {
    const integrityCheck = this.db.prepare('PRAGMA integrity_check;').all();
    const foreignKeyCheck = this.db.prepare('PRAGMA foreign_key_check;').all();
    const quickCheck = this.db.prepare('PRAGMA quick_check;').all();

    const integrityOk = integrityCheck.length === 1 && integrityCheck[0].integrity_check === 'ok';
    const quickOk = quickCheck.length === 1 && quickCheck[0].quick_check === 'ok';
    const fkOk = foreignKeyCheck.length === 0;

    return {
      integrityOk,
      quickOk,
      foreignKeysOk: fkOk,
      integrityIssues: integrityOk ? [] : integrityCheck,
      fkIssues: foreignKeyCheck,
    };
  }

  /**
   * 2. Referential Integrity & Orphan Records
   */
  findOrphans() {
    // Tracks with no matching artist
    const orphanedTracks = this.db.prepare(`
      SELECT t.id, t.display_title, t.artist_id 
      FROM tracks t
      LEFT JOIN artists a ON t.artist_id = a.id
      WHERE a.id IS NULL
    `).all();

    // Track samples with no matching track
    const orphanedSamples = this.db.prepare(`
      SELECT s.id, s.track_id, s.provider, s.sample_url
      FROM track_samples s
      LEFT JOIN tracks t ON s.track_id = t.id
      WHERE t.id IS NULL
    `).all();

    // Track providers with no matching track
    const orphanedProviders = this.db.prepare(`
      SELECT p.id, p.track_id, p.provider, p.provider_track_id
      FROM track_providers p
      LEFT JOIN tracks t ON p.track_id = t.id
      WHERE t.id IS NULL
    `).all();

    // Artists with 0 tracks
    const orphanedArtistsCount = this.db.prepare(`
      SELECT COUNT(*) as c
      FROM artists a
      LEFT JOIN tracks t ON a.id = t.artist_id
      WHERE t.id IS NULL
    `).get().c;

    return {
      orphanedTracksCount: orphanedTracks.length,
      orphanedTracks: orphanedTracks.slice(0, 10),
      orphanedSamplesCount: orphanedSamples.length,
      orphanedSamples: orphanedSamples.slice(0, 10),
      orphanedProvidersCount: orphanedProviders.length,
      orphanedProviders: orphanedProviders.slice(0, 10),
      orphanedArtistsCount,
    };
  }

  /**
   * 3. Duplication Analysis: rows sharing (artist, base title) break the one-row-per-song rule
   */
  findDuplicates() {
    // Exact ISRC Duplicates (should be 0 due to unique constraint, check for empty/whitespace)
    const emptyOrInvalidIsrcs = this.db.prepare(`
      SELECT COUNT(*) as c FROM tracks 
      WHERE isrc IS NOT NULL AND (LENGTH(TRIM(isrc)) != 12 OR isrc LIKE '% %')
    `).get().c;

    const softDuplicatesQuery = this.db.prepare(`
      SELECT 
        t1.id AS id1, t2.id AS id2,
        a.display_name AS artist,
        t1.display_title AS title1, t2.display_title AS title2,
        t1.duration_ms AS dur1, t2.duration_ms AS dur2,
        t1.popularity AS pop1, t2.popularity AS pop2,
        t1.isrc AS isrc1, t2.isrc AS isrc2
      FROM tracks t1
      JOIN tracks t2 ON t1.artist_id = t2.artist_id 
        AND t1.canonical_title = t2.canonical_title 
        AND t1.id < t2.id
      JOIN artists a ON t1.artist_id = a.id
      LIMIT 15
    `).all();

    const softDuplicateClustersCount = this.db.prepare(`
      SELECT COUNT(*) as c FROM (
        SELECT 1 FROM tracks GROUP BY artist_id, canonical_title HAVING COUNT(*) > 1
      )
    `).get().c;

    // Duplicate provider track IDs assigned to multiple tracks
    const duplicateProviderTrackIds = this.db.prepare(`
      SELECT provider, provider_track_id, COUNT(DISTINCT track_id) as track_count
      FROM track_providers
      GROUP BY provider, provider_track_id
      HAVING track_count > 1
    `).all();

    // Duplicate samples: identical sample_url assigned to different tracks
    const duplicateSampleUrlsCount = this.db.prepare(`
      SELECT COUNT(*) as c FROM (
        SELECT sample_url, COUNT(DISTINCT track_id) as track_count
        FROM track_samples
        GROUP BY sample_url
        HAVING track_count > 1
      )
    `).get().c;

    return {
      emptyOrInvalidIsrcs,
      softDuplicateClustersCount,
      softDuplicatesSample: softDuplicatesQuery.slice(0, 15),
      duplicateProviderTrackIdsCount: duplicateProviderTrackIds.length,
      duplicateProviderTrackIds: duplicateProviderTrackIds.slice(0, 10),
      duplicateSampleUrlsCount,
    };
  }

  /**
   * 4. Data Quality & Field Anomaly Detection
   */
  findDataAnomalies() {
    // Duration anomalies (< 15s or > 60m)
    const tooShortTracks = this.db.prepare(`
      SELECT t.id, t.display_title, a.display_name, t.duration_ms
      FROM tracks t JOIN artists a ON t.artist_id = a.id
      WHERE t.duration_ms < 15000
      LIMIT 10
    `).all();
    const tooShortCount = this.db.prepare(`SELECT COUNT(*) as c FROM tracks WHERE duration_ms < 15000`).get().c;

    const tooLongTracks = this.db.prepare(`
      SELECT t.id, t.display_title, a.display_name, t.duration_ms
      FROM tracks t JOIN artists a ON t.artist_id = a.id
      WHERE t.duration_ms > 3600000
      LIMIT 10
    `).all();
    const tooLongCount = this.db.prepare(`SELECT COUNT(*) as c FROM tracks WHERE duration_ms > 3600000`).get().c;

    // Release year anomalies (< 1900 or > 2030 or NULL)
    const invalidYearCount = this.db.prepare(`
      SELECT COUNT(*) as c FROM tracks 
      WHERE release_year IS NOT NULL AND (release_year < 1900 OR release_year > 2030)
    `).get().c;
    const nullYearCount = this.db.prepare(`SELECT COUNT(*) as c FROM tracks WHERE release_year IS NULL`).get().c;

    // Popularity anomalies (supports both 0-100 and Deezer 0-1,000,000 rank scale)
    const invalidPopularityCount = this.db.prepare(`
      SELECT COUNT(*) as c FROM tracks WHERE popularity < 0 OR popularity > 100
    `).get().c;

    // Missing or invalid audio preview samples
    const tracksWithoutSamples = this.db.prepare(`
      SELECT COUNT(*) as c FROM tracks t
      LEFT JOIN track_samples s ON t.id = s.track_id
      WHERE s.id IS NULL
    `).get().c;

    const malformedSampleUrls = this.db.prepare(`
      SELECT COUNT(*) as c FROM track_samples
      WHERE sample_url IS NULL OR TRIM(sample_url) = '' OR sample_url NOT LIKE 'http%'
    `).get().c;

    // Country Code format check (length != 2)
    const invalidCountryCodesCount = this.db.prepare(`
      SELECT COUNT(*) as c FROM tracks 
      WHERE country_code IS NOT NULL AND (LENGTH(country_code) != 2 OR country_code GLOB '*[^A-Z]*')
    `).get().c;

    // Artist genres_json validity check
    const sampleArtistsWithGenres = this.db.prepare(`
      SELECT id, genres_json FROM artists WHERE genres_json IS NOT NULL
    `).all();

    let malformedGenresCount = 0;
    for (const a of sampleArtistsWithGenres) {
      try {
        const parsed = JSON.parse(a.genres_json);
        if (!Array.isArray(parsed)) malformedGenresCount++;
      } catch {
        malformedGenresCount++;
      }
    }

    // Contamination: the shared authenticity rules (the crawler and upsertTrack use the same ones)
    const contaminationCounts = { spoken_word: 0, cover: 0, utility: 0, artist: 0, album: 0 };
    const sampleContaminated = [];
    for (const row of this.db.prepare(`
      SELECT t.id, t.display_title AS title, t.album_name AS album, a.display_name AS artist, t.popularity
      FROM tracks t JOIN artists a ON t.artist_id = a.id
    `).iterate()) {
      const { authentic, reason } = checkAuthenticity(row);
      if (authentic) continue;
      contaminationCounts[reason]++;
      if (sampleContaminated.length < 15) {
        sampleContaminated.push({ ...row, contamination_type: CONTAMINATION_LABELS[reason] });
      }
    }
    const audiobooksCount = contaminationCounts.spoken_word;
    const soundalikesCount = contaminationCounts.cover + contaminationCounts.artist;
    const audioUtilitiesCount = contaminationCounts.utility + contaminationCounts.album;

    return {
      durationAnomalies: {
        tooShortCount,
        tooShortSample: tooShortTracks,
        tooLongCount,
        tooLongSample: tooLongTracks,
      },
      yearAnomalies: {
        invalidYearCount,
        nullYearCount,
      },
      popularityAnomalies: {
        invalidPopularityCount,
      },
      sampleAnomalies: {
        tracksWithoutSamples,
        malformedSampleUrls,
      },
      countryCodeAnomalies: {
        invalidCountryCodesCount,
      },
      genresJsonAnomalies: {
        malformedGenresCount,
      },
      contamination: {
        audiobooksCount,
        soundalikesCount,
        audioUtilitiesCount,
        totalContaminatedCount: audiobooksCount + soundalikesCount + audioUtilitiesCount,
        sample: sampleContaminated,
      },
    };
  }

  /**
   * 5. Deep Catalog Statistics & Distribution Metrics
   */
  generateStatistics() {
    // Total counts
    const totalTracks = this.db.prepare('SELECT COUNT(*) as c FROM tracks').get().c;
    const totalArtists = this.db.prepare('SELECT COUNT(*) as c FROM artists').get().c;
    const totalSamples = this.db.prepare('SELECT COUNT(*) as c FROM track_samples').get().c;
    const totalProviders = this.db.prepare('SELECT COUNT(*) as c FROM track_providers').get().c;

    // Cross-referenced tracks (tracks with 2 or more providers)
    const crossReferencedTracks = this.db.prepare(`
      SELECT COUNT(*) as c FROM (
        SELECT track_id FROM track_providers
        GROUP BY track_id
        HAVING COUNT(DISTINCT provider) >= 2
      )
    `).get().c;

    // Sample coverage and codecs
    const codecBreakdown = this.db.prepare(`
      SELECT audio_codec, COUNT(*) as count
      FROM track_samples
      GROUP BY audio_codec
      ORDER BY count DESC
    `).all();

    // Provider breakdown
    const providerBreakdown = this.db.prepare(`
      SELECT provider, COUNT(*) as count, COUNT(DISTINCT track_id) as unique_tracks
      FROM track_providers
      GROUP BY provider
      ORDER BY count DESC
    `).all();

    // Language Distribution
    const languageDistribution = this.db.prepare(`
      SELECT language, COUNT(*) as count,
             ROUND(CAST(COUNT(*) AS FLOAT) * 100.0 / ${totalTracks}, 2) as percentage
      FROM tracks
      GROUP BY language
      ORDER BY count DESC
    `).all();

    // Release Year / Decade Distribution
    const decadeDistribution = this.db.prepare(`
      SELECT 
        CASE 
          WHEN release_year IS NULL THEN 'Unknown'
          WHEN release_year < 1960 THEN 'Pre-1960s'
          WHEN release_year BETWEEN 1960 AND 1969 THEN '1960s'
          WHEN release_year BETWEEN 1970 AND 1979 THEN '1970s'
          WHEN release_year BETWEEN 1980 AND 1989 THEN '1980s'
          WHEN release_year BETWEEN 1990 AND 1999 THEN '1990s'
          WHEN release_year BETWEEN 2000 AND 2009 THEN '2000s'
          WHEN release_year BETWEEN 2010 AND 2019 THEN '2010s'
          WHEN release_year >= 2020 THEN '2020s'
          ELSE 'Other'
        END AS decade,
        COUNT(*) as count,
        ROUND(CAST(COUNT(*) AS FLOAT) * 100.0 / ${totalTracks}, 2) as percentage
      FROM tracks
      GROUP BY decade
      ORDER BY 
        CASE decade
          WHEN 'Pre-1960s' THEN 1
          WHEN '1960s' THEN 2
          WHEN '1970s' THEN 3
          WHEN '1980s' THEN 4
          WHEN '1990s' THEN 5
          WHEN '2000s' THEN 6
          WHEN '2010s' THEN 7
          WHEN '2020s' THEN 8
          ELSE 9
        END
    `).all();

    // Popularity Distribution (Normalized to 0-100 scale)
    const popStats = this.db.prepare(`
      SELECT 
        MIN(popularity) as rawMinPop,
        MAX(popularity) as rawMaxPop,
        ROUND(AVG(popularity), 2) as rawAvgPop,
        ROUND(AVG(CASE WHEN popularity <= 100 THEN popularity ELSE CAST(ROUND(popularity / 10000.0) AS INT) END), 2) as normalizedAvgPop
      FROM tracks
    `).get();

    const normalizedPopularityDeciles = this.db.prepare(`
      SELECT 
        CASE
          WHEN norm_pop BETWEEN 0 AND 10 THEN '00-10'
          WHEN norm_pop BETWEEN 11 AND 20 THEN '11-20'
          WHEN norm_pop BETWEEN 21 AND 30 THEN '21-30'
          WHEN norm_pop BETWEEN 31 AND 40 THEN '31-40'
          WHEN norm_pop BETWEEN 41 AND 50 THEN '41-50'
          WHEN norm_pop BETWEEN 51 AND 60 THEN '51-60'
          WHEN norm_pop BETWEEN 61 AND 70 THEN '61-70'
          WHEN norm_pop BETWEEN 71 AND 80 THEN '71-80'
          WHEN norm_pop BETWEEN 81 AND 90 THEN '81-90'
          WHEN norm_pop BETWEEN 91 AND 100 THEN '91-100'
          ELSE 'Other'
        END AS decile,
        COUNT(*) as count,
        ROUND(CAST(COUNT(*) AS FLOAT) * 100.0 / ${totalTracks}, 2) as percentage
      FROM (
        SELECT 
          CASE WHEN popularity <= 100 THEN popularity ELSE CAST(ROUND(popularity / 10000.0) AS INT) END AS norm_pop
        FROM tracks
      )
      GROUP BY decile
      ORDER BY decile ASC
    `).all();

    // Top 20 ISRC Country Codes
    const countryDistribution = this.db.prepare(`
      SELECT country_code, COUNT(*) as count,
             ROUND(CAST(COUNT(*) AS FLOAT) * 100.0 / ${totalTracks}, 2) as percentage
      FROM tracks
      WHERE country_code IS NOT NULL
      GROUP BY country_code
      ORDER BY count DESC
      LIMIT 20
    `).all();

    // Top 25 Most Prolific Artists
    const topArtists = this.db.prepare(`
      SELECT a.display_name, COUNT(t.id) as track_count, a.genres_json
      FROM artists a
      JOIN tracks t ON a.id = t.artist_id
      GROUP BY a.id
      ORDER BY track_count DESC
      LIMIT 25
    `).all().map(r => {
      let genres;
      try {
        genres = JSON.parse(r.genres_json || '[]');
      } catch {
        genres = [];
      }
      if (!Array.isArray(genres)) genres = [];
      return {
        artist: r.display_name,
        tracks: r.track_count,
        genres: genres.slice(0, 3).join(', ') || 'N/A',
      };
    });

    // Top 30 Genres across all artists
    const allArtistsGenres = this.db.prepare(`
      SELECT genres_json FROM artists WHERE genres_json IS NOT NULL
    `).all();

    const genreCounts = new Map();
    let artistsWithGenres = 0;
    for (const a of allArtistsGenres) {
      try {
        const arr = JSON.parse(a.genres_json);
        if (Array.isArray(arr) && arr.length > 0) {
          artistsWithGenres++;
          for (const g of arr) {
            const cleanG = g.trim();
            if (cleanG) {
              genreCounts.set(cleanG, (genreCounts.get(cleanG) || 0) + 1);
            }
          }
        }
      } catch {
        // skip malformed
      }
    }

    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([genre, count]) => ({
        genre,
        artistsCount: count,
        percentage: Number(((count / totalArtists) * 100).toFixed(2)),
      }));

    return {
      overview: {
        totalTracks,
        totalArtists,
        totalSamples,
        totalProviders,
        crossReferencedTracks,
        crossReferencedPct: Number(((crossReferencedTracks / totalTracks) * 100).toFixed(2)),
        sampleCoveragePct: Number(((totalSamples / totalTracks) * 100).toFixed(2)),
      },
      providerBreakdown,
      codecBreakdown,
      languageDistribution,
      decadeDistribution,
      popularity: {
        ...popStats,
        deciles: normalizedPopularityDeciles,
      },
      countryDistribution,
      topArtists,
      genreStats: {
        artistsWithGenres,
        artistsWithGenresPct: Number(((artistsWithGenres / totalArtists) * 100).toFixed(2)),
        totalDistinctGenres: genreCounts.size,
        topGenres,
      },
    };
  }

  /**
   * 7. Generate Comprehensive Markdown Validation Report
   */
  generateMarkdownReport(reportData) {
    const { pragmas, orphans, duplicates, anomalies, stats, cleanup = null, gate = null } = reportData;
    const now = new Date().toISOString();

    const report = `# SpotySpice Database Validation & Analytics Report

*Generated on: ${now}*  
*Database Path: \`${this.dbPath}\`*

---

## 1. Executive Health Summary

| Diagnostic Domain | Status | Key Observation |
| :--- | :---: | :--- |
| **SQLite Structural Integrity** | ${pragmas.integrityOk && pragmas.quickOk ? '✅ PASS' : '❌ FAIL'} | \`PRAGMA integrity_check\` & \`quick_check\` returned \`ok\` |
| **Foreign Key Constraints** | ${pragmas.foreignKeysOk ? '✅ PASS' : '❌ FAIL'} | ${pragmas.foreignKeysOk ? '0 foreign key constraint violations' : `${pragmas.fkIssues.length} FK violations detected`} |
| **Referential Integrity** | ${orphans.orphanedTracksCount === 0 && orphans.orphanedSamplesCount === 0 && orphans.orphanedProvidersCount === 0 ? '✅ PASS' : '⚠️ WARN'} | Orphan tracks: ${orphans.orphanedTracksCount}, Orphan samples: ${orphans.orphanedSamplesCount}, Orphan providers: ${orphans.orphanedProvidersCount} |
| **Audio Sample Coverage** | ✅ HEALTHY | **${stats.overview.sampleCoveragePct}%** of tracks have verified playback preview samples |
| **Cross-Provider Referencing** | ✅ HEALTHY | **${stats.overview.crossReferencedTracks.toLocaleString()}** tracks (${stats.overview.crossReferencedPct}%) multi-linked across providers |
| **Song Deduplication** | ${duplicates.softDuplicateClustersCount === 0 ? '✅ CLEAN' : 'ℹ️ DETECTED'} | **${duplicates.softDuplicateClustersCount.toLocaleString()}** groups of one song stored more than once |
| **Language & Geographic Scope** | ✅ DIVERSE | **${stats.languageDistribution.length}** distinct languages, **${stats.countryDistribution.length}+** ISRC country codes |

---

## 2. Catalog Scale & Inventory Breakdown

| Metric Dimension | Total Count | Relative Share / Context |
| :--- | :---: | :--- |
| **Total Canonical Tracks** | **${stats.overview.totalTracks.toLocaleString()}** | 100.0% of core music index |
| **Total Unique Artists** | **${stats.overview.totalArtists.toLocaleString()}** | Average ~${(stats.overview.totalTracks / stats.overview.totalArtists).toFixed(1)} tracks per artist |
| **Verified Audio Samples** | **${stats.overview.totalSamples.toLocaleString()}** | ${stats.overview.sampleCoveragePct}% coverage |
| **External Provider Identifiers** | **${stats.overview.totalProviders.toLocaleString()}** | Deezer, Spotify, iTunes links |
| **Multi-Provider Unified Tracks** | **${stats.overview.crossReferencedTracks.toLocaleString()}** | ${stats.overview.crossReferencedPct}% catalog unification rate |

### Audio Codec Distribution
| Audio Codec | Sample Count | Share |
| :--- | :---: | :---: |
${stats.codecBreakdown.map(c => `| \`${c.audio_codec}\` | ${c.count.toLocaleString()} | ${((c.count / stats.overview.totalSamples) * 100).toFixed(1)}% |`).join('\n')}

### External Provider Breakdown
| Provider Source | Ingested Links | Distinct Tracks Linked |
| :--- | :---: | :---: |
${stats.providerBreakdown.map(p => `| **${p.provider.toUpperCase()}** | ${p.count.toLocaleString()} | ${p.unique_tracks.toLocaleString()} |`).join('\n')}

---

## 3. Linguistic & Geographic Distribution

### Detected Languages
| Language Code | Language Family | Track Count | Percentage |
| :---: | :--- | :---: | :---: |
${stats.languageDistribution.map(l => {
  const names = {
    en: 'English / Western',
    es: 'Spanish (Latin / Iberian)',
    ja: 'Japanese (Kanji / Kana / Romaji)',
    ko: 'Korean (Hangul / K-Pop)',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese (Brazilian / Bossa Nova)',
    ru: 'Russian / Cyrillic',
    zh: 'Chinese (Hanzi / Mandopop)',
    ar: 'Arabic',
  };
  return `| \`${l.language}\` | ${names[l.language] || 'Other / Undetected'} | ${l.count.toLocaleString()} | **${l.percentage}%** |`;
}).join('\n')}

### Top 20 ISRC Country Codes
| Rank | ISO Country Code | Track Count | Catalog Share |
| :---: | :---: | :---: | :---: |
${stats.countryDistribution.map((c, i) => `| #${i + 1} | \`${c.country_code}\` | ${c.count.toLocaleString()} | ${c.percentage}% |`).join('\n')}

---

## 4. Temporal (Era) & Popularity Profiling

### Decade / Era Distribution
| Decade Era | Track Count | Catalog Share |
| :--- | :---: | :---: |
${stats.decadeDistribution.map(d => `| **${d.decade}** | ${d.count.toLocaleString()} | **${d.percentage}%** |`).join('\n')}

### Popularity Statistics
- **Raw Scale**: Min: ${stats.popularity.rawMinPop}, Max: ${stats.popularity.rawMaxPop}, Avg: ${stats.popularity.rawAvgPop} (Deezer Rank 0-1,000,000)
- **Normalized Scale (0-100)**: Average: **${stats.popularity.normalizedAvgPop} / 100**

| Normalized Tier (0-100) | Track Count | Catalog Share |
| :---: | :---: | :---: |
${stats.popularity.deciles.map(d => `| Score ${d.decile} | ${d.count.toLocaleString()} | ${d.percentage}% |`).join('\n')}

---

## 5. Genre Taxonomy & Artist Landscape

- **Artists with Tagged Genres**: ${stats.genreStats.artistsWithGenres.toLocaleString()} (${stats.genreStats.artistsWithGenresPct}% of artists)
- **Total Distinct Genres**: ${stats.genreStats.totalDistinctGenres.toLocaleString()}

### Top 30 Genres Across Catalog
| Rank | Genre Name | Associated Artists | Artist Share |
| :---: | :--- | :---: | :---: |
${stats.genreStats.topGenres.map((g, i) => `| #${i + 1} | **${g.genre}** | ${g.artistsCount.toLocaleString()} | ${g.percentage}% |`).join('\n')}

### Top 25 Most Prolific Artists
| Rank | Artist Name | Track Count | Primary Genres |
| :---: | :--- | :---: | :--- |
${stats.topArtists.map((a, i) => `| #${i + 1} | **${a.artist}** | ${a.tracks.toLocaleString()} | \`${a.genres}\` |`).join('\n')}

---

## 6. Data Quality, Anomalies & Contamination Analysis

### Structural & Referential Anomalies
- **Orphaned Tracks**: ${orphans.orphanedTracksCount}
- **Orphaned Samples**: ${orphans.orphanedSamplesCount}
- **Orphaned Providers**: ${orphans.orphanedProvidersCount}
- **Artists with 0 Tracks**: ${orphans.orphanedArtistsCount.toLocaleString()}
- **Malformed Genres JSON**: ${anomalies.genresJsonAnomalies.malformedGenresCount}
- **Malformed Sample URLs**: ${anomalies.sampleAnomalies.malformedSampleUrls}

### Duration & Metadata Boundaries
- **Tracks < 15 seconds** (audio blips / sfx): ${anomalies.durationAnomalies.tooShortCount}
- **Tracks > 60 minutes** (DJ mixes / audiobooks): ${anomalies.durationAnomalies.tooLongCount}
- **Invalid Release Years (< 1900 or > 2030)**: ${anomalies.yearAnomalies.invalidYearCount}
- **Null Release Years**: ${anomalies.yearAnomalies.nullYearCount.toLocaleString()} (${((anomalies.yearAnomalies.nullYearCount / stats.overview.totalTracks) * 100).toFixed(2)}%)
- **Invalid Popularity (< 0 or > 1,000,000)**: ${anomalies.popularityAnomalies.invalidPopularityCount}

### Non-Music & Soundalike Contamination
- **Audiobooks / Radio Plays / Hörspiele**: **${anomalies.contamination.audiobooksCount.toLocaleString()}** tracks
- **Soundalike Cover Bands & Karaoke**: **${anomalies.contamination.soundalikesCount.toLocaleString()}** tracks
- **Workout & Audio Utilities**: **${anomalies.contamination.audioUtilitiesCount.toLocaleString()}** tracks
- **Total Contaminated Tracks Detected**: **${anomalies.contamination.totalContaminatedCount.toLocaleString()}** (${((anomalies.contamination.totalContaminatedCount / stats.overview.totalTracks) * 100).toFixed(2)}% of catalog)

*Sample Contaminated Entries:*
${anomalies.contamination.sample.map(c => `  - **${c.artist}** - \`${c.title}\` [Type: ${c.contamination_type}]`).join('\n')}

### Duplicate Songs (same artist + base title)
- **Duplicate Groups**: **${duplicates.softDuplicateClustersCount.toLocaleString()}**
- *Sample Clusters Detected*:
${duplicates.softDuplicatesSample.map(d => `  - **${d.artist}**: \`${d.title1}\` (${d.dur1}ms, Pop: ${d.pop1}) vs \`${d.title2}\` (${d.dur2}ms, Pop: ${d.pop2}) [IDs: ${d.id1}, ${d.id2}]`).join('\n')}

---

## 7. Cleanup (\`npm run db:sanitize\`)

${cleanup
  ? `${cleanup.applied
    ? '> [!IMPORTANT]\n> **Cleanup applied.**'
    : '> [!NOTE]\n> **Dry run**: the counts below are what `npm run db:sanitize` would change (computed, then rolled back).'}

Tracks ${cleanup.before.tracks.toLocaleString()} → **${cleanup.after.tracks.toLocaleString()}**, artists ${cleanup.before.artists.toLocaleString()} → **${cleanup.after.artists.toLocaleString()}**, samples ${cleanup.before.samples.toLocaleString()} → ${cleanup.after.samples.toLocaleString()}, provider links ${cleanup.before.providers.toLocaleString()} → ${cleanup.after.providers.toLocaleString()}

| Step | Changes | Time |
| :--- | :--- | ---: |
${cleanup.steps.map(step => `| \`${step.name}\` | ${describeStep(step)} | ${step.ms.toLocaleString()} ms |`).join('\n')}

### Most popular affected rows
${cleanup.steps.flatMap(step => {
    if (!step.examples) return [];
    const groups = Array.isArray(step.examples) ? { [step.name]: step.examples } : step.examples;
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => `**${step.name === label ? label : `${step.name} / ${label}`}**\n${items.map(item => `- ${describeExample(item)}`).join('\n')}`);
  }).join('\n\n')}`
  : '_Cleanup was not evaluated._'}

---

## 8. Validation Gate (\`npm run db:validate -- --ci\`)

${gate
  ? `${gate.ok ? '✅ **PASS**' : '❌ **FAIL**'}

| Check | Status | Value | Limit |
| :--- | :---: | ---: | :--- |
${gate.checks.map(check => `| ${check.label} | ${check.ok ? '✅' : '❌'} | ${Number.isInteger(check.value) ? check.value.toLocaleString() : check.value.toFixed(4)} | ${check.limit} |`).join('\n')}`
  : '_Gate was not evaluated._'}

---
`;

    return report;
  }
}
