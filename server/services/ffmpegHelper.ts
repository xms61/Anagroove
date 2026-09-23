import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

/** ffmpeg on PATH, or a WinGet install on Windows; null when not installed. */
export function findFfmpegPath(): string | null {
  if (cachedFfmpegPath && fs.existsSync(cachedFfmpegPath)) {
    return cachedFfmpegPath;
  }

  // 1. Check if ffmpeg is in PATH
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    cachedFfmpegPath = 'ffmpeg';
    return cachedFfmpegPath;
  } catch {
    // Not directly in PATH
  }

  // 2. Check WinGet Packages location on Windows
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackages)) {
      try {
        const entries = fs.readdirSync(wingetPackages, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.toLowerCase().includes('ffmpeg')) {
            const candidateBin = path.join(wingetPackages, entry.name);
            // Search up to 2 levels deep
            const subEntries = fs.readdirSync(candidateBin, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isDirectory()) {
                const exePath = path.join(candidateBin, sub.name, 'bin', 'ffmpeg.exe');
                if (fs.existsSync(exePath)) {
                  cachedFfmpegPath = exePath;
                  return cachedFfmpegPath;
                }
              }
            }
          }
        }
      } catch {
        // ignore search error
      }
    }
  }

  return null;
}

/** ffprobe next to ffmpeg, or on PATH; null when not installed. */
export function findFfprobePath(): string | null {
  if (cachedFfprobePath && fs.existsSync(cachedFfprobePath)) {
    return cachedFfprobePath;
  }

  const ffmpeg = findFfmpegPath();
  if (ffmpeg && ffmpeg !== 'ffmpeg') {
    const probe = path.join(path.dirname(ffmpeg), 'ffprobe.exe');
    if (fs.existsSync(probe)) {
      cachedFfprobePath = probe;
      return cachedFfprobePath;
    }
  }

  try {
    execSync('ffprobe -version', { stdio: 'ignore' });
    cachedFfprobePath = 'ffprobe';
    return cachedFfprobePath;
  } catch {
    // Not in PATH
  }

  return null;
}
