import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AnimeCatalog } from '../server/db/animeCatalog.ts';
import { scanSourceOggFiles, generateSamplesForFile, type SampleRecord } from './generate_anime_samples.ts';
import { normalizeAnimeSlugKey, type AnimeMetadataIndex, type AnimeThemeMetadata } from './sync_anime_metadata.ts';
import { findFfmpegPath, findFfprobePath } from '../server/services/ffmpegHelper.ts';
import { intFlag, parseFlags, parseOrExit } from './lib/cli.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'data', 'Anime OPED');
const INDEX_PATH = path.join(ROOT_DIR, 'data', 'anime_metadata_index.json');
const SAMPLES_DIR = path.join(ROOT_DIR, 'data', 'anime_samples');

/** Index metadata for a file, or a guess from its name (isFallback). */
type ThemeMetadata = Omit<AnimeThemeMetadata, 'animeId' | 'animeSlug' | 'artists'> & { isFallback?: boolean };

function parseFilenameFallback(relFile: string): ThemeMetadata {
  const parts = relFile.replace(/\\/g, '/').split('/');
  const year = parts.length > 2 && /^\d{4}$/.test(parts[0]) ? parseInt(parts[0], 10) : null;
  const season = parts.length > 2 ? parts[1] : null;
  const filename = parts[parts.length - 1];
  const baseName = path.basename(filename, path.extname(filename));

  const match = baseName.match(/^([A-Za-z0-9]+)-(OP|ED)(\d+)/i);
  if (match) {
    // Insert spaces before capital letters: "ArgentoSoma" -> "Argento Soma"
    const rawSlug = match[1];
    const spacedTitle = rawSlug.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9]+)/g, ' $1 ').trim();
    const themeType = match[2].toUpperCase();
    const themeNum = parseInt(match[3], 10);
    return {
      animeTitle: spacedTitle,
      songTitle: `${themeType} ${themeNum}`,
      artistName: `${spacedTitle} Cast / OST`,
      themeType,
      themeNumber: themeNum,
      themeSlug: `${themeType}${themeNum}`,
      year,
      season,
      malId: null,
      anilistId: null,
      isFallback: true,
    };
  }

  return {
    animeTitle: baseName,
    songTitle: baseName,
    artistName: 'Anime Themes',
    themeType: 'OP',
    themeNumber: 1,
    themeSlug: 'OP1',
    year,
    season,
    malId: null,
    anilistId: null,
    isFallback: true,
  };
}

export async function ingestAnimeCatalog({
  generateSamples = false,
  limit = null,
}: { generateSamples?: boolean; limit?: number | null } = {}) {
  console.log('======================================================');
  console.log('       ANAGROOVE ANIME OP/ED CATALOG INGESTOR        ');
  console.log('======================================================\n');

  let metadataIndex: AnimeMetadataIndex = { byBasename: {}, bySlugKey: {} };
  if (fs.existsSync(INDEX_PATH)) {
    console.log(`[AnimeIngest] Loading metadata index from ${INDEX_PATH}...`);
    metadataIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    console.log(`[AnimeIngest] Loaded ${Object.keys(metadataIndex.byBasename || {}).length} basename entries and ${Object.keys(metadataIndex.bySlugKey || {}).length} slug entries.`);
  } else {
    console.warn(`[AnimeIngest] Warning: ${INDEX_PATH} not found. Fallback parsing will be used.`);
  }

  const catalog = new AnimeCatalog();
  const ffmpegBin = generateSamples ? findFfmpegPath() : null;
  const ffprobeBin = generateSamples ? findFfprobePath() : null;

  console.log(`[AnimeIngest] Scanning source OGG files from ${SOURCE_DIR}...`);
  let files = scanSourceOggFiles(SOURCE_DIR);
  console.log(`[AnimeIngest] Total audio files found: ${files.length}`);

  if (limit && limit > 0) {
    files = files.slice(0, limit);
    console.log(`[AnimeIngest] Limit applied: ${files.length} files.`);
  }

  let exactMatches = 0;
  let slugMatches = 0;
  let fallbackMatches = 0;
  let totalSamplesLinked = 0;

  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const relFile = files[i];
    const baseName = path.basename(relFile, path.extname(relFile));
    const baseLower = baseName.toLowerCase();
    const slugKey = normalizeAnimeSlugKey(baseName);

    let meta: ThemeMetadata | undefined = metadataIndex.byBasename[baseLower];
    if (meta) {
      exactMatches++;
    } else {
      meta = metadataIndex.bySlugKey[slugKey];
      if (meta) {
        slugMatches++;
      } else {
        meta = parseFilenameFallback(relFile);
        fallbackMatches++;
      }
    }

    // Extract year and season from directory structure if not in metadata
    const parts = relFile.replace(/\\/g, '/').split('/');
    const dirYear = parts.length > 2 && /^\d{4}$/.test(parts[0]) ? parseInt(parts[0], 10) : null;
    const dirSeason = parts.length > 2 ? parts[1] : null;

    const trackId = catalog.upsertAnimeTrack({
      animeTitle: meta.animeTitle,
      songTitle: meta.songTitle,
      artistName: meta.artistName,
      themeType: meta.themeType || 'OP',
      themeNumber: meta.themeNumber || 1,
      themeSlug: meta.themeSlug || `${meta.themeType || 'OP'}${meta.themeNumber || 1}`,
      year: meta.year || dirYear || null,
      season: meta.season || dirSeason || null,
      malId: meta.malId || null,
      anilistId: meta.anilistId || null,
      originalFilePath: relFile.replace(/\\/g, '/'),
      durationMs: 90000,
      popularity: meta.isFallback ? 60 : 85,
    });
    if (trackId === undefined) throw new Error(`No anime_tracks row after the upsert of ${relFile}`);

    // Generate or link 2-3 sample variations
    const relDir = path.dirname(relFile);
    let sampleRecords: SampleRecord[] = [];

    if (generateSamples && ffmpegBin) {
      sampleRecords = generateSamplesForFile({
        relativeFilePath: relFile,
        ffmpegBin,
        ffprobeBin,
      });
    } else {
      // Check existing files on disk
      for (const idx of [1, 2, 3]) {
        const outFilename = `${baseName}_s${idx}.ogg`;
        const sampleDiskPath = path.join(SAMPLES_DIR, relDir, outFilename);
        if (fs.existsSync(sampleDiskPath)) {
          const sampleRel = path.join(relDir, outFilename).replace(/\\/g, '/');
          sampleRecords.push({
            index: idx,
            filePath: sampleDiskPath,
            url: `/audio/anime/${sampleRel}`,
            offset: idx === 1 ? 5 : idx === 2 ? 35 : 65,
            duration: 20,
          });
        }
      }
    }

    for (const s of sampleRecords) {
      catalog.insertSample({
        animeTrackId: trackId,
        sampleIndex: s.index,
        samplePath: s.filePath,
        sampleUrl: s.url,
        offsetSeconds: s.offset,
        durationSeconds: s.duration,
      });
      totalSamplesLinked++;
    }

    if ((i + 1) % 1000 === 0 || i === files.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[AnimeIngest] Ingested ${i + 1}/${files.length} tracks (${totalSamplesLinked} samples linked) in ${elapsed}s...`);
    }
  }

  const stats = catalog.getStats();
  console.log('\n======================================================');
  console.log('            ANIME CATALOG INGESTION COMPLETE          ');
  console.log('======================================================');
  console.log(`Total Tracks Ingested:      ${stats.totalTracks}`);
  console.log(`   - Exact Basename Match:  ${exactMatches}`);
  console.log(`   - Normalized Slug Match: ${slugMatches}`);
  console.log(`   - Heuristic Fallbacks:   ${fallbackMatches}`);
  console.log(`Total Openings (OP):        ${stats.totalOps}`);
  console.log(`Total Endings (ED):         ${stats.totalEds}`);
  console.log(`Audio Samples Linked:       ${stats.totalSamples} across ${stats.tracksWithSamples} tracks (${stats.sampleCoveragePct}%)`);
  console.log(`Year Range:                 ${stats.minYear} - ${stats.maxYear}`);
  console.log('======================================================\n');

  return stats;
}

if (import.meta.main) {
  const { genSamples, limit } = parseOrExit(() => {
    const values = parseFlags({ 'generate-samples': { type: 'boolean' }, limit: { type: 'string' } });
    return { genSamples: Boolean(values['generate-samples']), limit: intFlag(values, 'limit') ?? null };
  }, 'npm run anime:ingest -- [--generate-samples] [--limit=N]');

  ingestAnimeCatalog({ generateSamples: genSamples, limit })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[AnimeIngest] Fatal error:', err);
      process.exit(1);
    });
}
