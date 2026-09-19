#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CatalogValidator } from '../server/db/catalogValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const shouldVacuum = args.includes('--vacuum');
const shouldPurgeContamination = args.includes('--purge-contamination');
const shouldCleanOrphanArtists = args.includes('--clean-orphans');
const generateReport = args.includes('--report') || !args.includes('--no-report');
const outputJson = args.includes('--json');

const dbPathArg = args.find(a => a.startsWith('--db='));
const dbPath = dbPathArg ? dbPathArg.split('=')[1] : undefined;

async function main() {
  console.log('\n======================================================');
  console.log('   🔍 SPOTYSPICE DATABASE VALIDATION & SANITIZATION   ');
  console.log('======================================================\n');

  const validator = new CatalogValidator(dbPath);

  try {
    console.log('⏳ Running SQLite Pragma Integrity Checks...');
    const pragmas = validator.checkPragmas();
    console.log(`   PRAGMA integrity_check: ${pragmas.integrityOk ? '✅ OK' : '❌ FAILED'}`);
    console.log(`   PRAGMA foreign_key_check: ${pragmas.foreignKeysOk ? '✅ 0 Violations' : `❌ ${pragmas.fkIssues.length} Violations`}`);

    console.log('\n⏳ Checking Referential Integrity & Orphans...');
    const orphans = validator.findOrphans();
    console.log(`   Orphaned Tracks:     ${orphans.orphanedTracksCount}`);
    console.log(`   Orphaned Samples:    ${orphans.orphanedSamplesCount}`);
    console.log(`   Orphaned Providers:  ${orphans.orphanedProvidersCount}`);
    console.log(`   Orphaned Artists:    ${orphans.orphanedArtistsCount}`);

    console.log('\n⏳ Analyzing Duplicates & Collisions...');
    const duplicates = validator.findDuplicates();
    console.log(`   Invalid/Malformed ISRCs:           ${duplicates.emptyOrInvalidIsrcs}`);
    console.log(`   Soft Duplicate Clusters (<= 3s):   ${duplicates.softDuplicateClustersCount}`);
    console.log(`   Multi-Track Provider IDs:          ${duplicates.duplicateProviderTrackIdsCount}`);
    console.log(`   Reused Sample URLs across Tracks:  ${duplicates.duplicateSampleUrlsCount}`);

    console.log('\n⏳ Analyzing Field Anomalies & Data Quality...');
    const anomalies = validator.findDataAnomalies();
    console.log(`   Duration < 15s:            ${anomalies.durationAnomalies.tooShortCount}`);
    console.log(`   Duration > 60m:            ${anomalies.durationAnomalies.tooLongCount}`);
    console.log(`   Invalid Release Years:     ${anomalies.yearAnomalies.invalidYearCount}`);
    console.log(`   Null Release Years:        ${anomalies.yearAnomalies.nullYearCount.toLocaleString()}`);
    console.log(`   Invalid Popularity:        ${anomalies.popularityAnomalies.invalidPopularityCount}`);
    console.log(`   Tracks without Samples:    ${anomalies.sampleAnomalies.tracksWithoutSamples.toLocaleString()}`);
    console.log(`   Malformed Sample URLs:     ${anomalies.sampleAnomalies.malformedSampleUrls}`);
    console.log(`   Malformed Genres JSON:     ${anomalies.genresJsonAnomalies.malformedGenresCount}`);

    console.log('\n⏳ Non-Music & Contamination Scan...');
    console.log(`   Audiobooks / Radio Plays:  ${anomalies.contamination.audiobooksCount.toLocaleString()} tracks`);
    console.log(`   Soundalike Bands/Karaoke:  ${anomalies.contamination.soundalikesCount.toLocaleString()} tracks`);
    console.log(`   Audio Utilities / Mixes:   ${anomalies.contamination.audioUtilitiesCount.toLocaleString()} tracks`);
    console.log(`   Total Contaminated Tracks: ${anomalies.contamination.totalContaminatedCount.toLocaleString()}`);

    console.log('\n⏳ Generating Catalog Statistics & Distributions...');
    const stats = validator.generateStatistics();

    console.log('\n--- 📊 Catalog Scale Summary ---');
    console.log(`   Canonical Tracks:       ${stats.overview.totalTracks.toLocaleString()}`);
    console.log(`   Unique Artists:         ${stats.overview.totalArtists.toLocaleString()}`);
    console.log(`   Audio Samples:          ${stats.overview.totalSamples.toLocaleString()} (${stats.overview.sampleCoveragePct}%)`);
    console.log(`   Provider Links:         ${stats.overview.totalProviders.toLocaleString()}`);
    console.log(`   Unified Multi-Provider: ${stats.overview.crossReferencedTracks.toLocaleString()} (${stats.overview.crossReferencedPct}%)`);
    console.log(`   Average Popularity:     ${stats.popularity.normalizedAvgPop} / 100`);

    console.log('\n--- 🗣️ Language Distribution ---');
    for (const lang of stats.languageDistribution.slice(0, 8)) {
      console.log(`   ${lang.language.padEnd(5)}: ${lang.count.toLocaleString().padStart(8)} tracks (${lang.percentage}%)`);
    }

    console.log('\n--- 📅 Decade Distribution ---');
    for (const dec of stats.decadeDistribution) {
      console.log(`   ${dec.decade.padEnd(12)}: ${dec.count.toLocaleString().padStart(8)} tracks (${dec.percentage}%)`);
    }

    console.log('\n--- 🎸 Top 10 Genres ---');
    for (const g of stats.genreStats.topGenres.slice(0, 10)) {
      console.log(`   ${g.genre.padEnd(20)}: ${g.artistsCount.toLocaleString().padStart(6)} artists (${g.percentage}%)`);
    }

    // Sanitization step
    let sanitizationResult;
    if (shouldFix) {
      console.log('\n⚙️ Executing Live Sanitization (--fix active)...');
      sanitizationResult = validator.sanitize({
        dryRun: false,
        mergeSoftDuplicates: true,
        removeOrphans: true,
        removeOrphanArtists: shouldCleanOrphanArtists,
        purgeContamination: shouldPurgeContamination,
        vacuum: shouldVacuum,
      });
      console.log(`   ✅ Merged ${sanitizationResult.actionsExecuted.duplicatesMerged.toLocaleString()} duplicate clusters`);
      console.log(`   ✅ Removed ${sanitizationResult.actionsExecuted.tracksDeleted.toLocaleString()} redundant tracks`);
      console.log(`   ✅ Cleaned ${sanitizationResult.actionsExecuted.orphansRemoved.samples} orphan samples, ${sanitizationResult.actionsExecuted.orphansRemoved.providers} orphan providers`);
      if (shouldPurgeContamination) {
        console.log(`   ✅ Purged ${sanitizationResult.actionsExecuted.contaminatedPurged.toLocaleString()} contaminated tracks`);
      }
      if (shouldCleanOrphanArtists) {
        console.log(`   ✅ Removed ${sanitizationResult.actionsExecuted.orphansRemoved.artists.toLocaleString()} orphaned artists`);
      }
    } else {
      sanitizationResult = validator.sanitize({ dryRun: true });
      console.log('\nℹ️ Sanitization Dry Run:');
      console.log(`   Proposed soft duplicates to merge:   ${sanitizationResult.proposedActions.softDuplicatesToMerge.toLocaleString()}`);
      console.log(`   Proposed contaminated to purge:      ${sanitizationResult.proposedActions.contaminatedTracksToPurge.toLocaleString()}`);
      console.log(`   Proposed orphaned artists to remove: ${sanitizationResult.proposedActions.orphanedArtistsToRemove.toLocaleString()}`);
      console.log('   (To execute live repair, run: npm run db:sanitize or node scripts/validate_and_sanitize_db.js --fix)');
    }

    const fullResult = {
      pragmas,
      orphans,
      duplicates,
      anomalies,
      stats,
      sanitization: sanitizationResult,
    };

    if (generateReport) {
      const reportMd = validator.generateMarkdownReport(fullResult);
      const reportsDir = path.resolve(__dirname, '../reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      const reportPath = path.join(reportsDir, 'database_validation_report.md');
      fs.writeFileSync(reportPath, reportMd, 'utf8');
      console.log(`\n📄 Comprehensive Report Saved: ${reportPath}`);
    }

    if (outputJson) {
      console.log('\n--- JSON OUTPUT ---');
      console.log(JSON.stringify(fullResult, null, 2));
    }

    console.log('\n======================================================');
    console.log('   🎉 VALIDATION & ANALYSIS COMPLETE                 ');
    console.log('======================================================\n');
  } finally {
    validator.close();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal Validation Error:', err);
  process.exit(1);
});
