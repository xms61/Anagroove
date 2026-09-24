#!/usr/bin/env node
import { sqliteCatalog, normalizeDedupeArtist } from '../server/db/sqliteCatalog.ts';
import { loadStreamedArtists } from '../server/crawler/artistBaseline.ts';

const GENRE_CLUSTERS = {
  'Classic Rock': [
    'Queen', 'The Beatles', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'Fleetwood Mac',
    'David Bowie', 'The Who', 'The Doors', 'Jimi Hendrix', 'Creedence Clearwater Revival', 'Deep Purple',
    'Black Sabbath', 'Aerosmith', 'AC/DC', 'Boston', 'Kansas', 'Journey', 'Foreigner', 'Heart',
    'Kiss', 'Van Halen', 'Rush', 'Def Leppard', 'Dire Straits', 'The Police', 'Eric Clapton',
    'Neil Young', 'Bob Dylan', 'Bruce Springsteen', 'Tom Petty', 'Billy Joel', 'Elton John',
  ],
  'Grunge': [
    'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'The Smashing Pumpkins',
    'Stone Temple Pilots', 'Bush', 'Silverchair', 'Temple of the Dog', 'Mudhoney',
  ],
  'Alternative Rock': [
    'Radiohead', 'R.E.M.', 'U2', 'Red Hot Chili Peppers', 'Oasis', 'Blur', 'The Cure',
    'The Smiths', 'Joy Division', 'New Order', 'Depeche Mode', 'Pixies', 'The Clash',
    'Foo Fighters', 'Green Day', 'Weezer', 'Blink-182', 'The Offspring', 'Linkin Park',
    'Incubus', 'Rage Against The Machine', 'System of a Down', 'The White Stripes',
    'The Strokes', 'Arctic Monkeys', 'Muse', 'Coldplay', 'The Killers', 'Gorillaz',
    'Queens of the Stone Age', 'Franz Ferdinand', 'Interpol', 'Arcade Fire', 'Vampire Weekend',
  ],
  'Punk': [
    'The Clash', 'Sex Pistols', 'Ramones', 'Green Day', 'Blink-182', 'The Offspring',
    'Bad Religion', 'Black Flag', 'Dead Kennedys', 'Buzzcocks', 'The Damned',
  ],
  'French House': [
    'Daft Punk', 'Justice', 'Cassius', 'Modjo', 'Bob Sinclar', 'St Germain',
    'Etienne de Crecy', 'Laurent Garnier', 'Kavinsky', 'Gesaffelstein', 'Madeon', 'Kungs',
  ],
  'Electronic': [
    'Kraftwerk', 'The Chemical Brothers', 'The Prodigy', 'Fatboy Slim', 'Faithless',
    'Underworld', 'Massive Attack', 'Portishead', 'Moby', 'Aphex Twin', 'Deadmau5',
    'Skrillex', 'Avicii', 'Calvin Harris', 'David Guetta', 'Swedish House Mafia',
    'Tiësto', 'Armin van Buuren', 'Martin Garrix', 'Kygo', 'Zedd', 'Marshmello',
    'The Chainsmokers', 'Disclosure', 'LCD Soundsystem', 'Rufus Du Sol', 'ODESZA',
    'Major Lazer', 'DJ Snake',
  ],
  'City Pop': [
    'Tatsuro Yamashita', 'Miki Matsubara', 'Mariya Takeuchi', 'Anri', 'Taeko Onuki',
    'Junko Ohashi', 'Toshiki Kadomatsu', 'Takako Mamiya', 'Tomoko Aran', 'Meiko Nakahara',
  ],
  'Motown': [
    'The Temptations', 'The Supremes', 'Stevie Wonder', 'Marvin Gaye', 'The Jackson 5',
    'Smokey Robinson', 'Four Tops', 'Martha and the Vandellas', 'Gladys Knight & The Pips',
    'Diana Ross', 'Tammi Terrell', 'Mary Wells',
  ],
  'Soul': [
    'Aretha Franklin', 'Otis Redding', 'Sam Cooke', 'Ray Charles', 'James Brown',
    'Al Green', 'Bill Withers', 'Donny Hathaway', 'Etta James', 'Curtis Mayfield',
  ],
  'Funk': [
    'Parliament', 'Funkadelic', 'James Brown', 'Prince', 'Chic',
    'Earth Wind & Fire', 'Kool & The Gang', 'The Gap Band', 'Cameo',
    'Zapp', 'Commodores', 'The Meters', 'Bootsy Collins', 'Rick James',
  ],
  'Disco': [
    'Donna Summer', 'Bee Gees', 'Chic', 'Earth Wind & Fire', 'Kool & The Gang',
    'KC and the Sunshine Band', 'Gloria Gaynor', 'Village People', 'Sister Sledge',
    'The Trammps', 'Boney M.', 'Baccara', 'Sylvester',
  ],
  'Hip Hop': [
    'Run-D.M.C.', 'Beastie Boys', 'Public Enemy', 'A Tribe Called Quest', 'Wu-Tang Clan',
    'Tupac Shakur', 'The Notorious B.I.G.', 'Nas', 'Jay-Z', 'Snoop Dogg', 'Dr. Dre',
    'Eminem', '50 Cent', 'OutKast', 'Ludacris', 'Missy Elliott', 'Busta Rhymes',
    'Lil Wayne', 'Kanye West', 'Kendrick Lamar', 'J. Cole', 'Drake', 'Future',
    'Travis Scott', 'A$AP Rocky', 'Mac Miller', 'Tyler, The Creator', 'Childish Gambino',
    'Post Malone', 'Cardi B', 'Nicki Minaj', 'Doja Cat', 'Mobb Deep',
  ],
  'R&B': [
    'Sade', 'Luther Vandross', 'Boyz II Men', 'TLC', 'Lauryn Hill', 'Alicia Keys',
    'Usher', 'John Legend', 'Ne-Yo', 'Frank Ocean', 'SZA', 'Daniel Caesar',
    'Mariah Carey', 'Whitney Houston', 'Destiny\'s Child', 'Beyoncé', 'Rihanna',
  ],
  'K-Pop': [
    'BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'EXO', 'SEVENTEEN', 'NewJeans',
    'LE SSERAFIM', 'aespa', 'Red Velvet', 'IU', 'BIGBANG', 'SHINee', 'ENHYPEN',
    'TXT', 'ATEEZ',
  ],
  'Reggae': [
    'Bob Marley', 'Peter Tosh', 'Jimmy Cliff', 'Steel Pulse', 'UB40', 'Sean Paul',
    'Shaggy', 'Burning Spear', 'Toots and the Maytals', 'Black Uhuru',
  ],
  'Bossa Nova': [
    'Antonio Carlos Jobim', 'Joao Gilberto', 'Astrud Gilberto', 'Stan Getz',
    'Sergio Mendes', 'Caetano Veloso', 'Gilberto Gil', 'Gal Costa',
  ],
  'Anime': [
    'FLOW', 'LiSA', 'Aimer', 'RADWIMPS', 'Nightmare', 'ASIAN KUNG-FU GENERATION',
    'KANA-BOON', 'Eve', 'Yoko Takahashi', 'Linked Horizon', 'Burnout Syndromes',
    'ClariS', 'Ikimonogakari', 'SPYAIR', 'UVERworld', 'Azumi Inoue', 'Joe Hisaishi',
    'Creepy Nuts', 'King Gnu', 'Kenshi Yonezu', 'OFFICIAL HIGE DANDISM',
  ],
  'Japanese': [
    'Tatsuro Yamashita', 'Miki Matsubara', 'Mariya Takeuchi', 'Anri', 'Taeko Onuki',
    'Junko Ohashi', 'Toshiki Kadomatsu', 'Takako Mamiya', 'Tomoko Aran', 'Meiko Nakahara',
    'Minako Yoshida', 'Hiroshi Satoh', 'ONE OK ROCK', 'RADWIMPS', 'King Gnu',
  ],
  'Pop': [
    'Michael Jackson', 'Madonna', 'Prince', 'George Michael', 'Britney Spears',
    'Christina Aguilera', 'Justin Timberlake', 'Lady Gaga', 'Katy Perry',
    'Taylor Swift', 'Bruno Mars', 'Adele', 'Ed Sheeran', 'Ariana Grande',
    'Dua Lipa', 'Billie Eilish', 'Harry Styles', 'The Weeknd', 'Olivia Rodrigo',
    'Sabrina Carpenter', 'Charli XCX', 'Sia', 'P!nk', 'Avril Lavigne', 'Shakira',
  ],
};

function main() {
  console.log('Populating genres_json in SQLite catalog...');
  const artistGenreMap = new Map();

  // 1. Add streamed artists
  const streamed = loadStreamedArtists();
  for (const a of streamed) {
    if (a.name && a.genre) {
      const canonical = normalizeDedupeArtist(a.name);
      if (!artistGenreMap.has(canonical)) artistGenreMap.set(canonical, new Set());
      artistGenreMap.get(canonical).add(a.genre);
    }
  }

  // 2. Add curated genre clusters
  for (const [genre, artists] of Object.entries(GENRE_CLUSTERS)) {
    for (const name of artists) {
      const canonical = normalizeDedupeArtist(name);
      if (!artistGenreMap.has(canonical)) artistGenreMap.set(canonical, new Set());
      artistGenreMap.get(canonical).add(genre);
    }
  }

  console.log(`Mapped ${artistGenreMap.size} distinct artists across genres.`);

  const db = sqliteCatalog.db;
  const updateStmt = db.prepare('UPDATE artists SET genres_json = ? WHERE canonical_name = ?');
  let updated = 0;

  db.exec('BEGIN TRANSACTION');
  for (const [canonical, genreSet] of artistGenreMap.entries()) {
    const genresJson = JSON.stringify(Array.from(genreSet));
    const res = updateStmt.run(genresJson, canonical);
    updated += Number(res.changes);
  }
  db.exec('COMMIT');

  console.log(`Updated ${updated} artists in SQLite with verified genres_json.`);

  const sample = db.prepare(
    'SELECT display_name, genres_json FROM artists WHERE genres_json IS NOT NULL LIMIT 8'
  ).all();
  console.log('Sample updated artists:');
  console.log(sample);
}

main();
