import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUSIC_POOL_PATH = path.join(__dirname, '../data/music_pool.json');
const pool = JSON.parse(fs.readFileSync(MUSIC_POOL_PATH, 'utf-8'));

console.log(`Refreshing live audio previews for ${pool.length} tracks...`);

async function fetchFreshAudio(item) {
  const query = `${item.artist} ${item.title}`.replace(/feat\..*$/i, '').trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
    const data = await res.json();
    const match = data.results?.[0];

    if (match && match.previewUrl) {
      // Verify audio URL is live
      const audioRes = await fetch(match.previewUrl, { method: 'HEAD' });
      if (audioRes.status === 200) {
        console.log(`  [OK] ${item.title} -> Live Audio verified (Status 200)`);
        return {
          ...item,
          audioUrl: match.previewUrl,
          albumArt: match.artworkUrl100 ? match.artworkUrl100.replace('100x100bb.jpg', '400x400bb.jpg') : item.albumArt
        };
      }
    }
  } catch (err) {
    console.warn(`  [WARN] Failed refreshing for ${item.title}:`, err.message);
  }
  return item;
}

async function main() {
  const updated = [];
  for (const item of pool) {
    const fresh = await fetchFreshAudio(item);
    updated.push(fresh);
    // Slight pause to respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync(MUSIC_POOL_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  console.log(`\nUpdated ${updated.length} tracks in ${MUSIC_POOL_PATH}`);
}

main();
