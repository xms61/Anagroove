import React, { useState } from 'react';
import { Puzzle } from '../types/crossword';
import { dynamicMusicService } from '../services/dynamicMusicService';
import { Zap, X, Disc3, Sparkles, CheckCircle2, Sliders, Dices } from 'lucide-react';

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

const POPULARITY_TIERS = [
  { id: 'pure', name: 'Pure Random', desc: 'Any popularity, underground to stars' },
  { id: 'obscure', name: 'Hidden Gems', desc: 'Lesser-known tracks & indie cuts' },
  { id: 'balanced', name: 'Balanced', desc: 'Pleasant mix of hits & discoveries' },
  { id: 'mainstream', name: 'Top Hits', desc: 'Famous singles & viral favorites' },
] as const;

const EXAMPLE_PROMPTS = [
  '80s Japanese City Pop',
  '90s French House bangers',
  'Classic 70s rock ballads',
  'Underrated indie rock gems',
  'Songs by Daft Punk',
  'Pure random anything goes',
];

export const LiveGeneratorModal: React.FC<LiveGeneratorModalProps> = ({
  isOpen,
  onClose,
  onPuzzleGenerated,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'prompt'>('presets');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [popularity, setPopularity] = useState<'pure' | 'obscure' | 'balanced' | 'mainstream'>('balanced');
  const [prompt, setPrompt] = useState('');
  const [targetWords, setTargetWords] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customArtist, setCustomArtist] = useState('');
  const [seed, setSeed] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatusMessage('Harvesting candidate tracks across catalog universes...');
    try {
      const options = {
        genre: activeTab === 'presets' ? selectedGenre : 'all',
        targetWords,
        popularity,
        prompt: activeTab === 'prompt' ? prompt : undefined,
        artist: customArtist.trim() || undefined,
        seed: seed.trim() || undefined,
      };

      const { puzzle } = await dynamicMusicService.generateLivePuzzle(options);
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
      <div className="bg-[#121622] border border-amber-500/20 rounded-2xl max-w-lg w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100 max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.35)]">
            <Zap className="w-6 h-6 text-white fill-current" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Generate Live Crossword <Sparkles className="w-4 h-4 text-amber-400" />
            </h2>
            <p className="text-xs text-slate-400">Pure random sampling & guided music discovery with audio previews.</p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex gap-2 mb-4 p-1 bg-[#181e2c] rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Dices className="w-3.5 h-3.5" />
            <span>Theme Presets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'prompt'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Steered Prompt & AI</span>
          </button>
        </div>

        {activeTab === 'presets' ? (
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              1. Select Style ({GENERATOR_GENRES.length} Themes)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {GENERATOR_GENRES.map(genre => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => setSelectedGenre(genre.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    selectedGenre === genre.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-[#181e2c] border-white/5 text-slate-300 hover:bg-[#202738] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span>{genre.icon}</span>
                    <span className="truncate">{genre.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-1">{genre.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Describe your dream crossword puzzle
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Obscure 80s synth-pop, or songs by Queen, or 90s alternative rock..."
              rows={2}
              className="w-full bg-[#181e2c] border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EXAMPLE_PROMPTS.map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="text-[10px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-amber-300/90 border border-white/5 cursor-pointer transition"
                >
                  + {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popularity Range Selector */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            2. Popularity Spectrum
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {POPULARITY_TIERS.map(tier => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setPopularity(tier.id)}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  popularity === tier.id
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                    : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'
                }`}
              >
                <div className="text-xs font-bold truncate text-slate-200">{tier.name}</div>
                <div className="text-[9px] text-slate-400 truncate mt-0.5">{tier.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Puzzle Complexity */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            3. Puzzle Word Count
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[10, 14].map(words => (
              <button
                key={words}
                type="button"
                onClick={() => setTargetWords(words)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  targetWords === words
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-inner'
                    : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'
                }`}
              >
                <div className="font-bold text-xs text-slate-100">
                  {words === 10 ? 'Classic (8–10 Words)' : 'Dense (12–15 Words)'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {words === 10 ? 'Casual, quick-solving session' : 'Maximum interconnectivity'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Filters Accordion */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-amber-400/80 hover:text-amber-300 font-semibold cursor-pointer mb-2"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{showAdvanced ? 'Hide Advanced Steering' : 'Show Advanced Steering (Artist, Seed)'}</span>
          </button>

          {showAdvanced && (
            <div className="p-3 bg-[#181e2c] rounded-xl border border-white/5 space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Target Single Artist (Optional)</label>
                <input
                  type="text"
                  value={customArtist}
                  onChange={e => setCustomArtist(e.target.value)}
                  placeholder="e.g. Fleetwood Mac, The Beatles, Taylor Swift"
                  className="w-full bg-[#121622] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Seed for Reproducible Puzzle (Optional)</label>
                <input
                  type="text"
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  placeholder="e.g. party-game-42"
                  className="w-full bg-[#121622] border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Informative footer banner */}
        <div className="mb-5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-200/90 leading-relaxed">
            <span className="font-bold text-amber-300">Natural Song Titles: </span>
            Answers combine full track titles up to 16 characters (e.g. <i>YOURLOVE</i>, <i>GETLUCKY</i>) with 30s audio previews.
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:opacity-95 text-slate-950 font-black text-sm sm:text-base shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99] disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Disc3 className="w-5 h-5 animate-spin text-slate-950" />
              <span>{statusMessage}</span>
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 fill-current" />
              <span>Generate & Play Live Crossword</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
