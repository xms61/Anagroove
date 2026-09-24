import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { findFfmpegPath, findFfprobePath } from '../server/services/ffmpegHelper.ts';
import { intFlag, parseFlags, parseOrExit } from './lib/cli.js';
import { errorMessage } from '../server/errors.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'data', 'Anime OPED');
const SAMPLES_DIR = path.join(ROOT_DIR, 'data', 'anime_samples');

/** A 20-second clip cut from an anime theme. */
export interface SampleRecord {
  index: number;
  filePath: string;
  url: string;
  offset: number;
  duration: number;
}

export function scanSourceOggFiles(dir = SOURCE_DIR, baseDir = SOURCE_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanSourceOggFiles(full, baseDir));
    } else if (entry.name.toLowerCase().endsWith('.ogg')) {
      results.push(path.relative(baseDir, full));
    }
  }
  return results;
}

export function getAudioDuration(filePath: string, ffprobeBin: string | null): number {
  if (!ffprobeBin) return 90; // Default anime OP/ED duration
  try {
    const stdout = execFileSync(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf8', timeout: 5000 });
    const dur = parseFloat(stdout.trim());
    return isNaN(dur) ? 90 : dur;
  } catch {
    return 90;
  }
}

/**
 * Generates 2-3 distinct 20-second sample variations for an anime theme file.
 */
export function generateSamplesForFile({
  relativeFilePath,
  ffmpegBin,
  ffprobeBin,
  sourceBaseDir = SOURCE_DIR,
  samplesBaseDir = SAMPLES_DIR,
  skipExisting = true,
}: {
  relativeFilePath: string;
  ffmpegBin: string;
  ffprobeBin: string | null;
  sourceBaseDir?: string;
  samplesBaseDir?: string;
  skipExisting?: boolean;
}): SampleRecord[] {
  const fullSource = path.join(sourceBaseDir, relativeFilePath);
  if (!fs.existsSync(fullSource)) return [];

  const relDir = path.dirname(relativeFilePath);
  const baseName = path.basename(relativeFilePath, path.extname(relativeFilePath));
  const outDir = path.join(samplesBaseDir, relDir);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const duration = getAudioDuration(fullSource, ffprobeBin);

  // Define offsets for 2-3 variations:
  // Sample 1: 5s -> 25s (intro / verse)
  // Sample 2: 35s -> 55s (chorus)
  // Sample 3: 65s -> 85s (outro / bridge) - if audio is at least 80s
  const sampleConfigs = [
    { index: 1, offset: 5, duration: 20 },
    { index: 2, offset: 35, duration: 20 },
  ];

  if (duration >= 80) {
    sampleConfigs.push({ index: 3, offset: 65, duration: 20 });
  }

  const createdSamples: SampleRecord[] = [];

  for (const cfg of sampleConfigs) {
    const outFilename = `${baseName}_s${cfg.index}.ogg`;
    const outPath = path.join(outDir, outFilename);
    const relSamplePath = path.join(relDir, outFilename).replace(/\\/g, '/');
    const sampleUrl = `/audio/anime/${relSamplePath}`;

    if (skipExisting && fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      createdSamples.push({
        index: cfg.index,
        filePath: outPath,
        url: sampleUrl,
        offset: cfg.offset,
        duration: cfg.duration,
      });
      continue;
    }

    try {
      execFileSync(ffmpegBin, [
        '-y',
        '-ss', String(cfg.offset),
        '-t', String(cfg.duration),
        '-i', fullSource,
        '-c', 'copy',
        outPath,
      ], { stdio: 'ignore', timeout: 10000 });

      createdSamples.push({
        index: cfg.index,
        filePath: outPath,
        url: sampleUrl,
        offset: cfg.offset,
        duration: cfg.duration,
      });
    } catch (err) {
      console.warn(`[SampleGen] Failed to generate sample ${cfg.index} for ${relativeFilePath}: ${errorMessage(err)}`);
    }
  }

  return createdSamples;
}

export async function generateAllSamples({
  limit = null,
  batchSize = 50,
  skipExisting = true,
}: { limit?: number | null; batchSize?: number; skipExisting?: boolean } = {}) {
  const ffmpegBin = findFfmpegPath();
  const ffprobeBin = findFfprobePath();

  if (!ffmpegBin) {
    throw new Error('FFmpeg binary not found. Please ensure FFmpeg is installed.');
  }

  console.log(`[SampleGen] FFmpeg: ${ffmpegBin}`);
  console.log(`[SampleGen] Scanning source files in ${SOURCE_DIR}...`);

  let files = scanSourceOggFiles();
  console.log(`[SampleGen] Total source files found: ${files.length}`);

  if (limit && limit > 0) {
    files = files.slice(0, limit);
    console.log(`[SampleGen] Limiting processing to ${files.length} files.`);
  }

  let processed = 0;
  let totalSamplesGenerated = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    for (const relFile of batch) {
      const samples = generateSamplesForFile({
        relativeFilePath: relFile,
        ffmpegBin,
        ffprobeBin,
        skipExisting,
      });
      totalSamplesGenerated += samples.length;
      processed++;
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = ((processed / files.length) * 100).toFixed(1);
    console.log(`[SampleGen] Progress: ${processed}/${files.length} (${pct}%) in ${elapsedSec}s | Samples created/verified: ${totalSamplesGenerated}`);
  }

  console.log(`[SampleGen] Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Total samples: ${totalSamplesGenerated}`);
  return { processed, totalSamplesGenerated };
}

if (import.meta.main) {
  const limit = parseOrExit(
    () => intFlag(parseFlags({ limit: { type: 'string' } }), 'limit') ?? null,
    'npm run anime:samples -- [--limit=N]   20 s FFmpeg clips for up to N themes (default: all)'
  );

  generateAllSamples({ limit })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[SampleGen] Fatal error:', err);
      process.exit(1);
    });
}
