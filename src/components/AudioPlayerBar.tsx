import React, { useState, useEffect, useRef } from 'react';
import { Clue } from '../types/crossword';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, AlertCircle } from 'lucide-react';

interface AudioPlayerBarProps {
  activeClue?: Clue;
  onPrevClue: () => void;
  onNextClue: () => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isCompleted?: boolean;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  activeClue,
  onPrevClue,
  onNextClue,
  onPlaybackChange,
  volume: controlledVolume,
  onVolumeChange,
  isCompleted = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof controlledVolume === 'number') return controlledVolume;
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
  });
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [loadError, setLoadError] = useState(false);

  const notifyPlayback = (playing: boolean) => {
    setIsPlaying(playing);
    onPlaybackChange?.(playing);
  };

  // Sync controlled volume when passed
  useEffect(() => {
    if (typeof controlledVolume === 'number') {
      setVolume(controlledVolume);
      if (audioRef.current && !isMuted) {
        audioRef.current.volume = controlledVolume;
      }
    }
  }, [controlledVolume]);

  // Ensure default base volume of 15% on mount
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, []);

  // Stop background music when puzzle is revealed or completed
  useEffect(() => {
    if (isCompleted) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      notifyPlayback(false);
    }
  }, [isCompleted]);

  // Sync audio source when active clue changes
  useEffect(() => {
    if (!audioRef.current || !activeClue?.song.audioUrl) return;

    setLoadError(false);
    audioRef.current.volume = isMuted ? 0 : volume;
    audioRef.current.src = activeClue.song.audioUrl;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setProgress(0);

    // If was already playing and puzzle is not completed/revealed, continue playing the new clue snippet
    if (isPlaying && !isCompleted) {
      audioRef.current.play().catch(() => notifyPlayback(false));
    }
  }, [activeClue?.id, isCompleted]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      notifyPlayback(false);
    } else {
      audioRef.current.play().then(() => {
        notifyPlayback(true);
        setLoadError(false);
      }).catch((err) => {
        console.warn('Audio playback failed:', err);
        notifyPlayback(false);
        setLoadError(true);
      });
    }
  };

  // Time update listener
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const total = audioRef.current.duration || 30;
    setCurrentTime(current);
    setDuration(total);
    setProgress((current / total) * 100);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current?.duration) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    notifyPlayback(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = clickX / rect.width;
    const total = audioRef.current.duration || 30;
    const target = pct * total;
    audioRef.current.currentTime = target;
    setCurrentTime(target);
    setProgress(pct * 100);
  };

  const handleSkipSeconds = (offset: number) => {
    if (!audioRef.current) return;
    const total = audioRef.current.duration || 30;
    const target = Math.max(0, Math.min(total, audioRef.current.currentTime + offset));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
    setProgress((target / total) * 100);
  };

  const formatSeconds = (sec: number) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${m}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const handleAudioError = () => setLoadError(true);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    }
    onVolumeChange?.(newVol);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRef.current.muted = nextMuted;
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-40">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleAudioError}
        onPause={() => notifyPlayback(false)}
        onPlay={() => {
          notifyPlayback(true);
          setLoadError(false);
        }}
      />

      {/* Floating Analog Preamp Deck */}
      <div className="bg-[#12141c]/95 backdrop-blur-xl text-slate-100 rounded-2xl px-5 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.85)] flex flex-col sm:flex-row items-center justify-between gap-4 border border-amber-500/30 relative overflow-hidden">
        {/* Subtle brass plate top edge */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent pointer-events-none" />

        {/* Left: Active Clue Info with VU Meter & Letter Pips */}
        <div className="flex items-center gap-3.5 w-full sm:w-auto overflow-hidden">
          {/* Dual VU Meter / Analog Level Indicator */}
          <div className="w-10 h-10 rounded-xl bg-[#0c0d12] border border-amber-500/30 flex items-center justify-center shrink-0 p-1.5 shadow-inner">
            {isPlaying ? (
              <div className="flex items-end gap-[3px] h-5">
                <div className="w-1 bg-amber-400 rounded-full animate-eq-1" />
                <div className="w-1 bg-amber-500 rounded-full animate-eq-2" />
                <div className="w-1 bg-amber-300 rounded-full animate-eq-3" />
                <div className="w-1 bg-amber-500 rounded-full animate-eq-4" />
              </div>
            ) : (
              <div className="flex items-center gap-[2px] opacity-40">
                <div className="w-1 h-2 bg-amber-600 rounded-full" />
                <div className="w-1 h-3.5 bg-amber-600 rounded-full" />
                <div className="w-1 h-1.5 bg-amber-600 rounded-full" />
              </div>
            )}
          </div>

          {activeClue ? (
            <div className="flex flex-col truncate">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black rounded-md font-mono text-xs shrink-0 shadow-sm">
                  {activeClue.id}
                </span>
                <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                  {activeClue.clueType} • {activeClue.length} LETTERS
                </span>
              </div>
              <span className="text-sm font-semibold truncate text-white mt-0.5" title={activeClue.clueText}>
                {activeClue.clueText}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <span className="text-amber-400 font-mono text-xs uppercase tracking-wider">READY •</span>
              <span>Select any clue to play its blind 30s preview</span>
            </div>
          )}
        </div>

        {/* Right: Tactile Analog Controls & Volume */}
        <div className="flex items-center gap-3 shrink-0">
          {loadError && (
            <span className="text-xs text-amber-300 flex items-center gap-1 font-medium bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/30">
              <AlertCircle className="w-3 h-3 text-amber-400" /> Preview unavailable
            </span>
          )}

          {/* Previous Clue */}
          <button
            type="button"
            onClick={onPrevClue}
            title="Previous Clue"
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          {/* Play / Pause Brushed Brass Button */}
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Play Clue Audio"}
            className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 rounded-full flex items-center justify-center shadow-[0_0_18px_rgba(245,158,11,0.45)] transition-all cursor-pointer font-black"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Next Clue */}
          <button
            type="button"
            onClick={onNextClue}
            title="Next Clue"
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-2 ml-1 border-l border-white/10 pl-3">
            <button
              type="button"
              onClick={toggleMute}
              className="text-slate-400 hover:text-amber-300 p-1 cursor-pointer transition"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-14 sm:w-16 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Interactive Audio Sample Scrubber Bar */}
      <div className="w-full bg-[#0d0f17] border-x border-b border-amber-500/30 rounded-b-xl px-4 py-1.5 -mt-1 mx-auto max-w-[calc(100%-16px)] flex items-center gap-3 shadow-lg select-none">
        <span className="text-[10px] font-mono text-amber-300 font-bold w-9 text-right shrink-0">
          {formatSeconds(currentTime)}
        </span>

        <div
          onClick={handleSeek}
          role="slider"
          aria-label="Seek audio sample"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          title="Click or jump to sample timestamp"
          className="flex-1 h-3 flex items-center cursor-pointer group relative"
        >
          {/* Background track */}
          <div className="w-full h-1.5 group-hover:h-2 bg-slate-800 rounded-full overflow-hidden transition-all relative">
            {/* Played gradient progress */}
            <div
              className="bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 h-full rounded-full transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Seeker playhead thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-amber-300 rounded-full border-2 border-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.8)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progress}%` }}
          />
        </div>

        <span className="text-[10px] font-mono text-slate-400 font-semibold w-9 shrink-0">
          {formatSeconds(duration)}
        </span>

        {/* Quick -5s / +5s skip controls */}
        <div className="flex items-center gap-1 shrink-0 border-l border-white/10 pl-2">
          <button
            type="button"
            onClick={() => handleSkipSeconds(-5)}
            title="Skip back 5 seconds"
            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[10px] font-mono text-slate-300 hover:text-white transition cursor-pointer"
          >
            -5s
          </button>
          <button
            type="button"
            onClick={() => handleSkipSeconds(5)}
            title="Skip forward 5 seconds"
            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[10px] font-mono text-slate-300 hover:text-white transition cursor-pointer"
          >
            +5s
          </button>
        </div>
      </div>

      {/* Vintage Salon Subtitle */}
      <p className="text-[10px] text-slate-400/80 mt-1 text-center font-mono">
        Blind Audio Preview • Artists and track titles revealed upon solving
      </p>
    </div>
  );
};
