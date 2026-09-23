import React from 'react';
import { Settings, Sparkles, Volume2, VolumeX, Keyboard } from 'lucide-react';
import { Modal } from './Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enableWordAnimations: boolean;
  onToggleWordAnimations: (enabled: boolean) => void;
  defaultVolume: number;
  onChangeDefaultVolume: (volume: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  enableWordAnimations,
  onToggleWordAnimations,
  defaultVolume,
  onChangeDefaultVolume,
}) => {
  if (!isOpen) return null;

  const volumePercent = Math.round(defaultVolume * 100);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="border-amber-500/25 max-w-md p-6">
      {({ titleId, descriptionId }) => (
      <>
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/35 text-amber-300 flex items-center justify-center shadow-sm">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-white">Lounge Settings</h2>
            <p id={descriptionId} className="text-xs text-slate-400">Personalize animations, audio playback, and controls.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Setting 1: Word Correct Animation Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-kissa-card border border-white/5">
            <div className="flex items-center gap-3.5 pr-4">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-100">Word Correct Animation</div>
                <div className="text-xs text-slate-400 leading-snug">
                  Play bouncy tile celebration when a word is solved
                </div>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={enableWordAnimations}
              onClick={() => onToggleWordAnimations(!enableWordAnimations)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enableWordAnimations ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  enableWordAnimations ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Setting 2: Default Volume Slider */}
          <div className="p-3.5 rounded-xl bg-kissa-card border border-white/5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
                  {volumePercent === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-100">Default Audio Volume</div>
                  <div className="text-xs text-slate-400 leading-snug">
                    Default playback level for preview tracks
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-black/50 text-amber-300 font-mono text-xs border border-amber-500/20 shadow-inner font-bold">
                {volumePercent}%
              </span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs text-slate-400 font-mono">0%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={defaultVolume}
                onChange={e => onChangeDefaultVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-xs text-slate-400 font-mono">100%</span>
            </div>
          </div>

          {/* Setting 3: Keyboard Shortcuts Info Card */}
          <div className="p-3.5 rounded-xl bg-kissa-surface border border-white/5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Keyboard className="w-3.5 h-3.5 text-amber-400" />
              <span>Keyboard Shortcuts</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="flex items-center justify-between bg-black/40 px-2 py-1 rounded border border-white/5">
                <span className="text-slate-400">Reveal Letter</span>
                <kbd className="px-1.5 py-0.2 rounded bg-kissa-panel text-amber-300 font-mono font-bold text-xs">Space</kbd>
              </div>
              <div className="flex items-center justify-between bg-black/40 px-2 py-1 rounded border border-white/5">
                <span className="text-slate-400">Reveal Word</span>
                <kbd className="px-1.5 py-0.2 rounded bg-kissa-panel text-amber-300 font-mono font-bold text-xs">Tab</kbd>
              </div>
              <div className="flex items-center justify-between bg-black/40 px-2 py-1 rounded border border-white/5 col-span-2">
                <span className="text-slate-400">Reveal Entire Puzzle</span>
                <kbd className="px-1.5 py-0.2 rounded bg-kissa-panel text-amber-300 font-mono font-bold text-xs">Shift + Tab</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-md"
          >
            Done
          </button>
        </div>
      </>
      )}
    </Modal>
  );
};
