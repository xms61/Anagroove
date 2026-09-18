import React from 'react';
import { Clue } from '../types/crossword';

interface ClueListProps {
  clues: Clue[];
  activeClue?: Clue;
  onSelectClue: (clue: Clue) => void;
}

const getClueBadgeClass = (clueId: string) => {
  const num = parseInt(clueId) || 0;
  const isAcross = clueId.includes('A');
  const palette = isAcross
    ? [
        'bg-orange-500 text-slate-950',
        'bg-cyan-400 text-slate-950',
        'bg-rose-500 text-white',
        'bg-emerald-400 text-slate-950',
        'bg-pink-400 text-slate-950',
        'bg-amber-400 text-slate-950',
      ]
    : [
        'bg-blue-500 text-white',
        'bg-teal-400 text-slate-950',
        'bg-red-500 text-white',
        'bg-yellow-400 text-slate-950',
        'bg-purple-500 text-white',
        'bg-indigo-400 text-white',
      ];
  return palette[num % palette.length];
};

export const ClueList: React.FC<ClueListProps> = ({ clues, activeClue, onSelectClue }) => {
  const acrossClues = clues.filter(c => c.direction === 'across');
  const downClues = clues.filter(c => c.direction === 'down');

  const renderClueItem = (clue: Clue) => {
    const isActive = activeClue?.id === clue.id;
    const badgeColor = getClueBadgeClass(clue.id);

    return (
      <button
        key={clue.id}
        type="button"
        onClick={() => onSelectClue(clue)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
          isActive
            ? 'bg-white text-slate-950 border-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] font-semibold scale-[1.01]'
            : 'bg-transparent text-slate-300 hover:bg-white/5 hover:text-white border-transparent'
        }`}
      >
        <span
          className={`px-2.5 py-0.5 rounded-md font-mono font-black text-xs shrink-0 shadow-sm ${badgeColor}`}
        >
          {clue.id}
        </span>
        <div className="flex flex-col truncate">
          <span className={`text-xs sm:text-sm font-medium truncate ${isActive ? 'text-slate-950 font-bold' : 'text-slate-200'}`} title={clue.clueText}>
            {clue.clueText}
          </span>
          <span className={`text-[10px] font-mono ${isActive ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
            {clue.clueType} • {clue.length} letters
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 max-h-[600px] overflow-y-auto pr-1">
      {/* Across (Horizontal) Clues */}
      <div className="flex flex-col">
        <h3 className="text-sm font-bold text-white mb-2.5 pb-1.5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#131722]/95 backdrop-blur-sm z-10">
          <span className="flex items-center gap-1.5 text-amber-300">
            <span>Across (Horizontal)</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">{acrossClues.length} clues</span>
        </h3>
        <div className="flex flex-col gap-1.5">
          {acrossClues.map(clue => renderClueItem(clue))}
        </div>
      </div>

      {/* Down (Vertical) Clues */}
      <div className="flex flex-col">
        <h3 className="text-sm font-bold text-white mb-2.5 pb-1.5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#131722]/95 backdrop-blur-sm z-10">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <span>Down (Vertical)</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">{downClues.length} clues</span>
        </h3>
        <div className="flex flex-col gap-1.5">
          {downClues.map(clue => renderClueItem(clue))}
        </div>
      </div>
    </div>
  );
};
