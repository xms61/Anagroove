import React, { useRef, useEffect } from 'react';
import { Puzzle, CellValidity } from '../types/crossword';

interface CrosswordGridProps {
  puzzle: Puzzle;
  userLetters: string[][];
  validity: CellValidity[][];
  selectedCell: { row: number; col: number };
  isCellInActiveWord: (r: number, c: number) => boolean;
  onSelectCell: (r: number, c: number) => void;
  onInputLetter: (char: string) => void;
  onBackspace: () => void;
  onMoveCursor: (dr: number, dc: number) => void;
  teammateCell?: { row: number; col: number; name: string; color: string } | null;
  isPlaying?: boolean;
}

export const CrosswordGrid: React.FC<CrosswordGridProps> = ({
  puzzle,
  userLetters,
  validity,
  selectedCell,
  isCellInActiveWord,
  onSelectCell,
  onInputLetter,
  onBackspace,
  onMoveCursor,
  teammateCell,
  isPlaying = false,
}) => {
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [selectedCell]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onMoveCursor(-1, 0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onMoveCursor(1, 0);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onMoveCursor(0, -1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onMoveCursor(0, 1);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      onBackspace();
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      onInputLetter(e.key);
    }
  };

  return (
    <div
      className="relative flex items-center justify-center p-4 sm:p-6 select-none outline-none overflow-hidden"
      onClick={() => hiddenInputRef.current?.focus()}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={hiddenInputRef}
        type="text"
        className="absolute opacity-0 pointer-events-none w-0 h-0"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        onChange={e => {
          const val = e.target.value;
          if (val) {
            const lastChar = val.slice(-1);
            if (/^[a-zA-Z]$/.test(lastChar)) {
              onInputLetter(lastChar);
            }
          }
          e.target.value = '';
        }}
        onKeyDown={e => {
          if (e.key === 'Backspace') {
            e.preventDefault();
            onBackspace();
          }
        }}
      />

      {/* Realistic Vinyl Record in background (Spins when music plays) */}
      <div
        className={`absolute w-[490px] h-[490px] md:w-[560px] md:h-[560px] rounded-full vinyl-grooves flex items-center justify-center pointer-events-none transition-all duration-700 animate-spin-slow shadow-2xl ${
          isPlaying ? '' : 'spin-paused'
        }`}
        style={{ opacity: 0.95 }}
      >
        {/* Center Vintage Spindle Label */}
        <div className="w-40 h-40 rounded-full bg-gradient-to-br from-amber-200 via-amber-100 to-amber-300 border-[5px] border-amber-900/40 flex flex-col items-center justify-center text-center p-2 shadow-inner">
          <div className="text-[10px] tracking-[0.2em] font-black text-amber-950 uppercase">SPOTYSPICE</div>
          <div className="text-[8px] tracking-wider text-amber-800 font-bold mt-0.5">HI-FI STEREO</div>
          <div className="w-5 h-5 my-1.5 rounded-full bg-[#0b0e14] border-2 border-amber-400 shadow-inner flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          </div>
          <div className="text-[7.5px] font-mono text-amber-900/80 font-bold uppercase">33⅓ RPM • MICROGROOVE</div>
        </div>
      </div>

      {/* Crossword Grid Matrix: Transparent container so vinyl is visible through all empty blocks */}
      <div
        className="relative z-10 grid gap-[2px] p-2 bg-transparent select-none"
        style={{
          gridTemplateColumns: `repeat(${puzzle.cols}, minmax(0, 1fr))`,
        }}
      >
        {puzzle.grid.map((row, r) =>
          row.map((cell, c) => {
            if (cell.isBlock) {
              return (
                <div
                  key={`${r}-${c}`}
                  className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 bg-transparent pointer-events-none"
                />
              );
            }

            const isSelected = selectedCell.row === r && selectedCell.col === c;
            const isInActiveWord = isCellInActiveWord(r, c);
            const letter = userLetters[r]?.[c] || '';
            const cellValid = validity[r]?.[c] || 'untested';
            const isTeammate = teammateCell?.row === r && teammateCell?.col === c;

            // Crisp, high-contrast floating crossword tiles
            let bgStyle = 'bg-white text-slate-900 hover:bg-slate-100';
            let borderStyle = 'border border-slate-300/90';

            if (isSelected) {
              bgStyle = 'bg-[#fef08a] text-slate-950 font-black z-20 shadow-[0_0_14px_rgba(250,204,21,0.6)]';
              borderStyle = 'border-2 border-amber-500 ring-2 ring-amber-400/50';
            } else if (isInActiveWord) {
              bgStyle = 'bg-[#fce7f3] text-slate-900 font-bold';
              borderStyle = 'border border-pink-300';
            }

            if (cellValid === 'wrong') {
              bgStyle = 'bg-[#fee2e2] text-[#991b1b]';
              borderStyle = 'border-2 border-rose-500';
            } else if (cellValid === 'correct' && !isSelected && !isInActiveWord) {
              bgStyle = 'bg-[#dcfce7] text-[#166534]';
              borderStyle = 'border-2 border-emerald-500';
            }

            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onSelectCell(r, c);
                  hiddenInputRef.current?.focus();
                }}
                className={`relative w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-[3px] font-bold text-base md:text-lg flex items-center justify-center transition-all cursor-pointer tile-shadow ${bgStyle} ${borderStyle}`}
              >
                {/* Red studio tape corner mark on selected cell */}
                {isSelected && (
                  <div className="absolute top-0 left-0 w-0 h-0 border-t-[8px] border-t-rose-500 border-r-[8px] border-r-transparent pointer-events-none" />
                )}

                {/* Multiplayer Teammate Indicator */}
                {isTeammate && !isSelected && (
                  <div
                    className="absolute inset-0 border-2 rounded-sm pointer-events-none animate-pulse"
                    style={{ borderColor: teammateCell.color }}
                  >
                    <span
                      className="absolute -top-3.5 left-0 text-[8px] px-1 py-0.2 rounded text-white font-bold leading-tight shadow"
                      style={{ backgroundColor: teammateCell.color }}
                    >
                      {teammateCell.name}
                    </span>
                  </div>
                )}

                {/* Clue Number Indicator */}
                {cell.number && (
                  <span className="absolute top-[1px] left-[2px] text-[8.5px] md:text-[9.5px] leading-none text-slate-500 font-semibold pointer-events-none">
                    {cell.number}
                  </span>
                )}

                {/* Entered Character */}
                <span className="mt-1 font-mono tracking-tight">{letter}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
