import React from 'react';
import { ThemeCategory, Puzzle } from '../types/crossword';
import { X, Shuffle } from 'lucide-react';

interface PuzzlePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: ThemeCategory;
  currentPuzzleId: string;
  onSelectPuzzle: (puzzle: Puzzle) => void;
}

export const PuzzlePickerModal: React.FC<PuzzlePickerModalProps> = ({
  isOpen,
  onClose,
  activeTheme,
  currentPuzzleId,
  onSelectPuzzle,
}) => {
  if (!isOpen) return null;

  const handlePickRandom = () => {
    const randomIndex = Math.floor(Math.random() * activeTheme.puzzles.length);
    onSelectPuzzle(activeTheme.puzzles[randomIndex]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-amber-500/20 rounded-2xl max-w-xl w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100 max-h-[85vh] flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 pr-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{activeTheme.icon}</span>
              <h2 className="text-xl font-bold text-white">{activeTheme.name}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">{activeTheme.description}</p>
          </div>

          <button
            type="button"
            onClick={handlePickRandom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-semibold text-amber-300 transition cursor-pointer shrink-0 shadow-sm"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Shuffle</span>
          </button>
        </div>

        {/* 20 Puzzles Grid */}
        <div className="flex-1 overflow-y-auto py-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {activeTheme.puzzles.map((puzzle, idx) => {
            const isSelected = puzzle.id === currentPuzzleId;
            return (
              <button
                key={puzzle.id}
                type="button"
                onClick={() => {
                  onSelectPuzzle(puzzle);
                  onClose();
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer text-center ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)] font-black scale-[1.02]'
                    : 'bg-[#181e2c] hover:bg-[#202738] border-white/5 text-slate-200 hover:border-amber-500/30'
                }`}
              >
                <span className="text-base font-extrabold font-mono">#{idx + 1}</span>
                <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                  {puzzle.clues.length} words
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full mt-1 font-semibold uppercase tracking-wider ${
                    isSelected
                      ? 'bg-slate-950/20 text-slate-950'
                      : puzzle.difficulty === 'Expert'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : puzzle.difficulty === 'Medium'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {puzzle.difficulty}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 text-right">
          <span className="text-xs text-slate-500 font-mono">20 pre-generated & verified crosswords available</span>
        </div>
      </div>
    </div>
  );
};
