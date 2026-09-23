import React, { useRef } from 'react';
import { useDialog } from '../hooks/useDialog';
import { 
  X, 
  Disc3, 
  Zap, 
  Users, 
  Ban, 
  ListMusic, 
  Sparkles,
  Keyboard,
  Radio,
  ChevronRight,
  Shuffle,
  Settings,
  History
} from 'lucide-react';

interface LoungeDrawerProps {
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
  onOpenSettings?: () => void;
  blacklistCount: number;
  multiplayerCode?: string | null;
  activePuzzleTitle: string;
}

export const LoungeDrawer: React.FC<LoungeDrawerProps> = ({
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
      {/* Dimmed backdrop */}
      <div 
        className="fixed inset-0 bg-bg/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lounge-drawer-title"
        tabIndex={-1}
        className="relative w-full max-w-md bg-bg border-l outline-none border-line/10 text-fg shadow-2xl flex flex-col h-full z-10 overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-line/10 bg-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-accent to-accent flex items-center justify-center text-on-accent">
              <Disc3 className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="text-xs tracking-widest font-mono text-accent uppercase font-bold">
                JAZZ KISSA & AUDIO SALON
              </div>
              <h2 id="lounge-drawer-title" className="text-base font-bold text-fg tracking-tight">
                Lounge Menu
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-fg/5 hover:bg-fg/10 text-muted hover:text-fg flex items-center justify-center transition border border-line/5 cursor-pointer"
            title="Close menu (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Current Session Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-panel to-surface border border-accent/20 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between text-xs text-accent font-mono mb-1.5">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-accent animate-pulse" />
                <span>ACTIVE TURNTABLE</span>
              </span>
              <span className="text-ok font-bold">⚡ Live Crossword</span>
            </div>

            <div className="text-lg font-black text-fg tracking-tight mb-3">
              {activePuzzleTitle}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onInstantRandomPuzzle();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent font-bold text-xs transition cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Generate Fresh Random Puzzle</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </button>
          </div>

          {/* Quick Modes & Social Group */}
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted mb-2.5 flex items-center gap-1.5 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Crossword Generators & Modes</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Live Generator Studio */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLiveGenerator();
                }}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface hover:bg-raised border border-line/10 hover:border-accent/40 transition group cursor-pointer text-left shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center group-hover:scale-105 transition">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-fg group-hover:text-accent transition">
                      Live Studio (Style & Size Picker)
                    </div>
                    <div className="text-xs text-muted">
                      Generate crosswords by genre (Rock, Pop, K-Pop, Gaming & more)
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:text-accent group-hover:translate-x-0.5 transition" />
              </button>

              {/* Multiplayer Booth */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMultiplayer();
                }}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface hover:bg-raised border border-line/10 hover:border-hi/40 transition group cursor-pointer text-left shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center group-hover:scale-105 transition ${
                    multiplayerCode 
                      ? 'bg-hi text-on-accent border-hi' 
                      : 'bg-hi/15 text-hi border-hi/30'
                  }`}>
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-fg group-hover:text-hi transition flex items-center gap-2">
                      <span>Multiplayer Lounge</span>
                      {multiplayerCode && (
                        <span className="text-xs px-1.5 py-0.2 bg-hi/20 text-hi rounded font-mono font-bold">
                          ROOM: {multiplayerCode}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      Real-time Co-op & Versus race with friends
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:text-hi group-hover:translate-x-0.5 transition" />
              </button>
            </div>
          </div>

          {/* Library Tools & Filters */}
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted mb-2.5 font-bold">
              Salon Preferences
            </div>

            <div className="space-y-2">
              {/* Solved Record Tracklist */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSolvedHistory();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-panel border border-line/5 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-hi/15 text-hi border border-hi/30 flex items-center justify-center">
                    <ListMusic className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-fg">
                      Listening Log & Showcase
                    </div>
                    <div className="text-xs text-muted">
                      View full tracklist and replay solved songs
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted" />
              </button>

              {/* Solved puzzles across sessions */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-panel border border-line/5 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-ok/15 text-ok border border-ok/30 flex items-center justify-center">
                    <History className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-fg">
                      Solved History
                    </div>
                    <div className="text-xs text-muted">
                      Every puzzle you've finished, with times
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
              </button>

              {/* Blacklist Filter */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBlacklist();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-panel border border-line/5 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-bad/15 text-bad border border-bad/30 flex items-center justify-center">
                    <Ban className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-fg flex items-center gap-1.5">
                      <span>Crate Blacklist Filter</span>
                      {blacklistCount > 0 && (
                        <span className="text-xs px-1.5 py-0.2 bg-bad/20 text-bad rounded font-mono font-bold">
                          {blacklistCount} Muted
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      Hide specific artists or songs from puzzles
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted" />
              </button>

              {/* Lounge Settings */}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-panel border border-line/5 transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center">
                      <Settings className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-fg">
                        Lounge Settings
                      </div>
                      <div className="text-xs text-muted">
                        Adjust audio volume and word solve animations
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted" />
                </button>
              )}
            </div>
          </div>

          {/* Keyboard Shortcuts Guide */}
          <div className="p-3.5 rounded-xl bg-fg/[0.02] border border-line/5 text-muted text-xs">
            <div className="flex items-center gap-1.5 font-bold text-fg mb-2">
              <Keyboard className="w-3.5 h-3.5 text-accent" />
              <span>Turntable Keyboard Controls</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-xs font-mono">
              <div><span className="text-fg">A - Z</span> : Type letter</div>
              <div><span className="text-fg">Backspace</span> : Clear cell</div>
              <div><span className="text-fg">Arrow Keys</span> : Move cell</div>
              <div><span className="text-fg">Esc</span> : Close modals</div>
            </div>
          </div>

        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-line/10 bg-surface flex items-center justify-between text-xs text-muted font-mono">
          <span>Anagroove • Hi-Fi Audio Crossword</span>
          <span className="text-ok font-sans">☁️ Session Saved</span>
        </div>

      </div>
    </div>
  );
};
