import React from 'react';
import { ThemeCategory } from '../types/crossword';
import { Zap } from 'lucide-react';

interface ThemeBarProps {
  themes: ThemeCategory[];
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onOpenLiveGenerator: () => void;
}

export const ThemeBar: React.FC<ThemeBarProps> = ({
  themes,
  activeThemeId,
  onSelectTheme,
  onOpenLiveGenerator,
}) => {
  return (
    <div className="w-full bg-[#0e121a]/85 border-b border-white/10 px-4 py-2.5 backdrop-blur-md sticky top-[57px] z-20 overflow-x-auto no-scrollbar shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 min-w-max">
        {/* On-The-Fly Instant Generator Action */}
        <button
          type="button"
          onClick={onOpenLiveGenerator}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white font-extrabold text-xs shadow-[0_0_14px_rgba(245,158,11,0.35)] hover:opacity-95 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>⚡ Live On The Fly</span>
        </button>

        <div className="h-4 w-px bg-white/15 shrink-0" />

        {/* 11 Theme Pills */}
        <div className="flex items-center gap-2">
          {themes.map(t => {
            const isActive = t.id === activeThemeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTheme(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.35)] scale-[1.02]'
                    : 'bg-[#161c28]/70 hover:bg-[#1f2738] text-slate-300 hover:text-white border border-white/5'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
                {isActive && (
                  <span className="text-[9.5px] bg-slate-900/40 text-slate-950 font-bold px-1.5 py-0.2 rounded-full ml-0.5">
                    20
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
