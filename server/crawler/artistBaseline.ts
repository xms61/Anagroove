import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const CSV_FILENAME = 'most_streamed_artists.csv';
const PRIMARY_CSV_PATH = path.join(DATA_DIR, CSV_FILENAME);

export interface StreamedArtist {
  name: string;
  sex: string;
  country: string;
  language: string;
  genre: string;
  artistType: string;
  debutYear: number | null;
  totalStreams: number;
  leadStreams: number;
  soloStreams: number;
}

/**
 * Parses a single CSV line respecting quotes and escaped quotes.
 */
export function parseCsvLine(line = ''): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/** Reads the Most Streamed Artists dataset, most streamed first; [] when the file is missing. */
export function loadStreamedArtists(customPath: string | null = null): StreamedArtist[] {
  const filePath = customPath || PRIMARY_CSV_PATH;
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const nameIdx = headers.findIndex(h => h.includes('artist name') || h === 'artist');
  const sexIdx = headers.findIndex(h => h === 'sex');
  const countryIdx = headers.findIndex(h => h.includes('country'));
  const langIdx = headers.findIndex(h => h.includes('language'));
  const genreIdx = headers.findIndex(h => h.includes('genre'));
  const typeIdx = headers.findIndex(h => h.includes('type'));
  const debutIdx = headers.findIndex(h => h.includes('debut'));
  const totalStreamsIdx = headers.findIndex(h => h.includes('total streams'));
  const leadStreamsIdx = headers.findIndex(h => h.includes('lead streams'));
  const soloStreamsIdx = headers.findIndex(h => h.includes('solo streams'));

  const artists: StreamedArtist[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = cols[nameIdx >= 0 ? nameIdx : 0];
    if (!name) continue;

    const debutYear = debutIdx >= 0 ? parseInt(cols[debutIdx], 10) : null;
    const totalStreams = totalStreamsIdx >= 0 ? parseFloat(cols[totalStreamsIdx]) : 0;
    const leadStreams = leadStreamsIdx >= 0 ? parseFloat(cols[leadStreamsIdx]) : 0;
    const soloStreams = soloStreamsIdx >= 0 ? parseFloat(cols[soloStreamsIdx]) : 0;

    artists.push({
      name: name.trim(),
      sex: sexIdx >= 0 ? cols[sexIdx] : '',
      country: countryIdx >= 0 ? cols[countryIdx] : '',
      language: langIdx >= 0 ? cols[langIdx] : '',
      genre: genreIdx >= 0 ? cols[genreIdx] : '',
      artistType: typeIdx >= 0 ? cols[typeIdx] : 'Solo',
      debutYear: Number.isFinite(debutYear) ? debutYear : null,
      totalStreams: Number.isFinite(totalStreams) ? totalStreams : 0,
      leadStreams: Number.isFinite(leadStreams) ? leadStreams : 0,
      soloStreams: Number.isFinite(soloStreams) ? soloStreams : 0,
    });
  }

  // Sort by total streams descending
  artists.sort((a, b) => b.totalStreams - a.totalStreams);
  return artists;
}

export const STREAMED_ARTISTS = loadStreamedArtists();
export const STREAMED_ARTIST_NAMES = STREAMED_ARTISTS.map(a => a.name);
