import React from 'react';
import { Clue } from '../types/crossword';
import { Lightbulb, Type, FileText, CheckCircle2, Keyboard } from 'lucide-react';
import { Modal } from './Modal';

interface HintModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeClue?: Clue;
  onApplyHint: (type: 'letter' | 'word' | 'puzzle') => void;
}

export const HintModal: React.FC<HintModalProps> = ({
  isOpen,
  onClose,
  activeClue,
  onApplyHint,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="border-accent/25 max-w-md p-6">
      {({ titleId, descriptionId }) => (
      <>
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/35 text-accent flex items-center justify-center shadow-sm">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-fg">Need a Hint?</h2>
            <p id={descriptionId} className="text-xs text-muted">Choose how much assistance you want with this music puzzle.</p>
          </div>
        </div>

        {/* Hint Options */}
        <div className="flex flex-col gap-2.5">
          {/* Option 1: Reveal Letter */}
          <button
            type="button"
            onClick={() => {
              onApplyHint('letter');
              onClose();
            }}
            className="flex items-center gap-4 p-3 rounded-xl bg-panel hover:bg-raised border border-line/5 hover:border-hi/30 text-left transition group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-hi/20 border border-hi/30 text-hi flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Type className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-fg">
                Reveal Letter
              </div>
              <div className="text-xs text-muted">Reveals the correct letter at your selected cell.</div>
            </div>
          </button>

          {/* Option 2: Reveal Word */}
          <button
            type="button"
            onClick={() => {
              onApplyHint('word');
              onClose();
            }}
            className="flex items-center gap-4 p-3 rounded-xl bg-panel hover:bg-raised border border-line/5 hover:border-accent/30 text-left transition group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/20 border border-accent/30 text-accent flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-fg">
                Reveal Word {activeClue ? `(${activeClue.id})` : ''}
              </div>
              <div className="text-xs text-muted">
                Fills in the entire active word on the grid.
              </div>
            </div>
          </button>

          {/* Option 3: Reveal Whole Puzzle */}
          <button
            type="button"
            onClick={() => {
              onApplyHint('puzzle');
              onClose();
            }}
            className="flex items-center gap-4 p-3 rounded-xl bg-panel hover:bg-raised border border-line/5 hover:border-ok/30 text-left transition group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-ok/20 border border-ok/30 text-ok flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-fg">
                Reveal Whole Puzzle
              </div>
              <div className="text-xs text-muted">Solves all cells and reveals full track showcase.</div>
            </div>
          </button>
        </div>

        {/* Unified Keyboard Shortcuts Field */}
        <div className="mt-4 p-3 rounded-xl bg-surface border border-line/10">
          <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold text-fg">
            <Keyboard className="w-4 h-4 text-accent" />
            <span>Keyboard Shortcuts</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-panel border border-line/5">
              <span className="text-xs text-muted mb-1">Letter</span>
              <kbd className="px-2 py-0.5 rounded bg-bg/60 text-hi font-mono text-xs border border-hi/20 shadow-inner">Space</kbd>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-panel border border-line/5">
              <span className="text-xs text-muted mb-1">Word</span>
              <kbd className="px-2 py-0.5 rounded bg-bg/60 text-accent font-mono text-xs border border-accent/20 shadow-inner">Tab</kbd>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-panel border border-line/5">
              <span className="text-xs text-muted mb-1">Puzzle</span>
              <kbd className="px-2 py-0.5 rounded bg-bg/60 text-ok font-mono text-xs border border-ok/20 shadow-inner">Shift+Tab</kbd>
            </div>
          </div>
        </div>

        {/* Cancel */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-muted hover:text-fg rounded-lg transition cursor-pointer font-medium"
          >
            Cancel
          </button>
        </div>
      </>
      )}
    </Modal>
  );
};
