import React, { useState } from 'react';
import { Puzzle } from '../types/crossword';
import { dynamicMusicService } from '../services/dynamicMusicService';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button, cx } from './ui';
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

/** A selectable option: raised when idle, accent-tinted when chosen. */
function Choice({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'p-2.5 rounded-control border text-left transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        selected ? 'bg-accent/15 border-accent' : 'bg-raised/60 border-line hover:bg-raised',
        className,
      )}
    >
      {children}
    </button>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 text-xs font-bold tracking-[0.14em] text-muted uppercase">{children}</div>
);

const INPUT = 'w-full bg-bg/50 border border-line rounded-control px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:border-accent';

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

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
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
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-xl p-6 sm:p-7">
      {({ titleId, descriptionId }) => (
        <div className="flex flex-col gap-5">
          <div className="pr-10">
            <h2 id={titleId} className="font-display text-2xl leading-none">Custom puzzle</h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted">Pick a theme or describe what you want to hear.</p>
          </div>

          <div className="flex gap-1 p-1 bg-bg/40 border border-line rounded-control" role="group" aria-label="Puzzle source">
            {(['presets', 'prompt'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cx('flex-1 h-9 rounded-control text-sm font-bold cursor-pointer transition', activeTab === tab ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
              >
                {tab === 'presets' ? 'Theme' : 'Prompt'}
              </button>
            ))}
          </div>

          {activeTab === 'presets' ? (
            <section>
              <SectionTitle>Theme</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                {THEMES.map(theme => (
                  <Choice key={theme.id} selected={selectedGenre === theme.id} onClick={() => setSelectedGenre(theme.id)}>
                    <div className="flex items-center gap-1.5 text-sm font-bold">
                      <span aria-hidden="true">{theme.icon}</span>
                      <span className="truncate">{theme.name}</span>
                    </div>
                    <div className="text-xs text-muted truncate mt-0.5">{theme.description}</div>
                  </Choice>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <label htmlFor="generator-prompt"><SectionTitle>Prompt</SectionTitle></label>
              <textarea
                id="generator-prompt"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="80s synth-pop, songs by Queen, 90s alternative rock…"
                rows={2}
                className={cx(INPUT, 'resize-none')}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {EXAMPLE_PROMPTS.map(example => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="text-xs px-2.5 py-1 rounded-control bg-raised/60 hover:bg-raised border border-line cursor-pointer transition"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Popularity</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {POPULARITY_TIERS.map(tier => (
                <Choice key={tier.id} selected={popularity === tier.id} onClick={() => setPopularity(tier.id)}>
                  <div className="text-sm font-bold truncate">{tier.name}</div>
                  <div className="text-xs text-muted line-clamp-2 mt-0.5">{tier.desc}</div>
                </Choice>
              ))}
            </div>
          </section>

          <div className="grid sm:grid-cols-2 gap-5">
            <fieldset>
              <legend><SectionTitle>Languages</SectionTitle></legend>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGE_OPTIONS.map(option => {
                  const selected = languages.includes(option.id);
                  return (
                    <Choice
                      key={option.id}
                      selected={selected}
                      onClick={() => setLanguages(prev => (selected ? prev.filter(l => l !== option.id) : [...prev, option.id]))}
                      className="!py-1.5 px-3 text-sm font-bold"
                    >
                      <span title={option.name}>{option.badge}</span>
                    </Choice>
                  );
                })}
              </div>
              <p className="text-xs text-muted mt-1.5">{languages.length === 0 ? 'None picked: the theme decides' : 'Only these languages'}</p>
            </fieldset>

            <section>
              <SectionTitle>Size</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                {[10, 14].map(words => (
                  <Choice key={words} selected={targetWords === words} onClick={() => setTargetWords(words)}>
                    <div className="text-sm font-bold">{words === 10 ? 'Classic' : 'Dense'}</div>
                    <div className="text-xs text-muted">{words === 10 ? '8–10 words' : '12–15 words'}</div>
                  </Choice>
                ))}
              </div>
            </section>
          </div>

          <section>
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg cursor-pointer"
            >
              <ChevronDown className={cx('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} aria-hidden="true" />
              Artist and seed
            </button>
            {showAdvanced && (
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-muted flex flex-col gap-1">
                  One artist only
                  <input type="text" value={customArtist} onChange={e => setCustomArtist(e.target.value)} placeholder="Fleetwood Mac" className={INPUT} />
                </label>
                <label className="text-xs text-muted flex flex-col gap-1">
                  Seed (same seed, same puzzle)
                  <input type="text" value={seed} onChange={e => setSeed(e.target.value)} placeholder="party-game-42" className={INPUT} />
                </label>
              </div>
            )}
          </section>

          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={isGenerating}
            icon={isGenerating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : undefined}
            className="w-full h-12 text-base"
          >
            {isGenerating ? 'Picking songs…' : 'Build puzzle'}
          </Button>
        </div>
      )}
    </Modal>
  );
};
