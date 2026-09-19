#!/usr/bin/env node
import https from 'https';
import http from 'http';
import fs from 'fs';
import { sqliteCatalog } from '../server/db/sqliteCatalog.js';
import { isAuthenticCandidate } from '../server/crawler/authenticityFilter.js';

const ANNAS_ARCHIVE_URL =
  'https://annas-archive.gl/blog/spotify/spotify-top-10k-songs-table.html';

const args = process.argv.slice(2);
const minPopularityArg = args.find(a => a.startsWith('--min-popularity='));
const minPopularity = minPopularityArg ? parseInt(minPopularityArg.split('=')[1], 10) : 31; // strictly > 30

const fileArg = args.find(a => a.startsWith('--file='));
const defaultLocalFile = 'data/spotify_top10k.html';
const localFilePath = fileArg ? fileArg.split('=')[1] : (fs.existsSync(defaultLocalFile) ? defaultLocalFile : null);

function cleanHtmlEntities(str = '') {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseDuration(str = '') {
  if (!str) return 0;
  const parts = str.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  } else if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 0;
}

function parseTr(trHtml) {
  if (!trHtml.includes('<td class="rank">')) return null;

  // Track Name & ID
  const trackTdMatch = trHtml.match(/<td class="track-name">([\s\S]*?)<\/td>/);
  if (!trackTdMatch) return null;
  const rawTrack = trackTdMatch[1];
  const titlePart = rawTrack.split(/<br\s*\/?>/i)[0];
  const title = cleanHtmlEntities(titlePart.replace(/<[^>]+>/g, ''));
  const trackIdMatch = rawTrack.match(/<span class="id-text">([a-zA-Z0-9]+)/);
  const providerTrackId = trackIdMatch ? trackIdMatch[1] : null;

  if (!title || !providerTrackId) return null;

  // Artists
  const artistTdMatch = trHtml.match(/<td class="artist-names">([\s\S]*?)<\/td>/);
  const artists = [];
  let primarySpotifyArtistId = null;
  if (artistTdMatch) {
    const rawArtist = artistTdMatch[1];
    const artistParts = rawArtist.split(/<br\s*\/?>/i);
    for (const part of artistParts) {
      const name = cleanHtmlEntities(
        part.replace(/<span class="id-text">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '')
      );
      if (name && !name.match(/^[a-zA-Z0-9]{22}$/)) {
        artists.push(name);
      }
      const aIdMatch = part.match(/<span class="id-text">([a-zA-Z0-9]+)/);
      if (aIdMatch && !primarySpotifyArtistId) {
        primarySpotifyArtistId = aIdMatch[1];
      }
    }
  }
  const artist = artists.join(', ');
  if (!artist) return null;

  // Album
  const albumTdMatch = trHtml.match(/<td class="album-name">([\s\S]*?)<\/td>/);
  let album = '';
  if (albumTdMatch) {
    const rawAlbum = albumTdMatch[1];
    const albumPart = rawAlbum.split(/<br\s*\/?>/i)[0];
    album = cleanHtmlEntities(albumPart.replace(/<[^>]+>/g, ''));
  }

  // Popularity
  const popMatch = trHtml.match(/<td class="popularity">([\s\S]*?)<\/td>/);
  const popularity = popMatch ? parseInt(popMatch[1].replace(/<[^>]+>/g, '').trim(), 10) : 0;

  // Duration
  const durMatch = trHtml.match(/<td class="duration">([\s\S]*?)<\/td>/);
  const durationMs = durMatch ? parseDuration(durMatch[1].replace(/<[^>]+>/g, '').trim()) : 0;

  // Release Date
  const relMatch = trHtml.match(/<td class="release-date">([\s\S]*?)<\/td>/);
  const releaseDate = relMatch ? cleanHtmlEntities(relMatch[1].replace(/<[^>]+>/g, '')) : null;
  let releaseYear = null;
  if (releaseDate && releaseDate.length >= 4) {
    const yr = parseInt(releaseDate.slice(0, 4), 10);
    if (!isNaN(yr) && yr >= 1950 && yr <= 2030) releaseYear = yr;
  }

  // ISRC
  const isrcMatch = trHtml.match(/<td class="isrc">([\s\S]*?)<\/td>/);
  const isrc = isrcMatch ? cleanHtmlEntities(isrcMatch[1].replace(/<[^>]+>/g, '')) : null;

  // Explicit
  const expMatch = trHtml.match(/<td class="explicit">([\s\S]*?)<\/td>/);
  const isExplicit = Boolean(expMatch && expMatch[1].includes('🅴'));

  return {
    title,
    artist,
    isrc: isrc && isrc.length === 12 ? isrc : null,
    album,
    durationMs,
    releaseYear,
    releaseDate,
    popularity,
    isExplicit,
    provider: 'spotify',
    providerTrackId,
    sampleUrl: null,
    sampleCodec: 'mp3',
    sampleDurationSec: 30,
    externalUrl: `https://open.spotify.com/track/${providerTrackId}`,
    rawMetadata: {
      popularity,
      spotifyTrackId: providerTrackId,
      spotifyArtistId: primarySpotifyArtistId,
    },
    artistMetadata: {
      spotifyId: primarySpotifyArtistId,
    },
  };
}

export async function ingestAnnasSpotifyTop10k(options = {}) {
  const minPop = options.minPopularity ?? minPopularity;
  const initialStats = sqliteCatalog.getStats();

  console.log('\n================================================================');
  console.log('  SPOTYSPICE - ANNA\'S ARCHIVE SPOTIFY TOP 10K INGESTOR');
  const targetFile = options.file ?? localFilePath;
  const sourceLabel = targetFile ? `Local File (${targetFile})` : ANNAS_ARCHIVE_URL;

  console.log('================================================================');
  console.log(`  Source:           ${sourceLabel}`);
  console.log(`  Filter:           popularity >= ${minPop} (popularity > 30)`);
  console.log(`  Authenticity:     Excluded covers, white noise, lullaby & tribute patterns`);
  console.log(`  Starting Tracks:  ${initialStats.tracks.toLocaleString()}`);
  console.log('================================================================\n');

  let rowsParsed = 0;
  let filteredByPop = 0;
  let filteredByAuth = 0;
  let candidatesBatch = [];
  let totalInserted = 0;
  let totalMerged = 0;

  function flushBatch() {
    if (candidatesBatch.length === 0) return;
    const res = sqliteCatalog.upsertBatch(candidatesBatch);
    totalInserted += res.inserted;
    totalMerged += res.merged;
    candidatesBatch = [];
  }

  await new Promise((resolve, reject) => {
    function handleStream(stream) {
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString('utf8');

        let trStart = buffer.indexOf('<tr>');
        while (trStart !== -1) {
          const trEnd = buffer.indexOf('</tr>', trStart);
          if (trEnd === -1) break;

          const rowHtml = buffer.slice(trStart, trEnd + 5);
          buffer = buffer.slice(trEnd + 5);

          const track = parseTr(rowHtml);
          if (track) {
            rowsParsed++;
            if (track.popularity < minPop) {
              filteredByPop++;
            } else if (!isAuthenticCandidate(track, { requireSample: false })) {
              filteredByAuth++;
            } else {
              candidatesBatch.push(track);
              if (candidatesBatch.length >= 100) {
                flushBatch();
                const curStats = sqliteCatalog.getStats();
                process.stdout.write(
                  `\rIngesting: ${rowsParsed} rows parsed | ${candidatesBatch.length + totalInserted} new/merged | DB Tracks: ${curStats.tracks.toLocaleString()}`
                );
              }
            }
          }

          trStart = buffer.indexOf('<tr>');
        }
      });

      stream.on('end', () => {
        flushBatch();
        resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });
    }

    if (targetFile && fs.existsSync(targetFile)) {
      const fileStream = fs.createReadStream(targetFile);
      handleStream(fileStream);
    } else {
      const client = ANNAS_ARCHIVE_URL.startsWith('https') ? https : http;
      const req = client.get(ANNAS_ARCHIVE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode} from ${ANNAS_ARCHIVE_URL}`));
        }
        handleStream(res);
      });

      req.on('error', (err) => {
        reject(err);
      });
    }
  });

  const finalStats = sqliteCatalog.getStats();
  console.log('\n\n================================================================');
  console.log('  INGESTION COMPLETE');
  console.log('================================================================');
  console.log(`  Total Rows Evaluated:       ${rowsParsed.toLocaleString()}`);
  console.log(`  Filtered out (pop < ${minPop}):  ${filteredByPop.toLocaleString()}`);
  console.log(`  Filtered out (authenticity):${filteredByAuth.toLocaleString()}`);
  console.log(`  Newly Inserted Tracks:      ${totalInserted.toLocaleString()}`);
  console.log(`  Cross-Referenced / Merged:  ${totalMerged.toLocaleString()}`);
  console.log(`  Final DB Canonical Tracks:  ${finalStats.tracks.toLocaleString()}`);
  console.log(`  Final DB Unique Artists:    ${finalStats.artists.toLocaleString()}`);
  console.log(`  Cross-Referenced Count:     ${finalStats.crossReferencedTracks.toLocaleString()}`);
  console.log('================================================================\n');

  return {
    rowsParsed,
    filteredByPop,
    filteredByAuth,
    totalInserted,
    totalMerged,
    finalStats,
  };
}

if (process.argv[1]?.endsWith('ingest_annas_spotify.js')) {
  ingestAnnasSpotifyTop10k().catch((err) => {
    console.error('Fatal ingestion error:', err);
    process.exit(1);
  });
}
