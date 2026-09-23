import React, { useState } from 'react';
import { Puzzle } from '../types/crossword';
import { dynamicMusicService } from '../services/dynamicMusicService';
import { Zap, Disc3, Sparkles, CheckCircle2, Sliders, Dices } from 'lucide-react';
import { Modal } from './Modal';
import { THEMES } from '../../shared/themes';

export type PuzzleLanguage = 'en' | 'ja' | 'ko';

export interface PuzzleGenerationConfig {
  genre?: string;
  /** Explicit song languages; empty/undefined lets the theme decide. */
  languages?: PuzzleLanguage[];
  targetWords?: number;
  popularity?: 'pure' | 'obscure' | 'indie' | 'balanced' | 'mainstream';
  prompt?: string;
  artist?: string;
  seed?: string;
}

interface LiveGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPuzzleGenerated: (puzzle: Puzzle, config: PuzzleGenerationConfig) => void;
}


const POPULARITY_TIERS = [
  { id: 'pure', name: 'Pure Random', desc: 'Any popularity, underground to stars' },
  { id: 'obscure', name: 'Hidden Gems', desc: 'Lesser-known tracks & indie cuts' },
  { id: 'balanced', name: 'Balanced', desc: 'Pleasant mix of hits & discoveries' },
  { id: 'mainstream', name: 'Top Hits', desc: 'Famous singles & viral favorites' },
] as const;

const LANGUAGE_OPTIONS: { id: PuzzleLanguage; badge: string; name: string }[] = [
  { id: 'en', badge: 'EN', name: 'English' },
  { id: 'ja', badge: 'JA', name: 'Japanese' },
  { id: 'ko', badge: 'KO', name: 'Korean' },
];

const EXAMPLE_PROMPTS = [
  'Songs by Daft Punk',
  'Anime from the years 2020-2026',
  '80s Japanese City Pop',
  '90s Grunge before 1994',
  'Classic 70s rock ballads',
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
  const [languages, setLanguages] = useState<PuzzleLanguage[]>([]);
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
        languages: languages.length > 0 ? languages : undefined,
      };

      const { puzzle } = await dynamicMusicService.generateLivePuzzle(options);
      onPuzzleGenerated(puzzle, options);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to generate a live puzzle. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="border-accent/20 max-w-lg p-6">
      {({ titleId, descriptionId }) => (
      <>
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent via-bad to-hi flex items-center justify-center">
            <Zap className="w-6 h-6 text-fg fill-current" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-fg flex items-center gap-2">
              Generate Live Crossword <Sparkles className="w-4 h-4 text-accent" />
            </h2>
            <p id={descriptionId} className="text-xs text-muted">Pure random sampling & guided music discovery with audio previews.</p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex gap-2 mb-4 p-1 bg-panel rounded-xl border border-line/5">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-accent text-on-accent shadow'
                : 'text-muted hover:text-fg'
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
                ? 'bg-accent text-on-accent shadow'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Steered Prompt</span>
          </button>
        </div>

        {activeTab === 'presets' ? (
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
              1. Select Style ({THEMES.length} Themes)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {THEMES.map(genre => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => setSelectedGenre(genre.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    selectedGenre === genre.id
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-panel border-line/5 text-fg hover:bg-raised hover:text-fg'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span>{genre.icon}</span>
                    <span className="truncate">{genre.name}</span>
                  </div>
                  <div className="text-xs text-muted truncate mt-1">{genre.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
              Describe your dream crossword puzzle
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Obscure 80s synth-pop, or songs by Queen, or 90s alternative rock..."
              rows={2}
              className="w-full bg-panel border border-line/10 rounded-xl p-3 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EXAMPLE_PROMPTS.map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="text-xs px-2 py-1 rounded-md bg-fg/5 hover:bg-fg/10 text-accent/90 border border-line/5 cursor-pointer transition"
                >
                  + {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popularity Range Selector */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
            2. Popularity Spectrum
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {POPULARITY_TIERS.map(tier => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setPopularity(tier.id)}
                aria-pressed={popularity === tier.id}
                className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                  popularity === tier.id
                    ? 'bg-accent/20 border-accent text-accent'
                    : 'bg-panel border-line/5 text-muted hover:bg-raised'
                }`}
              >
                <div className="text-xs font-bold truncate text-fg">{tier.name}</div>
                <div className="text-xs text-muted truncate mt-0.5">{tier.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Song language filter (catalog holds English, Japanese and Korean) */}
        <fieldset className="mb-4">
          <legend className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
            Song Languages
          </legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {LANGUAGE_OPTIONS.map(option => {
              const selected = languages.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  title={option.name}
                  onClick={() => setLanguages(prev => (selected ? prev.filter(l => l !== option.id) : [...prev, option.id]))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                    selected
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-panel border-line/10 text-fg hover:bg-raised'
                  }`}
                >
                  <span className="font-mono font-bold text-xs">{option.badge}</span>
                  <span>{option.name}</span>
                </button>
              );
            })}
            <span className="text-xs text-muted ml-1">
              {languages.length === 0 ? 'Auto: picked from the theme' : 'Only these languages'}
            </span>
          </div>
        </fieldset>

        {/* Puzzle Complexity */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
            3. Puzzle Word Count
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[10, 14].map(words => (
              <button
                key={words}
                type="button"
                onClick={() => setTargetWords(words)}
                aria-pressed={targetWords === words}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  targetWords === words
                    ? 'bg-accent/20 border-accent text-accent shadow-inner'
                    : 'bg-panel border-line/5 text-muted hover:bg-raised'
                }`}
              >
                <div className="font-bold text-xs text-fg">
                  {words === 10 ? 'Classic (8–10 Words)' : 'Dense (12–15 Words)'}
                </div>
                <div className="text-xs text-muted">
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
            className="flex items-center gap-1 text-xs text-accent/80 hover:text-accent font-semibold cursor-pointer mb-2"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{showAdvanced ? 'Hide Advanced Steering' : 'Show Advanced Steering (Artist, Seed)'}</span>
          </button>

          {showAdvanced && (
            <div className="p-3 bg-panel rounded-xl border border-line/5 space-y-2.5">
              <div>
                <label className="block text-xs text-muted mb-1">Target Single Artist (Optional)</label>
                <input
                  type="text"
                  value={customArtist}
                  onChange={e => setCustomArtist(e.target.value)}
                  placeholder="e.g. Fleetwood Mac, The Beatles, Taylor Swift"
                  className="w-full bg-surface border border-line/10 rounded-lg p-2 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Seed for Reproducible Puzzle (Optional)</label>
                <input
                  type="text"
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  placeholder="e.g. party-game-42"
                  className="w-full bg-surface border border-line/10 rounded-lg p-2 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Informative footer banner */}
        <div className="mb-5 p-2.5 rounded-xl bg-accent/10 border border-accent/25 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="text-xs text-accent/90 leading-relaxed">
            <span className="font-bold text-accent">Natural Song Titles: </span>
            Answers combine full track titles up to 16 characters (e.g. <i>YOURLOVE</i>, <i>GETLUCKY</i>) with 30s audio previews.
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-accent via-bad to-accent hover:opacity-95 text-on-accent font-black text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.99] disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Disc3 className="w-5 h-5 animate-spin text-on-accent" />
              <span>{statusMessage}</span>
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 fill-current" />
              <span>Generate & Play Live Crossword</span>
            </>
          )}
        </button>
      </>
      )}
    </Modal>
  );
};
