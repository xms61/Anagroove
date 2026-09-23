import React, { useEffect, useState } from 'react';
import { Clue } from '../types/crossword';
import { cx } from './ui';

interface ClueListProps {
  clues: Clue[];
  activeClue?: Clue;
  onSelectClue: (clue: Clue) => void;
}

type Direction = Clue['direction'];

/** Column headings per theme: the Japanese and German crossword terms, or a record's sides. */
function ColumnHeading({ direction, count }: { direction: Direction; count: number }) {
  const across = direction === 'across';
  return (
    <div className="flex items-baseline gap-2.5 px-3 pb-3 mb-1.5 border-b border-line">
      <h2 className="font-display text-xl leading-none">
        <span className="only-city">{across ? 'Across' : 'Down'}</span>
        <span className="only-berlin">{across ? 'Across' : 'Down'}</span>
        <span className="only-vinyl">{across ? 'Side A' : 'Side B'}</span>
      </h2>
      <span className="text-xs font-bold tracking-wider text-muted">
        <span className="only-city" lang="ja">{across ? 'ヨコのカギ' : 'タテのカギ'}</span>
        <span className="only-berlin" lang="de">{across ? 'WAAGERECHT →' : 'SENKRECHT ↓'}</span>
        <span className="only-vinyl">{across ? 'ACROSS' : 'DOWN'}</span>
      </span>
      <span className="ml-auto text-xs text-muted">{count} clues</span>
    </div>
  );
}

function ClueButton({ clue, active, onSelect }: { clue: Clue; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cx(
        'w-full flex items-center gap-3 px-3 py-2 text-left rounded-control transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        active ? 'bg-raised' : 'hover:bg-raised/60',
      )}
    >
      <span data-active={active} className="clue-badge min-w-9 h-7 px-1.5 shrink-0 inline-flex items-center justify-center rounded-cell text-sm font-extrabold">
        {clue.id}
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-semibold truncate" title={clue.clueText}>{clue.clueText}</span>
        <span className="text-xs text-muted">{clue.clueType} · {clue.length} letters</span>
      </span>
    </button>
  );
}

export const ClueList: React.FC<ClueListProps> = ({ clues, activeClue, onSelectClue }) => {
  const [tab, setTab] = useState<Direction>(activeClue?.direction ?? 'across');
  useEffect(() => {
    if (activeClue) setTab(activeClue.direction);
  }, [activeClue]);

  const column = (direction: Direction) => {
    const list = clues.filter(c => c.direction === direction);
    return (
      <div className={cx('flex-col min-w-0', tab === direction ? 'flex' : 'hidden md:flex')}>
        <ColumnHeading direction={direction} count={list.length} />
        <div className="flex flex-col gap-0.5">
          {list.map(clue => (
            <ClueButton key={clue.id} clue={clue} active={activeClue?.id === clue.id} onSelect={() => onSelectClue(clue)} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Phones show one direction at a time */}
      <div className="md:hidden flex gap-1 p-1 mb-3 bg-bg/40 border border-line rounded-control" role="group" aria-label="Clue direction">
        {(['across', 'down'] as const).map(direction => (
          <button
            key={direction}
            type="button"
            aria-pressed={tab === direction}
            onClick={() => setTab(direction)}
            className={cx(
              'flex-1 h-10 rounded-control text-sm font-bold capitalize cursor-pointer transition',
              tab === direction ? 'bg-raised text-fg' : 'text-muted',
            )}
          >
            {direction}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4 lg:gap-6">
        {column('across')}
        {column('down')}
      </div>
    </div>
  );
};
