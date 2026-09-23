import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Modal } from './Modal';
import { apiClient, SolvedRecord } from '../services/apiClient';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, '0')}s` : `${rest}s`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Solved puzzles from GET /api/history, newest first. */
export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<SolvedRecord[] | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setHistory(null);
    apiClient.getSolvedHistory().then(records => {
      if (!cancelled) setHistory([...records].sort((a, b) => b.solvedAt - a.solvedAt));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const solvedCount = history?.length ?? 0;
  const totalClues = history?.reduce((sum, record) => sum + (record.cluesCount || 0), 0) ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg p-6 sm:p-7 flex flex-col">
      {({ titleId, descriptionId }) => (
        <>
          <div className="pr-10 pb-4 border-b border-line">
            <div>
              <h2 id={titleId} className="font-display text-2xl leading-none">History</h2>
              <p id={descriptionId} className="mt-2 text-sm text-muted">
                {history === null ? 'Loading your solved puzzles…' : `${solvedCount} puzzles solved · ${totalClues} clues cracked`}
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto min-h-[8rem]">
            {history === null ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-control bg-raised animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">
                No solved puzzles yet. Finish a crossword and it will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map(record => (
                  <li key={record.puzzleId} className="flex items-center gap-3 p-3 rounded-control bg-raised/60 border border-line">
                    <Trophy className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{record.title || 'Untitled puzzle'}</div>
                      <div className="text-xs text-muted">
                        <time dateTime={new Date(record.solvedAt).toISOString()}>{dateFormat.format(record.solvedAt)}</time>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono font-bold text-accent">{formatDuration(record.timeSeconds)}</div>
                      <div className="text-xs text-muted">{record.cluesCount} clues</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};
