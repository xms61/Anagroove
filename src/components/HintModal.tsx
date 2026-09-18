import React from 'react';
import { Clue } from '../types/crossword';
import { Lightbulb, X, Type, FileText, CheckCircle2, Keyboard } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-amber-500/25 rounded-2xl max-w-md w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative text-slate-100">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/35 text-amber-300 flex items-center justify-center shadow-sm">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Need a Hint?</h2>
            <p className="text-xs text-slate-400">Choose how much assistance you want with this music puzzle.</p>
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
            className="flex items-center gap-4 p-3 rounded-xl bg-[#181e2c] hover:bg-[#202738] border border-white/5 hover:border-cyan-500/30 text-left transition group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Type className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-100">
                Reveal Letter
              </div>
              <div className="text-xs text-slate-400">Reveals the correct letter at your selected cell.</div>
            </div>
          </button>

          {/* Option 2: Reveal Word */}
          <button
            type="button"
            onClick={() => {
              onApplyHint('word');
              onClose();
            }}
            className="flex items-center gap-4 p-3 rounded-xl bg-[#181e2c] hover:bg-[#202738] border border-white/5 hover:border-amber-500/30 text-left transition group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-100">
                Reveal Word {activeClue ? `(${activeClue.id})` : ''}
              </div>
              <div className="text-xs text-slate-400">
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
            className="flex items-center gap-4 p-3 rounded-xl bg-[#181e2c] hover:bg-[#202738] border border-white/5 hover:border-emerald-500/30 text-left transition group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-slate-100">
                Reveal Whole Puzzle
              </div>
              <div className="text-xs text-slate-400">Solves all cells and reveals full track showcase.</div>
            </div>
          </button>
        </div>

        {/* Unified Keyboard Shortcuts Field */}
        <div className="mt-4 p-3 rounded-xl bg-[#131724] border border-white/10">
          <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold text-slate-300">
            <Keyboard className="w-4 h-4 text-amber-400" />
            <span>Keyboard Shortcuts</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#181e2c] border border-white/5">
              <span className="text-[11px] text-slate-400 mb-1">Letter</span>
              <kbd className="px-2 py-0.5 rounded bg-black/60 text-cyan-300 font-mono text-[11px] border border-cyan-500/20 shadow-inner">Space</kbd>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#181e2c] border border-white/5">
              <span className="text-[11px] text-slate-400 mb-1">Word</span>
              <kbd className="px-2 py-0.5 rounded bg-black/60 text-amber-300 font-mono text-[11px] border border-amber-500/20 shadow-inner">Tab</kbd>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#181e2c] border border-white/5">
              <span className="text-[11px] text-slate-400 mb-1">Puzzle</span>
              <kbd className="px-2 py-0.5 rounded bg-black/60 text-emerald-300 font-mono text-[10px] border border-emerald-500/20 shadow-inner">Shift+Tab</kbd>
            </div>
          </div>
        </div>

        {/* Cancel */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg transition cursor-pointer font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
