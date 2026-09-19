#!/usr/bin/env node
import https from 'https';
import fs from 'fs';
import path from 'path';

const ANNAS_URL = 'https://annas-archive.gl/blog/spotify/spotify-top-10k-songs-table.html';
const ANNAS_DEST = 'data/spotify_top10k.html';
const BASE_TABLES_DIR = 'data/base_tables';
const CHANGES_DIR = 'data/changes';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

async function fetchFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log('⏳ Downloading ' + url + '...');
    const file = fs.createWriteStream(dest);
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(dest);
          console.log('  ✓ Saved to ' + dest + ' (' + formatBytes(stats.size) + ')');
          resolve();
        });
      } else {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error('HTTP ' + res.statusCode));
      }
    });
    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('   SPOTYSPICE DATASET PREPARATION UTILITY');
  console.log('================================================================\n');

  for (const dir of [BASE_TABLES_DIR, CHANGES_DIR, 'data/downloads']) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  if (!fs.existsSync(ANNAS_DEST)) {
    try {
      await fetchFile(ANNAS_URL, ANNAS_DEST);
    } catch (err) {
      console.warn('  ⚠️ Could not download Anna archive Spotify table: ' + err.message);
    }
  } else {
    const stats = fs.statSync(ANNAS_DEST);
    console.log('  ✓ Anna Spotify Top 10k table ready: ' + ANNAS_DEST + ' (' + formatBytes(stats.size) + ')');
  }

  const baseFiles = fs.readdirSync(BASE_TABLES_DIR).filter(f => !f.startsWith('.'));
  console.log('\n📁 Base Tables Directory (' + BASE_TABLES_DIR + '):');
  if (baseFiles.length === 0) {
    console.log('   (Empty - place your Deezer/Spotify CSV/TSV table dumps here)');
  } else {
    for (const f of baseFiles) {
      const s = fs.statSync(path.join(BASE_TABLES_DIR, f));
      console.log('   - ' + f + ' (' + formatBytes(s.size) + ')');
    }
  }

  const changeFiles = fs.readdirSync(CHANGES_DIR).filter(f => !f.startsWith('.'));
  console.log('\n📁 Incremental Changes Directory (' + CHANGES_DIR + '):');
  if (changeFiles.length === 0) {
    console.log('   (Empty - place compressed changes_*.sql.gz diff files here)');
  } else {
    for (const f of changeFiles) {
      const s = fs.statSync(path.join(CHANGES_DIR, f));
      console.log('   - ' + f + ' (' + formatBytes(s.size) + ')');
    }
  }

  console.log('\n================================================================');
  console.log('   EXTERNAL DATASET SOURCES & INGESTION GUIDE');
  console.log('================================================================');
  console.log('1. MusicMoveArr Datasets Repository:');
  console.log('   https://github.com/MusicMoveArr/Datasets');
  console.log('2. Incremental SQL Diffs (.sql.gz) on MEGA:');
  console.log('   https://mega.nz/folder/QqQWkJKI#LVtUdSYU8hxEuD_XsylYRA');
  console.log('   -> Download changes_*.sql.gz into data/changes/');
  console.log('3. Run Ingestion Commands:');
  console.log('   npm run crawl:top10k');
  console.log('   npm run ingest:dataset -- --base-dir=data/base_tables/');
  console.log('   npm run ingest:dataset -- --incremental-dir=data/changes/');
  console.log('================================================================\n');
}

main();
