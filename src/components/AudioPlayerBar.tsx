import React, { useState, useEffect, useRef } from 'react';
import { Clue } from '../types/crossword';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { playableAudioUrl } from '../services/audioSource';
import { readSettings } from '../hooks/useSettings';

interface AudioPlayerBarProps {
  activeClue?: Clue;
  onPrevClue: () => void;
  onNextClue: () => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isCompleted?: boolean;
  playTrigger?: number;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  activeClue,
  onPrevClue,
  onNextClue,
  onPlaybackChange,
  volume: controlledVolume,
  onVolumeChange,
  isCompleted = false,
  playTrigger = 0,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof controlledVolume === 'number') return controlledVolume;
    return readSettings().defaultVolume;
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
    audioRef.current.src = playableAudioUrl(activeClue.song);
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setProgress(0);

    // Play if already playing or clicked via word field
    if (!isCompleted && (isPlaying || playTrigger > 0)) {
      audioRef.current.play().then(() => {
        notifyPlayback(true);
      }).catch(() => notifyPlayback(false));
    }
  }, [activeClue?.id, isCompleted]);

  // Play audio whenever user clicks a word field (even if previously paused or completed snippet)
  useEffect(() => {
    if (playTrigger === 0 || !audioRef.current || !activeClue?.song.audioUrl || isCompleted) return;

    if (audioRef.current.ended || audioRef.current.currentTime >= (audioRef.current.duration || 30)) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setProgress(0);
    }

    audioRef.current.play().then(() => {
      notifyPlayback(true);
      setLoadError(false);
    }).catch((err) => {
      console.warn('Word field playback failed:', err);
    });
  }, [playTrigger]);

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
      <div className="bg-surface/95 backdrop-blur-xl text-fg rounded-2xl px-5 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.85)] flex flex-col sm:flex-row items-center justify-between gap-4 border border-accent/30 relative overflow-hidden">
        {/* Subtle brass plate top edge */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent/40 to-transparent pointer-events-none" />

        {/* Left: Active Clue Info with VU Meter & Letter Pips */}
        <div className="flex items-center gap-3.5 w-full sm:w-auto overflow-hidden">
          {/* Dual VU Meter / Analog Level Indicator */}
          <div className="w-10 h-10 rounded-xl bg-bg border border-accent/30 flex items-center justify-center shrink-0 p-1.5 shadow-inner">
            {isPlaying ? (
              <div className="flex items-end gap-[3px] h-5">
                <div className="w-1 bg-accent rounded-full animate-eq-1" />
                <div className="w-1 bg-accent rounded-full animate-eq-2" />
                <div className="w-1 bg-accent rounded-full animate-eq-3" />
                <div className="w-1 bg-accent rounded-full animate-eq-4" />
              </div>
            ) : (
              <div className="flex items-center gap-[2px] opacity-40">
                <div className="w-1 h-2 bg-accent rounded-full" />
                <div className="w-1 h-3.5 bg-accent rounded-full" />
                <div className="w-1 h-1.5 bg-accent rounded-full" />
              </div>
            )}
          </div>

          {activeClue ? (
            <div className="flex flex-col truncate">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-accent text-on-accent font-black rounded-md font-mono text-xs shrink-0 shadow-sm">
                  {activeClue.id}
                </span>
                <span className="text-xs text-muted font-mono uppercase tracking-wider">
                  {activeClue.clueType} • {activeClue.length} LETTERS
                </span>
              </div>
              <span className="text-sm font-semibold truncate text-fg mt-0.5" title={activeClue.clueText}>
                {activeClue.clueText}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted text-sm">
              <span className="text-accent font-mono text-xs uppercase tracking-wider">READY •</span>
              <span>Select any clue to play its blind 30s preview</span>
            </div>
          )}
        </div>

        {/* Right: Tactile Analog Controls & Volume */}
        <div className="flex items-center gap-3 shrink-0">
          {loadError && (
            <span className="text-xs text-accent flex items-center gap-1 font-medium bg-accent/15 px-2 py-0.5 rounded-full border border-accent/30">
              <AlertCircle className="w-3 h-3 text-accent" /> Preview unavailable
            </span>
          )}

          {/* Previous Clue */}
          <button
            type="button"
            onClick={onPrevClue}
            title="Previous Clue"
            className="w-8 h-8 flex items-center justify-center hover:bg-fg/10 rounded-full text-fg hover:text-fg transition cursor-pointer"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          {/* Play / Pause Brushed Brass Button */}
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Play Clue Audio"}
            className="w-10 h-10 bg-gradient-to-tr from-accent to-accent hover:from-accent hover:to-accent active:scale-95 text-on-accent rounded-full flex items-center justify-center transition-all cursor-pointer font-black"
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
            className="w-8 h-8 flex items-center justify-center hover:bg-fg/10 rounded-full text-fg hover:text-fg transition cursor-pointer"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-2 ml-1 border-l border-line/10 pl-3">
            <button
              type="button"
              onClick={toggleMute}
              className="text-muted hover:text-accent p-1 cursor-pointer transition"
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
              className="w-14 sm:w-16 h-1.5 bg-raised rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>
      </div>

      {/* Interactive Audio Sample Scrubber Bar */}
      <div className="w-full bg-bg border-x border-b border-accent/30 rounded-b-xl px-4 py-1.5 -mt-1 mx-auto max-w-[calc(100%-16px)] flex items-center gap-3 shadow-lg select-none">
        <span className="text-xs font-mono text-accent font-bold w-9 text-right shrink-0">
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
          <div className="w-full h-1.5 group-hover:h-2 bg-raised rounded-full overflow-hidden transition-all relative">
            {/* Played gradient progress */}
            <div
              className="bg-gradient-to-r from-accent via-accent to-accent h-full rounded-full transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Seeker playhead thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-accent rounded-full border-2 border-line opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progress}%` }}
          />
        </div>

        <span className="text-xs font-mono text-muted font-semibold w-9 shrink-0">
          {formatSeconds(duration)}
        </span>

        {/* Quick -5s / +5s skip controls */}
        <div className="flex items-center gap-1 shrink-0 border-l border-line/10 pl-2">
          <button
            type="button"
            onClick={() => handleSkipSeconds(-5)}
            title="Skip back 5 seconds"
            className="px-1.5 py-0.5 rounded bg-fg/5 hover:bg-fg/15 text-xs font-mono text-fg hover:text-fg transition cursor-pointer"
          >
            -5s
          </button>
          <button
            type="button"
            onClick={() => handleSkipSeconds(5)}
            title="Skip forward 5 seconds"
            className="px-1.5 py-0.5 rounded bg-fg/5 hover:bg-fg/15 text-xs font-mono text-fg hover:text-fg transition cursor-pointer"
          >
            +5s
          </button>
        </div>
      </div>

      {/* Vintage Salon Subtitle */}
      <p className="text-xs text-muted/80 mt-1 text-center font-mono">
        Blind Audio Preview • Artists and track titles revealed upon solving
      </p>
    </div>
  );
};
