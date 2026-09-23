import React, { useState, useRef, useEffect } from 'react';
import { Puzzle } from '../types/crossword';
import { Play, Pause, ExternalLink, RotateCcw, Trophy, Ban, Loader2, Music } from 'lucide-react';
import { Modal } from './Modal';
import { readSettings } from '../hooks/useSettings';
import { Song } from '../types/crossword';
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
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);


  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = readSettings().defaultVolume;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const uniqueSongs = Array.from(
    new Map(puzzle.clues.map(clue => [clue.song.id, { song: clue.song, answer: clue.answer }])).values()
  );

  const handlePlayAudio = async (songId: string, audioUrl: string) => {
    if (!audioRef.current) return;

    if (playingSongId === songId) {
      audioRef.current.pause();
      setPlayingSongId(null);
    } else {
      audioRef.current.volume = readSettings().defaultVolume;
      audioRef.current.src = audioUrl;
      audioRef.current.play().then(() => {
        setPlayingSongId(songId);
      }).catch((err) => {
        console.warn('Preview playback failed:', err);
        setPlayingSongId(null);
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="border-accent/25 max-w-2xl p-6 flex flex-col">
      {({ titleId, descriptionId }) => (
      <>
      <audio
        ref={audioRef}
        onEnded={() => setPlayingSongId(null)}
        onPause={() => setPlayingSongId(null)}
      />

        {/* Top Banner */}
        <div className="flex items-center justify-between pb-4 border-b border-line/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ok/20 border border-ok/35 text-ok flex items-center justify-center shadow-sm">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-xl font-bold tracking-wide text-fg">
                Songs In This Puzzle
              </h2>
              <p id={descriptionId} className="text-xs text-muted">
                Puzzle Solved! Replay tracks, launch on Spotify, or manage your blacklist.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Song List */}
        <div className="flex-1 overflow-y-auto my-4 pr-1 divide-y divide-line/5">
          {uniqueSongs.map(({ song, answer }) => {
            const isCurrentPlaying = playingSongId === song.id;
            const hasValidImage = Boolean(song.albumArt && song.albumArt.startsWith('http') && !failedImages[song.id]);

            return (
              <div
                key={song.id}
                className="py-3 px-2 flex items-center justify-between gap-4 hover:bg-fg/5 rounded-xl transition group"
              >
                {/* Left: Artwork & Metadata */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-bg/40 shadow-md group border border-line/10">
                    {hasValidImage ? (
                      <img
                        src={song.albumArt}
                        alt={song.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setFailedImages(prev => ({ ...prev, [song.id]: true }))}
                      />
                    ) : (
                      <div className={`w-full h-full flex flex-col items-center justify-center p-1 text-center select-none ${
                        song.isAnimeOped
                          ? 'bg-gradient-to-br from-hi/15 via-hi/15 to-bad/15 border border-hi/20'
                          : 'bg-gradient-to-br from-raised to-bg border border-line'
                      }`}>
                        {song.themeSlug ? (
                          <span className="text-xs font-black tracking-wider text-accent drop-shadow">
                            {song.themeSlug}
                          </span>
                        ) : (
                          <Music className="w-5 h-5 text-muted" />
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(song.id, playableAudioUrl(song))}
                      className="absolute inset-0 bg-bg/50 flex items-center justify-center opacity-90 group-hover:opacity-100 transition cursor-pointer"
                      title={isCurrentPlaying ? "Pause preview" : "Play preview"}
                    >
                      {isCurrentPlaying ? (
                        <Pause className="w-6 h-6 fill-accent text-accent drop-shadow" />
                      ) : (
                        <Play className="w-6 h-6 fill-accent text-accent ml-0.5 drop-shadow" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col flex-1 min-w-0 pr-2">
                    <span className="font-bold text-sm text-fg break-words line-clamp-2">
                      {song.title}
                    </span>
                    <span className="text-xs text-accent/90 break-words font-medium mt-0.5">
                      {song.artist}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      {song.themeSlug && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-bold tracking-wider uppercase bg-accent/20 text-accent border border-accent/30">
                          {song.themeSlug}
                        </span>
                      )}
                      <span className="text-xs text-muted truncate font-mono">
                        {song.animeTitle || song.album}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Answer, Blacklist Actions & Spotify Link */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* Quick Blacklist Actions */}
                  {onBlacklistArtist && (
                    <button
                      type="button"
                      onClick={() => onBlacklistArtist(song)}
                      title={`Blacklist artist: ${song.artist}`}
                      className="p-1.5 text-muted hover:text-bad hover:bg-bad/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs"
                    >
                      <Ban className="w-3.5 h-3.5 text-bad" />
                      <span className="hidden md:inline">Block Artist</span>
                    </button>
                  )}

                  {onBlacklistSong && (
                    <button
                      type="button"
                      onClick={() => onBlacklistSong(song)}
                      title={`Blacklist track: ${song.title}`}
                      className="p-1.5 text-muted hover:text-bad hover:bg-bad/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs"
                    >
                      <Ban className="w-3.5 h-3.5 text-bad" />
                      <span className="hidden md:inline">Block Track</span>
                    </button>
                  )}

                  <span className="font-mono font-bold text-sm md:text-base tracking-widest text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-lg">
                    {answer}
                  </span>

                  {(song.providerUrl || song.spotifyUrl) && (() => {
                    const providerLabel = song.provider === 'deezer' ? 'Deezer' : song.provider === 'itunes' ? 'Apple Music' : 'Spotify';
                    const badgeStyle = song.provider === 'itunes'
                      ? 'bg-bad/20 text-bad hover:bg-bad hover:text-fg border-bad/30'
                      : song.provider === 'deezer'
                        ? 'bg-hi/20 text-hi hover:bg-hi hover:text-fg border-hi/30'
                        : 'bg-accent/20 text-accent hover:bg-accent hover:text-on-accent border-accent/30';
                    return (
                      <a
                        href={song.providerUrl || song.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition shadow-sm border ${badgeStyle}`}
                        title={`Open track on ${providerLabel}`}
                      >
                        <span>{providerLabel}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-line/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onRestartPuzzle}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg/5 hover:bg-fg/10 text-xs font-medium text-fg transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Grid</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-fg/10 hover:bg-fg/15 text-sm font-semibold text-fg transition cursor-pointer"
            >
              Review Board
            </button>

            {onNextPuzzle && (
              <button
                type="button"
                onClick={onNextPuzzle}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-accent to-accent hover:from-accent hover:to-accent disabled:opacity-50 disabled:cursor-not-allowed text-on-accent text-sm font-black transition cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-on-accent" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <span>Next Puzzle</span>
                )}
              </button>
            )}
          </div>
        </div>
      </>
      )}
    </Modal>
  );
};
