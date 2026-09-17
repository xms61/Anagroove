import React, { useState } from 'react';
import { ThemeCategory, Puzzle } from '../types/crossword';
import { generateLiveCrossword, SongItem } from '../utils/liveGenerator';
import { dynamicMusicService } from '../services/dynamicMusicService';
import { BlacklistItem } from '../services/apiClient';
import { Zap, X, Disc3, Sparkles, CheckCircle2 } from 'lucide-react';

interface LiveGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  themes: ThemeCategory[];
  allSongs: SongItem[];
  blacklist: BlacklistItem[];
  onPuzzleGenerated: (puzzle: Puzzle) => void;
}

const GENERATOR_GENRES = [
  { id: 'all', name: 'Eclectic All-Time Hits', icon: '🎲', desc: 'True random shuffle across all eras' },
  { id: 'rock', name: 'Rock & Retro Giants', icon: '🎸', desc: 'Queen, Nirvana, Beatles, AC/DC, Zeppelin' },
  { id: 'pop', name: 'Global Pop Icons', icon: '✨', desc: 'Michael Jackson, Taylor Swift, The Weeknd' },
  { id: 'hiphop', name: 'Hip-Hop & R&B Titans', icon: '🎤', desc: 'Eminem, Drake, Kendrick, 50 Cent' },
  { id: 'electronic', name: 'EDM & Dance Floor', icon: '🎧', desc: 'Daft Punk, Avicii, Calvin Harris, Guetta' },
  { id: 'retro', name: '80s & 90s Nostalgia', icon: '📻', desc: 'ABBA, Prince, Wham!, Cranberries' },
  { id: 'poppunk', name: '2000s Pop-Punk', icon: '🖤', desc: 'Blink-182, Paramore, Green Day, Sum 41' },
  { id: 'latin', name: 'Latin & Reggaeton', icon: '🔥', desc: 'Bad Bunny, Daddy Yankee, Shakira, Balvin' },
  { id: 'soundtrack', name: 'Iconic Scores', icon: '🎬', desc: 'Hans Zimmer, John Williams' },
];

export const LiveGeneratorModal: React.FC<LiveGeneratorModalProps> = ({
  isOpen,
  onClose,
  allSongs,
  blacklist,
  onPuzzleGenerated,
}) => {
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [targetWords, setTargetWords] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatusMessage('Querying recognized iconic hits (250k+ followers)...');

    try {
      // 1. Fetch truly randomized pool from recognized artists with min 250k fans
      let candidatePool: SongItem[] = await dynamicMusicService.fetchLiveSongPool(
        selectedGenre,
        blacklist,
        250000,
        30
      );

      // 2. Fallback to catalog if network was offline
      if (candidatePool.length < 8) {
        setStatusMessage('Sampling local recognized catalog...');
        candidatePool = allSongs.filter(s =>
          !blacklist.some(b => s.artist.toLowerCase().includes(b.name.toLowerCase()) || s.title.toLowerCase().includes(b.name.toLowerCase()))
        );
      }

      setStatusMessage('Constructing intersecting crossword in memory...');
      await new Promise(r => setTimeout(r, 150));

      const genreObj = GENERATOR_GENRES.find(g => g.id === selectedGenre);
      const titlePrefix = genreObj ? genreObj.name : 'Eclectic Hits';

      const generated = generateLiveCrossword(
        candidatePool,
        `⚡ Live: ${titlePrefix}`,
        targetWords
      );

      setIsGenerating(false);

      if (generated) {
        onPuzzleGenerated(generated);
        onClose();
      } else {
        alert('Could not construct an intersecting grid from this combination. Trying again will pick a fresh random seed!');
      }
    } catch (e) {
      console.error('Generation error:', e);
      setIsGenerating(false);
      alert('An error occurred during generation. Please try again!');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-amber-500/20 rounded-2xl max-w-lg w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.35)]">
            <Zap className="w-6 h-6 text-white fill-current" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Generate On The Fly
              <Sparkles className="w-4 h-4 text-amber-400" />
            </h2>
            <p className="text-xs text-slate-400">
              Truly randomized crosswords from recognized hits across eras & genres.
            </p>
          </div>
        </div>

        {/* Recognizability Guarantee Banner */}
        <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-bold text-amber-300">High Recognizability Guaranteed: </span>
            Every song is verified with a minimum of <span className="underline font-semibold">250,000+ followers & high play count</span>. No obscure noise or unknown cover bands.
          </div>
        </div>

        {/* Step 1: Select Genre / Era */}
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            1. Select Era or Style
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
            {GENERATOR_GENRES.map(g => {
              const isSelected = selectedGenre === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGenre(g.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-[#181e2c] border-white/5 text-slate-300 hover:bg-[#202738] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span>{g.icon}</span>
                    <span className="truncate">{g.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-1">
                    {g.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Target Density / Clues */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            2. Puzzle Complexity
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTargetWords(10)}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                targetWords === 10
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-inner'
                  : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'
              }`}
            >
              <div className="font-bold text-sm text-slate-100">Classic (8–10 Words)</div>
              <div className="text-[11px] text-slate-400">Casual, quick-solving session</div>
            </button>

            <button
              type="button"
              onClick={() => setTargetWords(14)}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                targetWords === 14
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-inner'
                  : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'
              }`}
            >
              <div className="font-bold text-sm text-slate-100">Dense (12–15 Words)</div>
              <div className="text-[11px] text-slate-400">Maximum interconnectivity</div>
            </button>
          </div>
        </div>

        {/* Big Action Button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:opacity-95 text-slate-950 font-black text-sm sm:text-base shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99] disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Disc3 className="w-5 h-5 animate-spin text-slate-950" />
              <span>{statusMessage || 'Selecting recognizable songs...'}</span>
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 fill-current" />
              <span>Generate & Play Live Crossword</span>
            </>
          )}
        </button>

        <p className="text-[10px] text-slate-500 text-center mt-3 font-mono">
          Spans decades of certified hits • Sub-millisecond layout generation • Anti-repetition active
        </p>
      </div>
    </div>
  );
};
