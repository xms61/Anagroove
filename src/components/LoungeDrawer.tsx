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
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lounge-drawer-title"
        tabIndex={-1}
        className="relative w-full max-w-md bg-kissa-base border-l outline-none border-white/10 text-slate-200 shadow-2xl flex flex-col h-full z-10 overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-white/10 bg-kissa-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.35)]">
              <Disc3 className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="text-xs tracking-widest font-mono text-amber-400 uppercase font-bold">
                JAZZ KISSA & AUDIO SALON
              </div>
              <h2 id="lounge-drawer-title" className="text-base font-bold text-white tracking-tight">
                Lounge Menu
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition border border-white/5 cursor-pointer"
            title="Close menu (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Current Session Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-kissa-card to-kissa-surface border border-amber-500/20 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between text-xs text-amber-300 font-mono mb-1.5">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>ACTIVE TURNTABLE</span>
              </span>
              <span className="text-emerald-400 font-bold">⚡ Live Crossword</span>
            </div>

            <div className="text-lg font-black text-white tracking-tight mb-3">
              {activePuzzleTitle}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onInstantRandomPuzzle();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 font-bold text-xs transition cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Generate Fresh Random Puzzle</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </button>
          </div>

          {/* Quick Modes & Social Group */}
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
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
                className="flex items-center justify-between p-3.5 rounded-xl bg-kissa-surface hover:bg-kissa-panel border border-white/10 hover:border-amber-500/40 transition group cursor-pointer text-left shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center justify-center group-hover:scale-105 transition">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100 group-hover:text-amber-200 transition">
                      Live Studio (Style & Size Picker)
                    </div>
                    <div className="text-xs text-slate-400">
                      Generate crosswords by genre (Rock, Pop, K-Pop, Gaming & more)
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-400 group-hover:translate-x-0.5 transition" />
              </button>

              {/* Multiplayer Booth */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMultiplayer();
                }}
                className="flex items-center justify-between p-3.5 rounded-xl bg-kissa-surface hover:bg-kissa-panel border border-white/10 hover:border-cyan-500/40 transition group cursor-pointer text-left shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center group-hover:scale-105 transition ${
                    multiplayerCode 
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' 
                      : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  }`}>
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100 group-hover:text-cyan-200 transition flex items-center gap-2">
                      <span>Multiplayer Lounge</span>
                      {multiplayerCode && (
                        <span className="text-xs px-1.5 py-0.2 bg-cyan-400/20 text-cyan-300 rounded font-mono font-bold">
                          ROOM: {multiplayerCode}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      Real-time Co-op & Versus race with friends
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition" />
              </button>
            </div>
          </div>

          {/* Library Tools & Filters */}
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2.5 font-bold">
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
                className="w-full flex items-center justify-between p-3 rounded-xl bg-kissa-surface hover:bg-kissa-card border border-white/5 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center justify-center">
                    <ListMusic className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      Listening Log & Showcase
                    </div>
                    <div className="text-xs text-slate-400">
                      View full tracklist and replay solved songs
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Solved puzzles across sessions */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-kissa-surface hover:bg-kissa-card border border-white/5 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center justify-center">
                    <History className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      Solved History
                    </div>
                    <div className="text-xs text-slate-400">
                      Every puzzle you've finished, with times
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              </button>

              {/* Blacklist Filter */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBlacklist();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-kissa-surface hover:bg-kissa-card border border-white/5 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center justify-center">
                    <Ban className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>Crate Blacklist Filter</span>
                      {blacklistCount > 0 && (
                        <span className="text-xs px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded font-mono font-bold">
                          {blacklistCount} Muted
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      Hide specific artists or songs from puzzles
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Lounge Settings */}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-kissa-surface hover:bg-kissa-card border border-white/5 transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center justify-center">
                      <Settings className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        Lounge Settings
                      </div>
                      <div className="text-xs text-slate-400">
                        Adjust audio volume and word solve animations
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Keyboard Shortcuts Guide */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-slate-400 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-300 mb-2">
              <Keyboard className="w-3.5 h-3.5 text-amber-400" />
              <span>Turntable Keyboard Controls</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-xs font-mono">
              <div><span className="text-slate-200">A - Z</span> : Type letter</div>
              <div><span className="text-slate-200">Backspace</span> : Clear cell</div>
              <div><span className="text-slate-200">Arrow Keys</span> : Move cell</div>
              <div><span className="text-slate-200">Esc</span> : Close modals</div>
            </div>
          </div>

        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-white/10 bg-kissa-surface flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Anagroove • Hi-Fi Audio Crossword</span>
          <span className="text-emerald-400 font-sans">☁️ Session Saved</span>
        </div>

      </div>
    </div>
  );
};
