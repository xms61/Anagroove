import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTER_PATH = path.join(__dirname, '../data/master_song_pool.json');
const pool = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));

console.log('Refreshing live audio previews for all theme tracks...');

async function fetchFreshAudio(item) {
  const query = `${item.artist} ${item.title}`
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/feat\..*$/i, '')
    .replace(/\s*-\s*The\s*1st\s*Album.*/i, '')
    .trim();

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes search status ${res.status}`);
    const data = await res.json();
    const match = data.results?.[0];

    if (match && match.previewUrl) {
      const audioRes = await fetch(match.previewUrl, { method: 'HEAD' });
      if (audioRes.status === 200) {
        console.log(`  [OK] ${item.title} (${item.artist}) -> Status 200`);
        return {
          ...item,
          audioUrl: match.previewUrl,
          albumArt: match.artworkUrl100 ? match.artworkUrl100.replace('100x100bb.jpg', '400x400bb.jpg') : item.albumArt
        };
      }
    }
  } catch (e) {
    console.warn(`  [WARN] ${item.title}:`, e.message);
  }
  return item;
}

async function main() {
  const categories = Object.keys(pool);
  for (const cat of categories) {
    console.log(`\n=== Category: ${cat.toUpperCase()} (${pool[cat].length} songs) ===`);
    const refreshed = [];
    for (const song of pool[cat]) {
      const fresh = await fetchFreshAudio(song);
      refreshed.push(fresh);
      await new Promise(r => setTimeout(r, 150));
    }
    pool[cat] = refreshed;
  }

  fs.writeFileSync(MASTER_PATH, JSON.stringify(pool, null, 2), 'utf-8');
  console.log(`\nSuccessfully refreshed and saved all tracks in ${MASTER_PATH}`);
}

main();
