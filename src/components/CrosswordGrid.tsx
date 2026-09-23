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
  celebratingCells?: { row: number; col: number; delay: number }[];
  enableWordAnimations?: boolean;
}

const GAP = 3;
const MIN_CELL = 20;
const MAX_CELL = 44;
const MAX_GRID_HEIGHT = 540;
/** Board padding (p-3 / sm:p-5) plus its 1 px border on both sides. */
const boardChrome = (width: number) => 2 * (width < 640 ? 12 : 20) + 2;
const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

function cellClasses(state: { selected: boolean; wrong: boolean; inWord: boolean; correct: boolean }): string {
  if (state.selected) return 'bg-cursor text-cursor-fg shadow-cursor z-10';
  if (state.wrong) return 'bg-bad-cell text-cell-fg border-2 border-bad';
  if (state.inWord) return 'bg-word text-cell-fg border border-word-line';
  if (state.correct) return 'bg-ok-cell text-cell-fg border-2 border-ok';
  return 'bg-cell text-cell-fg border border-cell-line hover:brightness-110';
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
  celebratingCells = [],
  enableWordAnimations = true,
}) => {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => Math.min(window.innerWidth - 32, 560));

  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [selectedCell]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  /** Hints, arrows and Backspace. Returns true when the key was handled. */
  const handleCommandKey = (e: React.KeyboardEvent): boolean => {
    if (e.key === 'Tab') onApplyHint?.(e.shiftKey ? 'puzzle' : 'word');
    else if (e.key === ' ' || e.code === 'Space') onApplyHint?.('letter');
    else if (e.key === 'Backspace') onBackspace();
    else if (ARROWS[e.key]) onMoveCursor(...ARROWS[e.key]);
    else return false;
    e.preventDefault();
    return true;
  };

  const cols = puzzle.cols || 1;
  const rows = puzzle.rows || 1;
  const available = Math.min(containerWidth, 600) - boardChrome(containerWidth);
  const fitWidth = Math.floor((available - (cols - 1) * GAP) / cols);
  const fitHeight = Math.floor((MAX_GRID_HEIGHT - (rows - 1) * GAP) / rows);
  const cellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, fitWidth, fitHeight));
  const letterFontSize = Math.round(cellSize * 0.5);
  const numberFontSize = Math.max(8, Math.round(cellSize * 0.26));

  return (
    <div
      ref={containerRef}
      className="relative w-full flex justify-center select-none outline-none"
      onClick={() => hiddenInputRef.current?.focus()}
      tabIndex={0}
      onKeyDown={e => {
        if (handleCommandKey(e)) return;
        if (/^[a-zA-Z0-9]$/.test(e.key)) {
          e.preventDefault();
          onInputLetter(e.key);
        }
      }}
    >
      {/* Receives typing on touch keyboards; letters arrive through onChange */}
      <input
        ref={hiddenInputRef}
        type="text"
        className="absolute opacity-0 pointer-events-none w-0 h-0"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        onChange={e => {
          const lastChar = e.target.value.slice(-1);
          if (/^[a-zA-Z0-9]$/.test(lastChar)) onInputLetter(lastChar);
          e.target.value = '';
        }}
        onKeyDown={e => {
          if (handleCommandKey(e)) e.stopPropagation();
        }}
      />

      <div className="max-w-full overflow-x-auto p-3 sm:p-5 bg-glass border border-line rounded-panel shadow-panel">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
            gap: `${GAP}px`,
          }}
        >
          {puzzle.grid.map((rowCells, r) =>
            rowCells.map((cell, c) => {
              if (cell.isBlock) {
                return <div key={`${r}-${c}`} className="rounded-cell bg-fg/[0.04]" />;
              }

              const selected = selectedCell.row === r && selectedCell.col === c;
              const cellValidity = validity[r]?.[c] || 'untested';
              const wrong = cellValidity === 'wrong';
              const letter = userLetters[r]?.[c] || '';
              const isTeammate = teammateCell?.row === r && teammateCell?.col === c;
              const celebration = enableWordAnimations ? celebratingCells.find(item => item.row === r && item.col === c) : undefined;

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  aria-label={`Row ${r + 1}, column ${c + 1}${letter ? `, ${letter}` : ', empty'}${wrong ? ', wrong' : ''}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectCell(r, c);
                    hiddenInputRef.current?.focus();
                  }}
                  style={celebration ? { animationDelay: `${celebration.delay}ms` } : undefined}
                  className={`relative rounded-cell font-extrabold flex items-center justify-center transition-colors cursor-pointer ${cellClasses({
                    selected,
                    wrong,
                    inWord: isCellInActiveWord(r, c),
                    correct: cellValidity === 'correct',
                  })} ${celebration ? 'animate-letter-correct-pop z-20' : ''}`}
                >
                  {cell.number && (
                    <span
                      className={`absolute top-[2px] left-[3px] leading-none font-bold pointer-events-none ${selected ? 'text-cursor-fg/70' : 'text-cell-num'}`}
                      style={{ fontSize: `${numberFontSize}px` }}
                    >
                      {cell.number}
                    </span>
                  )}

                  <span className="uppercase leading-none" style={{ fontSize: `${letterFontSize}px` }}>{letter}</span>

                  {wrong && !selected && (
                    <span aria-hidden="true" className="absolute left-1.5 right-1.5 top-1/2 h-0.5 bg-bad -rotate-[35deg] pointer-events-none" />
                  )}

                  {isTeammate && !selected && (
                    <span className="absolute inset-0 border-2 rounded-cell pointer-events-none" style={{ borderColor: teammateCell.color }}>
                      <span
                        className="absolute -top-4 left-0 text-[10px] px-1 rounded-cell text-on-accent font-bold leading-tight whitespace-nowrap"
                        style={{ backgroundColor: teammateCell.color }}
                      >
                        {teammateCell.name}
                      </span>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
