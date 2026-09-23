import { useState, useMemo, useEffect, useCallback } from 'react';
import { Puzzle, CellValidity } from './types/crossword';
import { useCrosswordGame } from './hooks/useCrosswordGame';
import { CrosswordGrid } from './components/CrosswordGrid';
import { ClueList } from './components/ClueList';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { HintModal } from './components/HintModal';
import { EndScreenModal } from './components/EndScreenModal';
import { LiveGeneratorModal, PuzzleGenerationConfig } from './components/LiveGeneratorModal';
import { BlacklistModal } from './components/BlacklistModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { LoungeDrawer } from './components/LoungeDrawer';
import { apiClient, getMultiplayerPlayerId } from './services/apiClient';
import { useBlacklist } from './hooks/useBlacklist';
import { useMultiplayer } from './hooks/useMultiplayer';
import { dynamicMusicService } from './services/dynamicMusicService';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { Modal } from './components/Modal';
import { useSettings } from './hooks/useSettings';
import { readJson, readString, STORAGE_KEYS, writeJson, writeString } from './services/storage';
import { themeById } from '../shared/themes';
import { Disc3, Lightbulb, CheckSquare, Menu, ChevronDown, Swords, Sparkles, Shuffle, AlertCircle, Settings, Trophy } from 'lucide-react';

/** A saved theme id that no longer exists (e.g. the removed "latin") falls back to Mixed. */
const knownThemeOr = (id: string) => (themeById(id) ? id : 'all');

type Dialog = 'hint' | 'generator' | 'blacklist' | 'multiplayer' | 'lounge' | 'settings' | 'history';

function emptyGrid<T>(puzzle: Puzzle, value: T): T[][] {
  return Array.from({ length: puzzle.rows }, () => Array<T>(puzzle.cols).fill(value));
}

const EMPTY_PUZZLE: Puzzle = {
  id: 'placeholder',
  title: 'Live Deezer Crossword',
  difficulty: 'medium',
  rows: 10,
  cols: 10,
  grid: Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) => ({
      row: r,
      col: c,
      char: null,
      isBlock: true,
      number: null,
    }))
  ),
  clues: [],
};

export default function App() {
  const playerId = useMemo(() => getMultiplayerPlayerId(), []);
  const [currentGenre, setCurrentGenre] = useState<string>(() => knownThemeOr(readString(STORAGE_KEYS.activeGenre, 'all')));
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(() => readJson<Puzzle | null>(STORAGE_KEYS.activeLivePuzzle, null));

  const [isLoadingPuzzle, setIsLoadingPuzzle] = useState(false);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);

  // One dialog at a time
  const [openDialog, setOpenDialog] = useState<Dialog | null>(null);
  const closeDialog = () => setOpenDialog(null);

  const { settings, updateSettings } = useSettings();
  const { enableWordAnimations, defaultVolume } = settings;
  const handleToggleWordAnimations = (enabled: boolean) => updateSettings({ enableWordAnimations: enabled });
  const handleChangeDefaultVolume = (volume: number) => updateSettings({ defaultVolume: volume });

  const multiplayer = useMultiplayer(playerId, {
    onPuzzle: (puzzle, sharedGrid) => loadPuzzle(puzzle, sharedGrid),
    onSharedGrid: (grid) => setUserLetters(grid),
    onCoopLetter: (row, col, char) => setUserLetters(prev => {
      if (!prev || row >= prev.length || col >= prev[0].length) return prev;
      const next = prev.map(r => [...r]);
      next[row][col] = char;
      return next;
    }),
    onGameStarted: () => setOpenDialog(dialog => (dialog === 'multiplayer' ? null : dialog)),
  });

  // Blacklist state
  const { blacklist, addArtist, addSong, removeItem } = useBlacklist();

  // Playback state for vinyl animation sync
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const activePuzzle = currentPuzzle || EMPTY_PUZZLE;

  const [activePuzzleConfig, setActivePuzzleConfig] = useState<PuzzleGenerationConfig>(
    () => {
      const saved = readJson<PuzzleGenerationConfig>(STORAGE_KEYS.activeConfig, { genre: currentGenre, targetWords: 10 });
      return { ...saved, genre: knownThemeOr(saved.genre || 'all') };
    }
  );

  const {
    userLetters,
    setUserLetters,
    validity,
    setValidity,
    selectedCell,
    activeClue,
    audioPlayTrigger,
    celebratingCells,
    isCompleted,
    setIsCompleted,
    showEndScreen,
    setShowEndScreen,
    isCellInActiveWord,
    selectCell,
    selectClue,
    handleInputLetter,
    handleBackspace,
    moveCursor,
    nextClue,
    prevClue,
    applyHint,
    validateGrid,
  } = useCrosswordGame(activePuzzle, {
    themeId: currentGenre,
    multiplayerRoom: multiplayer.room,
    playerId,
    playerName: readString(STORAGE_KEYS.playerName, 'Player'),
    playerColor: '#1db954',
  });

  /** Shows a puzzle with an empty grid (or a co-op room's letters) and keeps it for reloads. */
  const loadPuzzle = useCallback((puzzle: Puzzle, sharedGrid?: string[][]) => {
    setCurrentPuzzle(puzzle);
    writeJson(STORAGE_KEYS.activeLivePuzzle, puzzle);
    setUserLetters(Array.isArray(sharedGrid) ? sharedGrid : emptyGrid(puzzle, ''));
    setValidity(emptyGrid<CellValidity>(puzzle, 'untested'));
    setShowEndScreen(false);
    setIsCompleted(false);
  }, [setUserLetters, setValidity, setShowEndScreen, setIsCompleted]);

  /** Makes a generator config the active one: its theme, and the settings for the next puzzle. */
  const adoptConfig = useCallback((config: PuzzleGenerationConfig) => {
    if (config.genre) {
      setCurrentGenre(config.genre);
      writeString(STORAGE_KEYS.activeGenre, config.genre);
    }
    setActivePuzzleConfig(config);
    writeJson(STORAGE_KEYS.activeConfig, config);
  }, []);

  const generateNewPuzzle = useCallback(async (customConfig?: PuzzleGenerationConfig) => {
    const config = customConfig || activePuzzleConfig;
    setIsLoadingPuzzle(true);
    setPuzzleError(null);
    try {
      const { puzzle } = await dynamicMusicService.generateLivePuzzle({
        genre: config.genre || currentGenre,
        targetWords: config.targetWords || 10,
        popularity: config.popularity,
        prompt: config.prompt,
        artist: config.artist,
        languages: config.languages,
      });
      loadPuzzle(puzzle);
      adoptConfig(config);
    } catch (err: unknown) {
      console.error('Failed to generate live puzzle:', err);
      setPuzzleError(err instanceof Error ? err.message : 'Could not generate live crossword.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }, [activePuzzleConfig, currentGenre, loadPuzzle, adoptConfig]);

  // Initial load: generate random puzzle if none stored in localStorage
  useEffect(() => {
    if (!currentPuzzle) {
      generateNewPuzzle(activePuzzleConfig);
    }
  }, [currentPuzzle, activePuzzleConfig, generateNewPuzzle]);

  // Restore server progress on initial load (no accounts needed)
  useEffect(() => {
    if (!currentPuzzle) return;
    apiClient.getProgress().then(saved => {
      if (saved && saved.puzzleId && saved.puzzleId === currentPuzzle.id) {
        if (saved.userLetters && saved.userLetters.length === currentPuzzle.rows) {
          setUserLetters(saved.userLetters);
        }
        if (saved.validity && saved.validity.length === currentPuzzle.rows) {
          setValidity(saved.validity as CellValidity[][]);
        }
        console.log('☁️ Restored progress from server session without account');
      }
    });
  }, [currentPuzzle?.id, setUserLetters, setValidity]);

  const handleNextPuzzle = () => {
    generateNewPuzzle(activePuzzleConfig);
  };

  const handleRestartPuzzle = () => {
    if (currentPuzzle) loadPuzzle(currentPuzzle);
  };

  return (
    <div className="min-h-screen bg-kissa-base text-slate-100 flex flex-col pb-36">
      {/* Top Clean Minimalist Header */}
      <header className="border-b border-white/10 bg-kissa-surface/90 backdrop-blur-md sticky top-0 z-30 px-4 py-2.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* Brand & Live Style Selector */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.35)] shrink-0">
              <Disc3 className={`w-5 h-5 ${isAudioPlaying ? 'animate-spin-slow' : ''}`} />
            </div>
            <div className="sr-only sm:not-sr-only">
              <h1 className="font-black text-base tracking-tight text-white flex items-center gap-2">
                <span>SpotySpice</span>
              </h1>
            </div>

            {/* Live Style Badge & Generator Trigger */}
            <button
              type="button"
              onClick={() => setOpenDialog('generator')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-kissa-card hover:bg-kissa-panel border border-amber-500/30 hover:border-amber-500/60 text-xs font-semibold text-slate-200 transition cursor-pointer shadow-sm group"
              title="Click to generate a custom live crossword or change musical style"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-amber-200 truncate max-w-[120px] sm:max-w-[200px]">
                {currentPuzzle?.title || 'Live Crossword'}
              </span>
              {currentPuzzle && (
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                  ({currentPuzzle.clues.length} clues)
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 ml-0.5" />
            </button>
          </div>

          {/* Essential Actions: Quick Shuffle, Hint, Check, and Salon Menu (☰) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Quick Random Shuffle Button */}
            <button
              type="button"
              onClick={() => generateNewPuzzle({ genre: currentGenre, targetWords: 10 })}
              disabled={isLoadingPuzzle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kissa-card hover:bg-kissa-panel text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm disabled:opacity-50"
              title="Generate a fresh random crossword on the fly"
              aria-label="Shuffle: new random crossword"
            >
              <Shuffle className={`w-3.5 h-3.5 text-amber-400 ${isLoadingPuzzle ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Shuffle</span>
            </button>

            {/* Hint Button */}
            <button
              type="button"
              onClick={() => setOpenDialog('hint')}
              disabled={!currentPuzzle || currentPuzzle.clues.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kissa-card hover:bg-kissa-panel text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm disabled:opacity-40"
              title="Get a hint ([Space] Letter, [Tab] Word, [Shift+Tab] Reveal All)"
              aria-label="Hint"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span className="hidden sm:inline">Hint</span>
            </button>

            {/* Check Button */}
            <button
              type="button"
              onClick={validateGrid}
              disabled={!currentPuzzle || currentPuzzle.clues.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] transition cursor-pointer active:scale-95 disabled:opacity-40"
              title="Check answers"
              aria-label="Check answers"
            >
              <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Check</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setOpenDialog('settings')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-kissa-card hover:bg-kissa-panel text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm"
              title="Open Lounge Settings"
              aria-label="Settings"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {/* Lounge Menu Button */}
            <button
              type="button"
              onClick={() => setOpenDialog('lounge')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer shadow-sm relative ${
                multiplayer.room
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-kissa-card hover:bg-kissa-panel text-slate-200 border-white/10 hover:border-amber-500/40'
              }`}
              title="Open Lounge Menu (Live Generator, Multiplayer, Blacklist, History)"
              aria-label="Menu"
            >
              <Menu className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Menu</span>

              {/* Status indicator dot if multiplayer is active */}
              {multiplayer.room && (
                <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Versus Race Mode Live Leaderboard Bar (if in race mode) */}
      {multiplayer.room?.mode === 'race' && (
        <div className="bg-rose-950/40 border-b border-rose-500/30 px-4 py-2 text-sm" role="status" aria-label="Race leaderboard">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="font-bold text-rose-300 flex items-center gap-1.5">
              <Swords className="w-4 h-4 text-rose-400" aria-hidden="true" />
              <span>VERSUS RACE LEADERBOARD</span>
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {multiplayer.room.players.map(p => (
                <div key={p.id} className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-slate-200 truncate max-w-[8rem]">{p.name}:</span>
                  <div className="w-16 sm:w-24 bg-black/40 rounded-full h-2 overflow-hidden border border-white/10" aria-hidden="true">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${p.progress || 0}%`, backgroundColor: p.color || '#f59e0b' }}
                    />
                  </div>
                  <span className="font-mono font-bold text-white">{p.progress || 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Game Arena */}
      {isLoadingPuzzle && !currentPuzzle ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[450px]">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-4 border-amber-500/20 flex items-center justify-center animate-spin">
              <Disc3 className="w-12 h-12 text-amber-400" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-slate-950 border-2 border-amber-400 animate-pulse" />
            </div>
          </div>
          <h2 className="text-xl font-black text-white mb-2 tracking-tight">Tuning Turntable...</h2>
          <p className="text-xs text-slate-400 max-w-sm text-center leading-relaxed">
            Gathering live Deezer track previews and weaving a dynamic music crossword grid on the fly.
          </p>
        </div>
      ) : puzzleError && !currentPuzzle ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[450px]">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Unable to Load Live Crossword</h2>
          <p className="text-xs text-slate-400 mb-6 max-w-sm text-center">{puzzleError}</p>
          <button
            type="button"
            onClick={() => generateNewPuzzle({ genre: 'all', targetWords: 10 })}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-95 text-slate-950 font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-amber-500/20"
          >
            Try Again
          </button>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto w-full p-4 lg:p-6 flex flex-col xl:flex-row items-center xl:items-start justify-center gap-8">
          {/* Crossword Grid with Vinyl Backdrop */}
          <div className="w-full xl:w-auto flex justify-center">
            <CrosswordGrid
              puzzle={activePuzzle}
              userLetters={userLetters}
              validity={validity}
              selectedCell={selectedCell}
              isCellInActiveWord={isCellInActiveWord}
              onSelectCell={selectCell}
              onInputLetter={handleInputLetter}
              onBackspace={handleBackspace}
              onMoveCursor={moveCursor}
              onApplyHint={applyHint}
              teammateCell={multiplayer.teammateCell}
              isPlaying={isAudioPlaying}
              celebratingCells={celebratingCells}
              enableWordAnimations={enableWordAnimations}
            />
          </div>

          {/* Clue Lists (Across & Down side-by-side) */}
          <div className="w-full xl:flex-1 xl:max-w-2xl bg-kissa-surface/85 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-200/80 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Clues</span>
              </span>
              <span className="text-xs font-mono font-bold text-slate-400">
                {activePuzzle.clues.length} Words
              </span>
            </div>

            <ClueList
              clues={activePuzzle.clues}
              activeClue={activeClue}
              onSelectClue={selectClue}
            />
          </div>
        </main>
      )}

      {/* Persistent Bottom Audio Player */}
      <AudioPlayerBar
        activeClue={activeClue}
        onPrevClue={prevClue}
        onNextClue={nextClue}
        onPlaybackChange={setIsAudioPlaying}
        volume={defaultVolume}
        onVolumeChange={handleChangeDefaultVolume}
        isCompleted={isCompleted || showEndScreen}
        playTrigger={audioPlayTrigger}
      />

      {/* On-The-Fly Live Generator Modal */}
      <LiveGeneratorModal
        isOpen={openDialog === 'generator'}
        onClose={closeDialog}
        onPuzzleGenerated={(livePuzzle, config) => {
          loadPuzzle(livePuzzle);
          adoptConfig(config);
        }}
      />

      {/* Blacklist Management Modal */}
      <BlacklistModal
        isOpen={openDialog === 'blacklist'}
        onClose={closeDialog}
        blacklist={blacklist}
        onAddArtist={addArtist}
        onAddSong={addSong}
        onRemoveItem={removeItem}
      />

      {/* Multiplayer Lobby Modal */}
      <MultiplayerModal
        isOpen={openDialog === 'multiplayer'}
        onClose={closeDialog}
        currentRoom={multiplayer.room}
        playerId={playerId}
        onCreateRoom={multiplayer.createRoom}
        onJoinRoom={multiplayer.joinRoom}
        onStartGame={() => multiplayer.startGame(activePuzzle)}
        currentPuzzle={currentPuzzle || undefined}
      />

      {/* Hint Modal */}
      <HintModal
        isOpen={openDialog === 'hint'}
        onClose={closeDialog}
        activeClue={activeClue}
        onApplyHint={applyHint}
      />

      {/* Victory / Song Showcase Modal */}
      {currentPuzzle && (
        <EndScreenModal
          isOpen={showEndScreen}
          onClose={() => setShowEndScreen(false)}
          puzzle={currentPuzzle}
          onNextPuzzle={handleNextPuzzle}
          onRestartPuzzle={handleRestartPuzzle}
          onBlacklistArtist={addArtist}
          onBlacklistSong={addSong}
          isLoading={isLoadingPuzzle}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={openDialog === 'settings'}
        onClose={closeDialog}
        enableWordAnimations={enableWordAnimations}
        onToggleWordAnimations={handleToggleWordAnimations}
        defaultVolume={defaultVolume}
        onChangeDefaultVolume={handleChangeDefaultVolume}
      />

      {/* Solved puzzles from /api/history */}
      <HistoryModal isOpen={openDialog === 'history'} onClose={closeDialog} />

      {/* Unified Lounge Slide-Over Menu */}
      <LoungeDrawer
        isOpen={openDialog === 'lounge'}
        onClose={closeDialog}
        onOpenLiveGenerator={() => setOpenDialog('generator')}
        onInstantRandomPuzzle={() => {
          closeDialog();
          generateNewPuzzle({ genre: currentGenre, targetWords: 10 });
        }}
        onOpenMultiplayer={() => setOpenDialog('multiplayer')}
        onOpenBlacklist={() => setOpenDialog('blacklist')}
        onOpenSolvedHistory={() => setShowEndScreen(true)}
        onOpenHistory={() => setOpenDialog('history')}
        onOpenSettings={() => setOpenDialog('settings')}
        blacklistCount={blacklist.length}
        multiplayerCode={multiplayer.room?.code}
        activePuzzleTitle={currentPuzzle?.title || 'Live Crossword'}
      />

      {/* Multiplayer victory modal */}
      <Modal isOpen={Boolean(multiplayer.winnerName)} onClose={multiplayer.dismissWinner} className="border-amber-500/40 max-w-sm p-8 text-center" closeLabel={null}>
        {({ titleId, descriptionId }) => (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center">
              <Trophy className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 id={titleId} className="text-2xl font-black text-amber-300 mb-2">Room Victory!</h2>
            <p id={descriptionId} className="text-slate-200 text-lg mb-6">{multiplayer.winnerName} solved the puzzle!</p>
            <button
              type="button"
              data-autofocus
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              onClick={multiplayer.dismissWinner}
            >
              Awesome!
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
