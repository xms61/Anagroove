import React, { useState, useRef, useEffect } from 'react';
import { Puzzle } from '../types/crossword';
import { Play, Pause, ExternalLink, X, RotateCcw, Trophy, Ban } from 'lucide-react';
import { Song } from '../types/crossword';

interface EndScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: Puzzle;
  onNextPuzzle?: () => void;
  onRestartPuzzle?: () => void;
  onBlacklistArtist?: (song: Song) => void;
  onBlacklistSong?: (song: Song) => void;
}

export const EndScreenModal: React.FC<EndScreenModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  onNextPuzzle,
  onRestartPuzzle,
  onBlacklistArtist,
  onBlacklistSong,
}) => {
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getSavedVolume = () => {
    try {
      const saved = localStorage.getItem('spotyspice_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.defaultVolume === 'number') return parsed.defaultVolume;
      }
    } catch {
      // ignore storage errors
    }
    return 0.15;
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = getSavedVolume();
    }
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
      audioRef.current.volume = getSavedVolume();
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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingSongId(null)}
        onPause={() => setPlayingSongId(null)}
      />

      <div className="bg-[#121622] border border-amber-500/25 rounded-2xl max-w-2xl w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100 flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Banner */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shadow-sm">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wide text-white">
                Songs In This Puzzle
              </h2>
              <p className="text-xs text-slate-400">
                Puzzle Solved! Replay tracks, launch on Spotify, or manage your blacklist.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Song List */}
        <div className="flex-1 overflow-y-auto my-4 pr-1 divide-y divide-white/5">
          {uniqueSongs.map(({ song, answer }) => {
            const isCurrentPlaying = playingSongId === song.id;

            return (
              <div
                key={song.id}
                className="py-3 px-2 flex items-center justify-between gap-4 hover:bg-white/5 rounded-xl transition group"
              >
                {/* Left: Artwork & Metadata */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-black/40 shadow-md group border border-white/10">
                    <img
                      src={song.albumArt}
                      alt={song.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(song.id, song.audioUrl)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-90 group-hover:opacity-100 transition cursor-pointer"
                      title={isCurrentPlaying ? "Pause preview" : "Play preview"}
                    >
                      {isCurrentPlaying ? (
                        <Pause className="w-6 h-6 fill-amber-400 text-amber-400 drop-shadow" />
                      ) : (
                        <Play className="w-6 h-6 fill-amber-400 text-amber-400 ml-0.5 drop-shadow" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm text-slate-100 truncate">
                      {song.title}
                    </span>
                    <span className="text-xs text-amber-200/80 truncate flex items-center gap-1.5 font-medium">
                      <span>{song.artist}</span>
                    </span>
                    <span className="text-[10.5px] text-slate-500 truncate mt-0.5 font-mono">
                      {song.album}
                    </span>
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
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px]"
                    >
                      <Ban className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden md:inline">Block Artist</span>
                    </button>
                  )}

                  {onBlacklistSong && (
                    <button
                      type="button"
                      onClick={() => onBlacklistSong(song)}
                      title={`Blacklist track: ${song.title}`}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px]"
                    >
                      <Ban className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden md:inline">Block Track</span>
                    </button>
                  )}

                  <span className="font-mono font-bold text-sm md:text-base tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg">
                    {answer}
                  </span>

                  {(song.providerUrl || song.spotifyUrl) && (() => {
                    const providerLabel = song.provider === 'deezer' ? 'Deezer' : song.provider === 'itunes' ? 'Apple Music' : 'Spotify';
                    const badgeStyle = song.provider === 'itunes'
                      ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white border-rose-500/30'
                      : song.provider === 'deezer'
                        ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white border-purple-500/30'
                        : 'bg-[#1db954]/20 text-[#1db954] hover:bg-[#1db954] hover:text-slate-950 border-[#1db954]/30';
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
        <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onRestartPuzzle}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Grid</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold text-slate-200 transition cursor-pointer"
            >
              Review Board
            </button>

            {onNextPuzzle && (
              <button
                type="button"
                onClick={onNextPuzzle}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-sm font-black shadow-[0_0_15px_rgba(245,158,11,0.35)] transition cursor-pointer"
              >
                Next Puzzle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
