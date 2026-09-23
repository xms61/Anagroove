import React from 'react';
import { Clue } from '../types/crossword';
import { Modal } from './Modal';

interface HintModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeClue?: Clue;
  onApplyHint: (type: 'letter' | 'word' | 'puzzle') => void;
}

export const HintModal: React.FC<HintModalProps> = ({ isOpen, onClose, activeClue, onApplyHint }) => {
  const options = [
    { type: 'letter', title: 'Reveal a letter', detail: 'The correct letter in the selected cell.', key: 'Space' },
    { type: 'word', title: `Reveal the word${activeClue ? ` (${activeClue.id})` : ''}`, detail: 'Fills in the whole active word.', key: 'Tab' },
    { type: 'puzzle', title: 'Reveal the puzzle', detail: 'Solves every cell and shows the tracklist.', key: 'Shift + Tab' },
  ] as const;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md p-6 sm:p-7">
      {({ titleId, descriptionId }) => (
        <div className="flex flex-col gap-5">
          <div className="pr-10">
            <h2 id={titleId} className="font-display text-2xl leading-none">Hint</h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted">How much help do you want?</p>
          </div>

          <div className="flex flex-col gap-2">
            {options.map(option => (
              <button
                key={option.type}
                type="button"
                data-autofocus={option.type === 'letter' ? true : undefined}
                onClick={() => {
                  onApplyHint(option.type);
                  onClose();
                }}
                className="flex items-center gap-4 p-3.5 rounded-control bg-raised/60 hover:bg-raised border border-line text-left transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{option.title}</span>
                  <span className="block text-sm text-muted">{option.detail}</span>
                </span>
                <kbd className="shrink-0 px-2 py-0.5 rounded-cell bg-bg/60 border border-line font-mono text-xs font-bold">{option.key}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};
