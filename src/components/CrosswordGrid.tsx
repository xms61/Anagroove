import React, { useRef, useEffect, useState } from 'react';
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
  onApplyHint?: (type: 'letter' | 'word' | 'puzzle') => void;
  teammateCell?: { row: number; col: number; name: string; color: string } | null;
  isPlaying?: boolean;
  celebratingCells?: { row: number; col: number; delay: number }[];
  enableWordAnimations?: boolean;
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
  onApplyHint,
  teammateCell,
  isPlaying = false,
  celebratingCells = [],
  enableWordAnimations = true,
}) => {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.min(window.innerWidth - 32, 560);
    }
    return 500;
  });

  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [selectedCell]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        onApplyHint?.('puzzle');
      } else {
        onApplyHint?.('word');
      }
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      onApplyHint?.('letter');
    } else if (e.key === 'ArrowUp') {
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
    } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
      e.preventDefault();
      onInputLetter(e.key);
    }
  };

  const gapSize = 3;
  const cols = puzzle.cols || 1;
  const rows = puzzle.rows || 1;

  // Compute maximum available dimensions:
  // Desktop max width: ~540px to sit comfortably over vinyl
  // Mobile max width: containerWidth - 32px
  const maxAvailableWidth = Math.min(containerWidth - 32, 540);
  const maxAvailableHeight = 540;

  const maxCellWidth = Math.floor((maxAvailableWidth - (cols - 1) * gapSize) / cols);
  const maxCellHeight = Math.floor((maxAvailableHeight - (rows - 1) * gapSize) / rows);

  // Cell size bounded between 26px (compact mobile layout) and 46px (spacious desktop)
  const cellSize = Math.max(26, Math.min(46, Math.min(maxCellWidth, maxCellHeight)));

  const letterFontSize = Math.max(15, Math.round(cellSize * 0.58));
  const numberFontSize = Math.max(8.5, Math.round(cellSize * 0.27));
  const gridWidth = cols * cellSize + (cols - 1) * gapSize;
  const gridHeight = rows * cellSize + (rows - 1) * gapSize;

  return (
    <div
      ref={containerRef}
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
            if (/^[a-zA-Z0-9]$/.test(lastChar)) {
              onInputLetter(lastChar);
            }
          }
          e.target.value = '';
        }}
        onKeyDown={e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
              onApplyHint?.('puzzle');
            } else {
              onApplyHint?.('word');
            }
          } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            onApplyHint?.('letter');
          } else if (e.key === 'Backspace') {
            e.preventDefault();
            onBackspace();
          } else if (e.key === 'ArrowUp') {
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
          }
        }}
      />

      {/* Vinyl Record Center Turntable Backdrop */}
      <div
        className="absolute rounded-full vinyl-grooves pointer-events-none transition-transform duration-700 ease-out"
        style={{
          width: `${Math.max(gridWidth, gridHeight) + 120}px`,
          height: `${Math.max(gridWidth, gridHeight) + 120}px`,
        }}
      >
        <div className={`w-full h-full rounded-full flex items-center justify-center ${isPlaying ? 'animate-spin-slow' : 'spin-paused'}`}>
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-700 via-amber-500 to-amber-400 border-4 border-kissa-base flex items-center justify-center shadow-inner opacity-40">
            <div className="w-5 h-5 rounded-full bg-kissa-base border-2 border-amber-300/40" />
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div
        className="relative z-10 grid rounded-xl p-3 sm:p-4 bg-kissa-base/85 border border-white/10 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          gap: `${gapSize}px`,
        }}
      >
        {puzzle.grid.map((rowCells, r) =>
          rowCells.map((cell, c) => {
            if (cell.isBlock) {
              return (
                <div
                  key={`${r}-${c}`}
                  style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                  className="rounded-[4px] bg-kissa-base/80 border border-white/[0.04]"
                />
              );
            }

            const isSelected = selectedCell.row === r && selectedCell.col === c;
            const isInActiveWord = isCellInActiveWord(r, c);
            const letter = userLetters[r]?.[c] || '';
            const cellValid = validity[r]?.[c] || 'untested';
            const isTeammate = teammateCell?.row === r && teammateCell?.col === c;
            const celebration = celebratingCells?.find(item => item.row === r && item.col === c);

            // Crisp, high-contrast floating crossword tiles
            let bgStyle = 'bg-white text-slate-900 hover:bg-amber-50/50';
            let borderStyle = 'border border-slate-300 shadow-[0_2px_4px_rgba(0,0,0,0.12)]';

            if (isSelected) {
              bgStyle = 'bg-yellow-300 text-slate-950 font-black z-20 shadow-[0_0_18px_rgba(250,204,21,0.7)]';
              borderStyle = 'border-2 border-amber-600 ring-2 ring-amber-400';
            } else if (isInActiveWord) {
              bgStyle = 'bg-amber-100 text-amber-950 font-black';
              borderStyle = 'border-2 border-amber-400/90 shadow-[0_0_8px_rgba(245,158,11,0.25)]';
            }

            if (cellValid === 'wrong') {
              bgStyle = 'bg-red-100 text-red-800 font-black';
              borderStyle = 'border-2 border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]';
            } else if (cellValid === 'correct' && !isSelected && !isInActiveWord) {
              bgStyle = 'bg-green-100 text-emerald-800 font-black';
              borderStyle = 'border-2 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
            }

            const celebrationClass = (enableWordAnimations && celebration) ? 'animate-letter-correct-pop z-30' : '';
            const celebrationDelay = (enableWordAnimations && celebration) ? `${celebration.delay}ms` : undefined;

            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onSelectCell(r, c);
                  hiddenInputRef.current?.focus();
                }}
                style={{
                  width: `${cellSize}px`,
                  height: `${cellSize}px`,
                  animationDelay: celebrationDelay,
                }}
                className={`relative rounded-[4px] font-bold flex items-center justify-center transition-all cursor-pointer tile-shadow ${bgStyle} ${borderStyle} ${celebrationClass}`}
              >
                {/* Red studio tape corner mark on selected cell (positioned top-right to avoid clue numbers) */}
                {isSelected && (
                  <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-t-rose-500 border-l-[8px] border-l-transparent pointer-events-none" />
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
                  <span
                    className="absolute top-[1px] left-[2px] leading-none text-slate-500 font-bold pointer-events-none"
                    style={{ fontSize: `${numberFontSize}px` }}
                  >
                    {cell.number}
                  </span>
                )}

                {/* Entered Character */}
                <span
                  className="font-sans font-black tracking-tight uppercase select-none"
                  style={{
                    fontSize: `${letterFontSize}px`,
                    lineHeight: 1,
                    marginTop: `${Math.max(1, Math.round(cellSize * 0.08))}px`,
                  }}
                >
                  {letter}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
