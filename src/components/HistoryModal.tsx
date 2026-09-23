import React, { useEffect, useState } from 'react';
import { History, Trophy } from 'lucide-react';
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
    <Modal isOpen={isOpen} onClose={onClose} className="border-emerald-500/25 max-w-lg p-6 flex flex-col">
      {({ titleId, descriptionId }) => (
        <>
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/35 text-emerald-300 flex items-center justify-center">
              <History className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id={titleId} className="text-xl font-bold text-white">Solved History</h2>
              <p id={descriptionId} className="text-sm text-slate-300">
                {history === null ? 'Loading your solved puzzles…' : `${solvedCount} puzzles solved · ${totalClues} clues cracked`}
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto min-h-[8rem]">
            {history === null ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-kissa-card animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-300 text-center py-10">
                No solved puzzles yet. Finish a crossword and it will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map(record => (
                  <li key={record.puzzleId} className="flex items-center gap-3 p-3 rounded-xl bg-kissa-card border border-white/5">
                    <Trophy className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-100 truncate">{record.title || 'Untitled puzzle'}</div>
                      <div className="text-xs text-slate-300">
                        <time dateTime={new Date(record.solvedAt).toISOString()}>{dateFormat.format(record.solvedAt)}</time>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono font-bold text-amber-300">{formatDuration(record.timeSeconds)}</div>
                      <div className="text-xs text-slate-300">{record.cluesCount} clues</div>
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
