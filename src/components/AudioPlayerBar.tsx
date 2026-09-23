import React, { useState, useEffect, useRef } from 'react';
import { Clue } from '../../shared/types';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { playableAudioUrl } from '../services/audioSource';
import { readSettings } from '../hooks/useSettings';
import { PlayerDeck } from './PlayerDeck';
import { IconButton } from './ui';

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

const formatSeconds = (sec: number) => {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The docked preview player: theme deck, active clue, seek bar, transport and volume. */
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
  const [volume, setVolume] = useState(() => controlledVolume ?? readSettings().defaultVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [loadError, setLoadError] = useState(false);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const notifyPlayback = (playing: boolean) => {
    setIsPlaying(playing);
    onPlaybackChange?.(playing);
  };

  /** Plays the loaded preview. A blocked autoplay is not a load error, so only a click reports one. */
  const play = ({ reportError = false } = {}) => {
    audioRef.current?.play().then(() => {
      notifyPlayback(true);
      setLoadError(false);
    }).catch(() => {
      notifyPlayback(false);
      if (reportError) setLoadError(true);
    });
  };

  useEffect(() => {
    if (typeof controlledVolume !== 'number') return;
    setVolume(controlledVolume);
    if (audioRef.current) audioRef.current.volume = controlledVolume;
  }, [controlledVolume]);

  // Stop the preview once the puzzle is solved or revealed
  useEffect(() => {
    if (!isCompleted) return;
    audioRef.current?.pause();
    notifyPlayback(false);
  }, [isCompleted]);

  // Load the active clue's preview; keep playing if a preview was already playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeClue?.song.audioUrl) return;
    setLoadError(false);
    audio.volume = volume;
    audio.src = playableAudioUrl(activeClue.song);
    audio.currentTime = 0;
    setCurrentTime(0);
    if (!isCompleted && (isPlaying || playTrigger > 0)) play();
  }, [activeClue?.id, isCompleted]);

  // Selecting a clue (playTrigger) plays it from the start if it had finished
  useEffect(() => {
    const audio = audioRef.current;
    if (playTrigger === 0 || !audio || !activeClue?.song.audioUrl || isCompleted) return;
    if (audio.ended) audio.currentTime = 0;
    play();
  }, [playTrigger]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      notifyPlayback(false);
    } else {
      play({ reportError: true });
    }
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const changeVolume = (next: number) => {
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
    if (next > 0 && isMuted) setIsMuted(false);
    onVolumeChange?.(next);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <section
      aria-label="Preview player"
      className="fixed bottom-3 inset-x-3 sm:bottom-4 sm:inset-x-4 z-40 mx-auto max-w-5xl h-[76px] sm:h-[88px] px-3 sm:px-5 flex items-center gap-3 sm:gap-5 bg-panel border border-line rounded-panel shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current?.duration && setDuration(audioRef.current.duration)}
        onEnded={() => { notifyPlayback(false); setCurrentTime(0); }}
        onError={() => setLoadError(true)}
        onPause={() => notifyPlayback(false)}
        onPlay={() => { notifyPlayback(true); setLoadError(false); }}
      />

      <PlayerDeck clueId={activeClue?.id} isPlaying={isPlaying} progress={progress} />

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {activeClue ? (
          <>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-muted min-w-0">
              <span className="px-2 py-0.5 rounded-cell bg-accent text-on-accent tracking-normal shrink-0">{activeClue.id}</span>
              <span className="hidden sm:inline uppercase truncate">{activeClue.clueType} · {activeClue.length} letters</span>
              {loadError && (
                <span role="img" aria-label="Preview unavailable" title="Preview unavailable" className="shrink-0">
                  <AlertCircle className="w-4 h-4 text-bad" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="text-sm sm:text-base font-bold truncate" title={activeClue.clueText}>{activeClue.clueText}</div>
          </>
        ) : (
          <div className="text-sm text-muted">Select a clue to play its preview</div>
        )}
        <div className="flex items-center gap-2.5 font-mono text-xs text-muted">
          <span className="hidden sm:inline w-8 text-right">{formatSeconds(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={e => seek(parseFloat(e.target.value))}
            aria-label="Seek"
            className="flex-1 h-1 cursor-pointer accent-hi"
          />
          <span className="hidden sm:inline w-8">{formatSeconds(duration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <IconButton label="Previous clue" onClick={onPrevClue} className="hidden sm:inline-flex">
          <SkipBack className="w-4 h-4 fill-current" aria-hidden="true" />
        </IconButton>
        <IconButton
          label={isPlaying ? 'Pause preview' : 'Play preview'}
          variant="primary"
          onClick={togglePlay}
          className="w-12 h-12 sm:w-[52px] sm:h-[52px] !rounded-[var(--radius-play)]"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" aria-hidden="true" /> : <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />}
        </IconButton>
        <IconButton label="Next clue" onClick={onNextClue}>
          <SkipForward className="w-4 h-4 fill-current" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="hidden md:flex items-center gap-2 text-muted">
        <IconButton label={isMuted || volume === 0 ? 'Unmute' : 'Mute'} onClick={toggleMute} className="w-8 h-8">
          {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
        </IconButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={e => changeVolume(parseFloat(e.target.value))}
          aria-label="Volume"
          className="w-20 cursor-pointer accent-hi"
        />
      </div>
    </section>
  );
};
