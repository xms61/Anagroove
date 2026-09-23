import { Song } from '../types/crossword';

/**
 * Returns a URL that will still play later. New puzzles already carry stable
 * `/api/preview/<provider>:<id>` paths; puzzles saved before that embed signed
 * Deezer URLs that expire within minutes, so rebuild the stable path from the song ids.
 */
export function playableAudioUrl(song: Pick<Song, 'id' | 'provider' | 'providerTrackId' | 'audioUrl'>): string {
  const url = song.audioUrl || '';
  if (url.startsWith('/api/preview/') || url.startsWith('/audio/')) return url;

  const catalogMatch = /^sqlite:(\d{1,20})$/.exec(song.id || '');
  if (catalogMatch) return `/api/preview/catalog:${catalogMatch[1]}`;

  const providerId = song.providerTrackId || '';
  if ((song.provider === 'deezer' || song.provider === 'itunes') && /^\d{1,20}$/.test(providerId)) {
    return `/api/preview/${song.provider}:${providerId}`;
  }
  return url;
}
