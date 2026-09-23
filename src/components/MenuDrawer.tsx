import React, { useRef } from 'react';
import { ChevronRight, EyeOff, History, ListMusic, Settings, Shuffle, SlidersHorizontal, Users, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { Button, IconButton, cx } from './ui';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLiveGenerator: () => void;
  onInstantRandomPuzzle: () => void;
  onOpenMultiplayer: () => void;
  onOpenBlacklist: () => void;
  /** Tracklist of the current puzzle (end screen). */
  onOpenSolvedHistory: () => void;
  /** Every solved puzzle (GET /api/history). */
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  blacklistCount: number;
  multiplayerCode?: string | null;
  activePuzzleTitle: string;
}

const KEYS = [
  ['A–Z', 'Type'],
  ['Backspace', 'Clear'],
  ['Arrows', 'Move'],
  ['Space', 'Letter hint'],
  ['Tab', 'Word hint'],
  ['Esc', 'Close'],
] as const;

function MenuRow({ icon, tone, title, detail, onClick }: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[60px] flex items-center gap-3.5 px-3 py-2 rounded-control text-left hover:bg-raised transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className={cx('w-10 h-10 shrink-0 rounded-control flex items-center justify-center', tone)} aria-hidden="true">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-sm text-muted truncate">{detail}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      <h3 className="px-3 pb-1.5 text-xs font-bold tracking-[0.14em] text-muted uppercase">{label}</h3>
      {children}
    </nav>
  );
}

/** Slide-over menu: the current puzzle, then Play, You and the keyboard shortcuts. */
export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  onOpenLiveGenerator,
  onInstantRandomPuzzle,
  onOpenMultiplayer,
  onOpenBlacklist,
  onOpenSolvedHistory,
  onOpenHistory,
  onOpenSettings,
  blacklistCount,
  multiplayerCode,
  activePuzzleTitle,
}) => {
  // Esc closes, focus stays inside while open and returns to the menu button afterwards
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-bg/70 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-drawer-title"
        tabIndex={-1}
        className="relative z-10 w-full max-w-md h-full flex flex-col bg-surface border-l border-line text-fg outline-none"
      >
        <div className="h-[72px] shrink-0 px-6 flex items-center justify-between border-b border-line">
          <h2 id="menu-drawer-title" className="font-display text-3xl leading-none">Menu</h2>
          <IconButton label="Close menu" onClick={onClose}>
            <X className="w-5 h-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5 flex flex-col gap-6">
          <section className="mx-3 p-4 flex flex-col gap-3 bg-panel border border-line rounded-panel">
            <div>
              <div className="text-xs font-bold tracking-[0.14em] text-muted uppercase">Now playing</div>
              <div className="font-display text-2xl leading-tight mt-1">{activePuzzleTitle}</div>
            </div>
            <Button onClick={onInstantRandomPuzzle} icon={<Shuffle className="w-4 h-4 text-accent" aria-hidden="true" />}>
              New puzzle, same theme
            </Button>
          </section>

          <Group label="Play">
            <MenuRow icon={<SlidersHorizontal className="w-5 h-5" />} tone="bg-accent/15 text-accent" title="Custom puzzle" detail="Theme, languages, size or your own prompt" onClick={onOpenLiveGenerator} />
            <MenuRow
              icon={<Users className="w-5 h-5" />}
              tone="bg-hi/15 text-hi"
              title="Multiplayer"
              detail={multiplayerCode ? `In room ${multiplayerCode}` : 'Co-op or race with friends'}
              onClick={onOpenMultiplayer}
            />
          </Group>

          <Group label="You">
            <MenuRow icon={<ListMusic className="w-5 h-5" />} tone="bg-accent/15 text-accent" title="Songs in this puzzle" detail="Tracklist with previews and links" onClick={onOpenSolvedHistory} />
            <MenuRow icon={<History className="w-5 h-5" />} tone="bg-ok/15 text-ok" title="History" detail="Solved puzzles and times" onClick={onOpenHistory} />
            <MenuRow
              icon={<EyeOff className="w-5 h-5" />}
              tone="bg-bad/15 text-bad"
              title="Hidden artists & songs"
              detail={blacklistCount > 0 ? `${blacklistCount} hidden from new puzzles` : 'Nothing hidden yet'}
              onClick={onOpenBlacklist}
            />
            <MenuRow icon={<Settings className="w-5 h-5" />} tone="bg-raised text-fg" title="Settings" detail="Theme, volume and animations" onClick={onOpenSettings} />
          </Group>

          <section aria-label="Keyboard" className="flex flex-col gap-2">
            <h3 className="px-3 text-xs font-bold tracking-[0.14em] text-muted uppercase">Keys</h3>
            <dl className="px-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm text-muted">
              {KEYS.map(([key, action]) => (
                <div key={key} className="flex items-center gap-2">
                  <dt><kbd className="px-2 py-0.5 rounded-cell bg-raised border border-line font-mono text-xs font-bold text-fg">{key}</kbd></dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-line text-xs text-muted">Progress is saved on this device</div>
      </div>
    </div>
  );
};
