import React, { useState, useRef, useEffect } from 'react';
import { EyeOff, ExternalLink, Loader2, Music, Pause, Play, RotateCcw, UserX } from 'lucide-react';
import { Puzzle, Song } from '../../shared/types';
import { Modal } from './Modal';
import { Button, IconButton } from './ui';
import { readSettings } from '../hooks/useSettings';
import { playableAudioUrl } from '../services/audioSource';

interface EndScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: Puzzle;
  onNextPuzzle?: () => void;
  onRestartPuzzle?: () => void;
  onBlacklistArtist?: (song: Song) => void;
  onBlacklistSong?: (song: Song) => void;
  isLoading?: boolean;
}

const PROVIDER_LABELS: Record<string, string> = { deezer: 'Deezer', itunes: 'Apple Music' };

function Cover({ song }: { song: Song }) {
  const [failed, setFailed] = useState(false);
  if (song.albumArt?.startsWith('http') && !failed) {
    return <img src={song.albumArt} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-raised">
      {song.themeSlug
        ? <span className="text-xs font-extrabold tracking-wider text-accent">{song.themeSlug}</span>
        : <Music className="w-5 h-5 text-muted" aria-hidden="true" />}
    </div>
  );
}

/** The solved puzzle's tracklist: previews, provider links and hide buttons. */
export const EndScreenModal: React.FC<EndScreenModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  onNextPuzzle,
  onRestartPuzzle,
  onBlacklistArtist,
  onBlacklistSong,
  isLoading = false,
}) => {
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, [isOpen]);

  if (!isOpen) return null;

  const tracks = Array.from(
    new Map(puzzle.clues.map(clue => [clue.song.id, { song: clue.song, answer: clue.answer }])).values()
  );

  const togglePreview = (song: Song) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingSongId === song.id) {
      audio.pause();
      return;
    }
    audio.volume = readSettings().defaultVolume;
    audio.src = playableAudioUrl(song);
    audio.play().then(() => setPlayingSongId(song.id)).catch(() => setPlayingSongId(null));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl p-5 sm:p-7 flex flex-col">
      {({ titleId, descriptionId }) => (
        <>
          <audio ref={audioRef} onEnded={() => setPlayingSongId(null)} onPause={() => setPlayingSongId(null)} />

          <div className="pr-10">
            <div className="text-xs font-bold tracking-[0.14em] text-accent uppercase">Solved</div>
            <h2 id={titleId} className="font-display text-3xl leading-tight mt-1">Songs in this puzzle</h2>
            <p id={descriptionId} className="text-sm text-muted mt-1">Replay the previews, open a track, or hide what you never want again.</p>
          </div>

          <ol className="my-5 flex flex-col divide-y divide-line border-y border-line">
            {tracks.map(({ song, answer }) => {
              const playing = playingSongId === song.id;
              const link = song.providerUrl || song.spotifyUrl;
              const provider = PROVIDER_LABELS[song.provider ?? ''] ?? 'the provider';
              return (
                <li key={song.id} className="py-3 flex items-center gap-3 sm:gap-4">
                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-cell overflow-hidden border border-line">
                    <Cover song={song} />
                    <button
                      type="button"
                      onClick={() => togglePreview(song)}
                      aria-label={`${playing ? 'Pause' : 'Play'} ${song.title}`}
                      className="absolute inset-0 flex items-center justify-center bg-bg/45 hover:bg-bg/25 text-fg transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {playing ? <Pause className="w-5 h-5 fill-current" aria-hidden="true" /> : <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />}
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold line-clamp-2 break-words">{song.title}</div>
                    <div className="text-sm text-muted truncate">{song.artist}{song.animeTitle || song.album ? ` · ${song.animeTitle || song.album}` : ''}</div>
                    <div className="mt-1 font-mono text-xs font-bold tracking-widest text-accent">{answer}</div>
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${song.title} on ${provider}`}
                        title={`Open on ${provider}`}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-control text-fg hover:bg-raised transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      </a>
                    )}
                    {onBlacklistArtist && (
                      <IconButton label={`Hide artist ${song.artist}`} onClick={() => onBlacklistArtist(song)} className="hover:text-bad">
                        <UserX className="w-4 h-4" aria-hidden="true" />
                      </IconButton>
                    )}
                    {onBlacklistSong && (
                      <IconButton label={`Hide song ${song.title}`} onClick={() => onBlacklistSong(song)} className="hover:text-bad">
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      </IconButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onRestartPuzzle} icon={<RotateCcw className="w-4 h-4" aria-hidden="true" />} className="mr-auto">
              Reset grid
            </Button>
            <Button onClick={onClose}>Review board</Button>
            {onNextPuzzle && (
              <Button variant="primary" onClick={onNextPuzzle} disabled={isLoading} icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : undefined}>
                {isLoading ? 'Loading…' : 'Next puzzle'}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};
