import { cx } from './ui';

interface PlayerDeckProps {
  clueId?: string;
  isPlaying: boolean;
  /** Playback position, 0-100. */
  progress: number;
}

const BARS = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.45, 0.75, 1, 0.55];
const STEPS = 16;

/** Car-radio display: station, clue number and level bars. */
function RadioDeck({ clueId, isPlaying }: PlayerDeckProps) {
  return (
    <div className="w-[88px] sm:w-40 h-12 sm:h-14 px-2.5 py-1.5 flex flex-col justify-between rounded-cell bg-bg border border-hi/35 font-mono">
      <div className="flex justify-between text-xs font-bold text-hi [text-shadow:0_0_8px_rgb(var(--c-hi)/0.8)]">
        <span>FM 88.1</span>
        <span className="hidden sm:inline">{clueId}</span>
      </div>
      <div className="flex items-end gap-[3px] h-4 sm:h-5">
        {BARS.map((height, i) => (
          <span
            key={i}
            className={cx('w-1.5 bg-hi/85 origin-bottom', isPlaying && 'animate-eq-bar', i > 6 && 'hidden sm:block')}
            style={{ height: `${height * 100}%`, animationDelay: `${-i * 0.13}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Drum-machine step lights that fill with playback. */
function StepDeck({ progress }: PlayerDeckProps) {
  const done = Math.floor((progress / 100) * STEPS);
  return (
    <div className="w-[88px] sm:w-40 flex flex-col gap-1.5 font-mono">
      <div className="hidden sm:flex justify-between text-xs font-bold text-muted">
        <span>STEP</span>
        <span className="text-fg">{String(Math.min(done + 1, STEPS)).padStart(2, '0')}/{STEPS}</span>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={cx('h-3 border', i < done ? 'bg-accent border-accent' : i === done ? 'bg-fg border-fg' : 'border-line')} />
        ))}
      </div>
    </div>
  );
}

/** A turntable from above: the record spins and the tonearm moves in as the preview plays. */
function TurntableDeck({ clueId, isPlaying, progress }: PlayerDeckProps) {
  return (
    <div className="relative w-[72px] sm:w-[120px] h-14 sm:h-[68px] shrink-0">
      <div className="absolute left-0 top-0 w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-full bg-bg border-2 border-raised flex items-center justify-center">
        <div className={cx('vinyl-grooves w-[88%] h-[88%] rounded-full flex items-center justify-center animate-spin-record', !isPlaying && 'spin-paused')}>
          <span className="w-[36%] h-[36%] rounded-full bg-accent text-on-accent flex items-center justify-center font-display text-[9px] leading-none">
            {clueId}
          </span>
        </div>
      </div>
      <span className="absolute left-[60px] sm:left-[74px] top-1 w-2 h-2 rounded-full bg-muted" />
      <span
        className="absolute left-[62.5px] sm:left-[76.5px] top-2 w-[3px] h-10 sm:h-12 rounded-full bg-muted origin-top transition-transform duration-500"
        style={{ transform: `rotate(${18 + (progress / 100) * 22}deg)` }}
      />
      <span className="hidden sm:inline absolute left-[92px] top-6 font-display text-sm text-muted">33⅓</span>
    </div>
  );
}

/** The theme's player decoration; `only-<theme>` shows the active one (themes.css). */
export function PlayerDeck(props: PlayerDeckProps) {
  return (
    <div className="shrink-0" aria-hidden="true">
      <div className="only-city"><RadioDeck {...props} /></div>
      <div className="only-berlin"><StepDeck {...props} /></div>
      <div className="only-vinyl"><TurntableDeck {...props} /></div>
    </div>
  );
}
