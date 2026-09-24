/**
 * Builds a small, clean catalog (en/ja/ko originals with years, ISRCs and Deezer ids) for CI:
 * the validation gate (`db:validate --ci`) and the Playwright smoke test run against it.
 * SQLite files are never committed, so the fixture is generated from this code.
 *
 *   node scripts/tests/fixtures/fixtureCatalog.ts --out=/tmp/fixture/catalog.sqlite
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteCatalog } from '../../../server/db/sqliteCatalog.js';

const ADJECTIVES = ['Golden', 'Silver', 'Midnight', 'Electric', 'Velvet', 'Broken', 'Summer', 'Winter', 'Neon', 'Crystal',
  'Wild', 'Distant', 'Burning', 'Frozen', 'Hidden', 'Lonely', 'Endless', 'Paper', 'Northern', 'Crimson'];
const NOUNS = ['Harbor', 'Garden', 'Highway', 'Mirror', 'Thunder', 'Letters', 'Window', 'Rivers', 'Shadow', 'Island',
  'Engine', 'Candle', 'Station', 'Ocean', 'Forest', 'Tiger', 'Anchor', 'Castle', 'Signal', 'Meadow'];
const EN_ARTISTS = ['The Lanterns', 'Maple Avenue', 'Copper Wolves', 'Jenny Rivers', 'Northbound', 'The Paper Kites Club',
  'Marcus Bell', 'Sunday Drivers', 'Glass Animals Club', 'Ruby Lane', 'The Night Owls', 'Oliver Stone Band',
  'Harper Quinn', 'Blue Canyon', 'The Violets', 'Leo Carter', 'Echo Park', 'Silver Pines', 'Nora Blake', 'The Tides'];
const JA_TRACKS: [string, string[]][] = [['Hoshino Band', ['ひかりの道', '夜の街', 'さくら色']], ['Aoi Sora', ['青い空', '星のうた', '風のメロディ']]];
const KO_TRACKS: [string, string[]][] = [['Seoul Lights', ['봄바람', '밤하늘', '너의 노래']], ['Hanbit', ['바다', '첫눈', '별빛']]];

/**
 * @param {string} dbPath catalog path (created; must not exist yet)
 * @returns {{ tracks: number }}
 */
export function buildFixtureCatalog(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const catalog = new SqliteCatalog(dbPath);
  let index = 0;
  let rejected = 0;
  const add = (track, isrcPrefix) => {
    index++;
    const result = catalog.upsertTrack({
      provider: 'deezer',
      providerTrackId: String(900000 + index),
      providerArtistId: String(80000 + (track.artistIndex ?? 0)),
      isrc: `${isrcPrefix}${String(index).padStart(5, '0')}`,
      releaseYear: 1975 + ((index * 7) % 50),
      durationMs: 180000 + index * 1000,
      spotifyPopularity: 25 + ((index * 13) % 70),
      ...track,
    });
    if (!result) rejected++;
  };

  EN_ARTISTS.forEach((artist, a) => {
    for (let t = 0; t < 4; t++) {
      const title = `${ADJECTIVES[(a * 4 + t) % ADJECTIVES.length]} ${NOUNS[(a * 7 + t * 3) % NOUNS.length]}`;
      add({ title, artist, artistIndex: a, album: `${NOUNS[(a + t) % NOUNS.length]} Sessions` }, 'USFX124');
    }
  });
  JA_TRACKS.forEach(([artist, titles], a) => titles.forEach(title =>
    add({ title, artist, artistIndex: 100 + a, album: 'Tokyo Nights' }, 'JPFX124')));
  KO_TRACKS.forEach(([artist, titles], a) => titles.forEach(title =>
    add({ title, artist, artistIndex: 200 + a, album: 'Seoul Days' }, 'KRFX124')));

  const tracks = catalog.db.prepare('SELECT COUNT(*) AS c FROM tracks').get().c;
  // Every fixture row must pass the admission policy; a rejection means a rule changed
  if (rejected > 0) throw new Error(`${rejected} fixture tracks were rejected by the admission policy`);
  catalog.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  catalog.close();
  return { tracks };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length);
  if (!out) {
    console.error('Usage: node scripts/tests/fixtures/fixtureCatalog.ts --out=<path/catalog.sqlite>');
    process.exit(2);
  }
  if (fs.existsSync(out)) {
    console.error(`${out} already exists; the fixture is only built into a new path.`);
    process.exit(2);
  }
  const { tracks } = buildFixtureCatalog(path.resolve(out));
  console.log(`Fixture catalog: ${tracks} tracks at ${out}`);
}
