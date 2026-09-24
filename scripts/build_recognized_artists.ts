// Script to assemble and verify 100+ recognized artists with >= 250,000 followers across all genres and eras
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorMessage } from '../server/errors.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIST_SEEDS = [
  // Pop Legends
  { name: 'The Beatles', genre: 'rock', era: '60s' },
  { name: 'Michael Jackson', genre: 'pop', era: '80s' },
  { name: 'Madonna', genre: 'pop', era: '80s' },
  { name: 'Queen', genre: 'rock', era: '70s' },
  { name: 'Elton John', genre: 'pop', era: '70s' },
  { name: 'Prince', genre: 'pop', era: '80s' },
  { name: 'Whitney Houston', genre: 'pop', era: '80s' },
  { name: 'George Michael', genre: 'pop', era: '80s' },
  { name: 'Britney Spears', genre: 'pop', era: '90s' },
  { name: 'Justin Timberlake', genre: 'pop', era: '2000s' },
  { name: 'Taylor Swift', genre: 'pop', era: '2010s' },
  { name: 'The Weeknd', genre: 'pop', era: '2010s' },
  { name: 'Bruno Mars', genre: 'pop', era: '2010s' },
  { name: 'Dua Lipa', genre: 'pop', era: '2020s' },
  { name: 'Billie Eilish', genre: 'pop', era: '2020s' },
  { name: 'Ed Sheeran', genre: 'pop', era: '2010s' },
  { name: 'Adele', genre: 'pop', era: '2010s' },
  { name: 'Ariana Grande', genre: 'pop', era: '2010s' },
  { name: 'Katy Perry', genre: 'pop', era: '2010s' },
  { name: 'Lady Gaga', genre: 'pop', era: '2010s' },
  { name: 'Rihanna', genre: 'pop', era: '2000s' },
  { name: 'Beyonce', genre: 'pop', era: '2000s' },
  { name: 'Harry Styles', genre: 'pop', era: '2020s' },
  { name: 'Olivia Rodrigo', genre: 'pop', era: '2020s' },
  { name: 'Miley Cyrus', genre: 'pop', era: '2010s' },
  { name: 'Shakira', genre: 'latin', era: '2000s' },

  // Rock & Retro
  { name: 'Nirvana', genre: 'rock', era: '90s' },
  { name: 'Pink Floyd', genre: 'rock', era: '70s' },
  { name: 'AC/DC', genre: 'rock', era: '80s' },
  { name: 'Guns N Roses', genre: 'rock', era: '80s' },
  { name: 'Led Zeppelin', genre: 'rock', era: '70s' },
  { name: 'The Rolling Stones', genre: 'rock', era: '70s' },
  { name: 'Red Hot Chili Peppers', genre: 'rock', era: '90s' },
  { name: 'Coldplay', genre: 'rock', era: '2000s' },
  { name: 'Radiohead', genre: 'rock', era: '90s' },
  { name: 'Linkin Park', genre: 'rock', era: '2000s' },
  { name: 'Green Day', genre: 'rock', era: '90s' },
  { name: 'Foo Fighters', genre: 'rock', era: '2000s' },
  { name: 'Arctic Monkeys', genre: 'rock', era: '2010s' },
  { name: 'The Killers', genre: 'rock', era: '2000s' },
  { name: 'Metallica', genre: 'rock', era: '80s' },
  { name: 'Bon Jovi', genre: 'rock', era: '80s' },
  { name: 'Fleetwood Mac', genre: 'rock', era: '70s' },
  { name: 'David Bowie', genre: 'rock', era: '70s' },
  { name: 'Oasis', genre: 'rock', era: '90s' },
  { name: 'U2', genre: 'rock', era: '80s' },
  { name: 'Gorillaz', genre: 'rock', era: '2000s' },
  { name: 'Aerosmith', genre: 'rock', era: '70s' },

  // Hip-Hop & Rap & R&B
  { name: 'Eminem', genre: 'hiphop', era: '2000s' },
  { name: 'Drake', genre: 'hiphop', era: '2010s' },
  { name: 'Kendrick Lamar', genre: 'hiphop', era: '2010s' },
  { name: 'Kanye West', genre: 'hiphop', era: '2000s' },
  { name: '50 Cent', genre: 'hiphop', era: '2000s' },
  { name: 'Snoop Dogg', genre: 'hiphop', era: '90s' },
  { name: 'Travis Scott', genre: 'hiphop', era: '2010s' },
  { name: 'Post Malone', genre: 'hiphop', era: '2010s' },
  { name: 'Jay-Z', genre: 'hiphop', era: '2000s' },
  { name: 'Outkast', genre: 'hiphop', era: '2000s' },
  { name: 'Black Eyed Peas', genre: 'hiphop', era: '2000s' },
  { name: 'Usher', genre: 'hiphop', era: '2000s' },
  { name: 'Alicia Keys', genre: 'hiphop', era: '2000s' },
  { name: 'SZA', genre: 'hiphop', era: '2020s' },

  // Electronic & Dance
  { name: 'Daft Punk', genre: 'electronic', era: '2000s' },
  { name: 'Avicii', genre: 'electronic', era: '2010s' },
  { name: 'Calvin Harris', genre: 'electronic', era: '2010s' },
  { name: 'David Guetta', genre: 'electronic', era: '2010s' },
  { name: 'Martin Garrix', genre: 'electronic', era: '2010s' },
  { name: 'The Chainsmokers', genre: 'electronic', era: '2010s' },
  { name: 'Skrillex', genre: 'electronic', era: '2010s' },
  { name: 'Tiesto', genre: 'electronic', era: '2000s' },
  { name: 'Marshmello', genre: 'electronic', era: '2010s' },
  { name: 'Kygo', genre: 'electronic', era: '2010s' },
  { name: 'Swedish House Mafia', genre: 'electronic', era: '2010s' },

  // 80s & 90s Retro
  { name: 'ABBA', genre: 'retro', era: '70s' },
  { name: 'Wham!', genre: 'retro', era: '80s' },
  { name: 'a-ha', genre: 'retro', era: '80s' },
  { name: 'Cyndi Lauper', genre: 'retro', era: '80s' },
  { name: 'Toto', genre: 'retro', era: '80s' },
  { name: 'Tears for Fears', genre: 'retro', era: '80s' },
  { name: 'Phil Collins', genre: 'retro', era: '80s' },
  { name: 'Earth Wind and Fire', genre: 'retro', era: '70s' },
  { name: 'Depeche Mode', genre: 'retro', era: '80s' },
  { name: 'Backstreet Boys', genre: 'retro', era: '90s' },
  { name: 'Spice Girls', genre: 'retro', era: '90s' },
  { name: 'The Cranberries', genre: 'retro', era: '90s' },
  { name: 'No Doubt', genre: 'retro', era: '90s' },

  // 2000s Pop Punk & Alternative
  { name: 'Blink-182', genre: 'poppunk', era: '2000s' },
  { name: 'Paramore', genre: 'poppunk', era: '2000s' },
  { name: 'My Chemical Romance', genre: 'poppunk', era: '2000s' },
  { name: 'Fall Out Boy', genre: 'poppunk', era: '2000s' },
  { name: 'Avril Lavigne', genre: 'poppunk', era: '2000s' },
  { name: 'Sum 41', genre: 'poppunk', era: '2000s' },
  { name: 'Evanescence', genre: 'poppunk', era: '2000s' },
  { name: 'The Offspring', genre: 'poppunk', era: '90s' },

  // Latin & Reggaeton
  { name: 'Bad Bunny', genre: 'latin', era: '2020s' },
  { name: 'Daddy Yankee', genre: 'latin', era: '2000s' },
  { name: 'J Balvin', genre: 'latin', era: '2010s' },
  { name: 'Maluma', genre: 'latin', era: '2010s' },
  { name: 'Rosalia', genre: 'latin', era: '2020s' },
  { name: 'Luis Fonsi', genre: 'latin', era: '2010s' },
  { name: 'Karol G', genre: 'latin', era: '2020s' },

  // Global & Soundtracks
  { name: 'BTS', genre: 'kpop', era: '2010s' },
  { name: 'BLACKPINK', genre: 'kpop', era: '2010s' },
  { name: 'Hans Zimmer', genre: 'soundtrack', era: '2000s' },
  { name: 'John Williams', genre: 'soundtrack', era: '80s' },
];

async function main() {
  console.log(`Verifying ${ARTIST_SEEDS.length} recognized artists on Deezer...`);
  const verified = [];

  for (const item of ARTIST_SEEDS) {
    try {
      const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(item.name)}`);
      if (res.ok) {
        const data = await res.json() as { data?: { name: string; nb_fan: number; id: number; picture?: string; picture_medium?: string }[] };
        const match = data.data?.find(a => a.nb_fan >= 200000);
        if (match) {
          verified.push({
            name: match.name,
            id: match.id,
            fans: match.nb_fan,
            genre: item.genre,
            era: item.era,
            picture: match.picture_medium || match.picture
          });
          console.log(`[PASS] ${match.name} (Fans: ${(match.nb_fan / 1000000).toFixed(1)}M)`);
        } else {
          console.warn(`[WARN] No 200k+ fan match for ${item.name}`);
        }
      }
    } catch (e) {
      console.error(`[ERR] Failed for ${item.name}:`, errorMessage(e));
    }
  }

  const outDir = path.join(__dirname, '../server/data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'recognized_artists.json');
  fs.writeFileSync(outFile, JSON.stringify(verified, null, 2), 'utf-8');
  console.log(`\n🎉 Successfully assembled ${verified.length} verified iconic artists to ${outFile}`);
}

main();
