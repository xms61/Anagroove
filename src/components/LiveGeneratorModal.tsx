import React, { useState } from 'react';
import { Puzzle } from '../types/crossword';
import { dynamicMusicService } from '../services/dynamicMusicService';
import { Zap, X, Disc3, Sparkles, CheckCircle2 } from 'lucide-react';

interface LiveGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPuzzleGenerated: (puzzle: Puzzle) => void;
}

const GENERATOR_GENRES = [
  { id: 'all', name: 'Mixed & Eclectic', icon: '🎲', desc: 'Fresh cross-genre selection' },
  { id: 'kpop', name: 'K-Pop Universe', icon: '🌸', desc: 'Korean pop & idol anthems' },
  { id: 'anime', name: 'Anime & J-Rock', icon: '⚔️', desc: 'Anime openings & J-Rock' },
  { id: 'gaming', name: 'Video Game OSTs', icon: '🎮', desc: 'Iconic game soundtracks' },
  { id: 'pop', name: 'Global Pop Hits', icon: '✨', desc: 'Chart-topping pop icons' },
  { id: 'rock', name: 'Rock & Retro Legends', icon: '🎸', desc: 'Classic & modern rock riffs' },
  { id: 'hiphop', name: 'Hip-Hop & Rap Giants', icon: '🎤', desc: 'Beats, bars & rap titans' },
  { id: 'edm', name: 'EDM & Dance Anthems', icon: '🎧', desc: 'Club bangers & electronic' },
  { id: 'cinematic', name: 'Cinematic Movie OSTs', icon: '🎬', desc: 'Epic film & movie scores' },
  { id: 'latin', name: 'Latin & Reggaeton', icon: '🔥', desc: 'Hot reggaeton & latin pop' },
  { id: 'poppunk', name: '2000s Pop-Punk & Emo', icon: '🖤', desc: 'Nostalgic punk & emo hits' },
];

export const LiveGeneratorModal: React.FC<LiveGeneratorModalProps> = ({
  isOpen,
  onClose,
  onPuzzleGenerated,
}) => {
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [targetWords, setTargetWords] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatusMessage('Selecting fresh eligible Deezer tracks...');
    try {
      const { puzzle } = await dynamicMusicService.generateLivePuzzle(selectedGenre, targetWords);
      onPuzzleGenerated(puzzle);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to generate a live puzzle. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-amber-500/20 rounded-2xl max-w-lg w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.35)]">
            <Zap className="w-6 h-6 text-white fill-current" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">Generate On The Fly <Sparkles className="w-4 h-4 text-amber-400" /></h2>
            <p className="text-xs text-slate-400">A server-generated puzzle from live Deezer previews.</p>
          </div>
        </div>
        <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed"><span className="font-bold text-amber-300">Live selection: </span>artist and track filters, blacklists, and repeat exclusion run on the server.</div>
        </div>
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">1. Select Style ({GENERATOR_GENRES.length} Themes)</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
            {GENERATOR_GENRES.map(genre => (
              <button key={genre.id} type="button" onClick={() => setSelectedGenre(genre.id)} className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${selectedGenre === genre.id ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]' : 'bg-[#181e2c] border-white/5 text-slate-300 hover:bg-[#202738] hover:text-white'}`}>
                <div className="flex items-center gap-1.5 font-bold text-xs"><span>{genre.icon}</span><span className="truncate">{genre.name}</span></div>
                <div className="text-[10px] text-slate-400 truncate mt-1">{genre.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">2. Puzzle Complexity</label>
          <div className="grid grid-cols-2 gap-3">
            {[10, 14].map(words => <button key={words} type="button" onClick={() => setTargetWords(words)} className={`p-3 rounded-xl border text-left transition cursor-pointer ${targetWords === words ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-inner' : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'}`}><div className="font-bold text-sm text-slate-100">{words === 10 ? 'Classic (8–10 Words)' : 'Dense (12–15 Words)'}</div><div className="text-[11px] text-slate-400">{words === 10 ? 'Casual, quick-solving session' : 'Maximum interconnectivity'}</div></button>)}
          </div>
        </div>
        <button type="button" onClick={handleGenerate} disabled={isGenerating} className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:opacity-95 text-slate-950 font-black text-sm sm:text-base shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99] disabled:opacity-50">
          {isGenerating ? <><Disc3 className="w-5 h-5 animate-spin text-slate-950" /><span>{statusMessage}</span></> : <><Zap className="w-5 h-5 fill-current" /><span>Generate & Play Live Crossword</span></>}
        </button>
      </div>
    </div>
  );
};
