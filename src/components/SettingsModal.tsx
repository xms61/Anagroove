import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { Modal } from './Modal';
import { isThemeId, THEMES, ThemeId } from '../themes';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enableWordAnimations: boolean;
  onToggleWordAnimations: (enabled: boolean) => void;
  defaultVolume: number;
  onChangeDefaultVolume: (volume: number) => void;
  theme: ThemeId;
  onChangeTheme: (theme: ThemeId) => void;
}

const SHORTCUTS = [
  ['Space', 'Reveal a letter'],
  ['Tab', 'Reveal the word'],
  ['Shift + Tab', 'Reveal the puzzle'],
] as const;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  enableWordAnimations,
  onToggleWordAnimations,
  defaultVolume,
  onChangeDefaultVolume,
  theme,
  onChangeTheme,
}) => {
  const themeSelectId = useId();
  const volumeId = useId();
  const animationsLabelId = useId();
  const activeTheme = THEMES.find(t => t.id === theme) ?? THEMES[0];

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md p-6 sm:p-7">
      {({ titleId, descriptionId }) => (
        <div className="flex flex-col gap-6">
          <div className="pr-10">
            <h2 id={titleId} className="font-display text-2xl leading-none">Settings</h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted">Theme, sound and animations. Saved on this device.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={themeSelectId} className="text-sm font-bold">Theme</label>
            <div className="relative">
              <select
                id={themeSelectId}
                data-autofocus
                value={theme}
                onChange={e => { if (isThemeId(e.target.value)) onChangeTheme(e.target.value); }}
                className="w-full h-12 pl-3.5 pr-11 appearance-none cursor-pointer bg-raised text-fg border border-line rounded-control text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-muted absolute right-4 top-4 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted">{activeTheme.description}</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor={volumeId} className="text-sm font-bold">Default volume</label>
              <span className="font-mono text-xs text-muted">{Math.round(defaultVolume * 100)}%</span>
            </div>
            <input
              id={volumeId}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={defaultVolume}
              onChange={e => onChangeDefaultVolume(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-hi"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div id={animationsLabelId} className="text-sm font-bold">Word animations</div>
              <div className="text-sm text-muted">Pop and confetti when a word is solved</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enableWordAnimations}
              aria-labelledby={animationsLabelId}
              onClick={() => onToggleWordAnimations(!enableWordAnimations)}
              className={`relative h-7 w-12 shrink-0 p-[3px] flex rounded-control transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                enableWordAnimations ? 'bg-accent justify-end' : 'bg-raised justify-start'
              }`}
            >
              <span className={`h-[22px] w-[22px] rounded-control ${enableWordAnimations ? 'bg-on-accent' : 'bg-muted'}`} />
            </button>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-5">
            <div className="text-sm font-bold">Keyboard</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {SHORTCUTS.map(([key, action]) => (
                <React.Fragment key={key}>
                  <dt><kbd className="px-2 py-0.5 rounded-cell bg-raised border border-line font-mono text-xs font-bold">{key}</kbd></dt>
                  <dd className="text-muted">{action}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-control bg-accent text-on-accent font-bold text-sm shadow-accent hover:brightness-110 transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
