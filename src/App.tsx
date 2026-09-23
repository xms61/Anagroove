import { useState, useMemo, useEffect, useCallback } from 'react';
import { Puzzle, CellValidity } from '../shared/types';
import { useCrosswordGame } from './hooks/useCrosswordGame';
import { CrosswordGrid } from './components/CrosswordGrid';
import { ClueList } from './components/ClueList';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { HintModal } from './components/HintModal';
import { EndScreenModal } from './components/EndScreenModal';
import { LiveGeneratorModal, PuzzleGenerationConfig } from './components/LiveGeneratorModal';
import { BlacklistModal } from './components/BlacklistModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { MenuDrawer } from './components/MenuDrawer';
import { apiClient, getMultiplayerPlayerId } from './services/apiClient';
import { useBlacklist } from './hooks/useBlacklist';
import { useMultiplayer } from './hooks/useMultiplayer';
import { dynamicMusicService } from './services/dynamicMusicService';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { Modal } from './components/Modal';
import { useSettings } from './hooks/useSettings';
import { applyTheme } from './themes';
import { ThemeBackdrop } from './components/ThemeBackdrop';
import { readJson, readString, STORAGE_KEYS, writeJson, writeString } from './services/storage';
import { themeById } from '../shared/themes';
import { AlertCircle, Disc3, Swords, Trophy } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { Button, Panel } from './components/ui';

/** A saved theme id that no longer exists (e.g. the removed "latin") falls back to Mixed. */
const knownThemeOr = (id: string) => (themeById(id) ? id : 'all');

type Dialog = 'hint' | 'generator' | 'blacklist' | 'multiplayer' | 'menu' | 'settings' | 'history';

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
  useEffect(() => applyTheme(settings.theme), [settings.theme]);

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

  // Hidden artists and songs
  const { blacklist, addArtist, addSong, removeItem } = useBlacklist();

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
    <div className="min-h-screen text-fg flex flex-col pb-28 sm:pb-32">
      <ThemeBackdrop />
      <AppHeader
        puzzleTitle={currentPuzzle?.title || 'Live crossword'}
        clueCount={currentPuzzle?.clues.length ?? 0}
        isLoading={isLoadingPuzzle}
        inRoom={Boolean(multiplayer.room)}
        onOpenGenerator={() => setOpenDialog('generator')}
        onNewPuzzle={() => generateNewPuzzle({ genre: currentGenre, targetWords: 10 })}
        onHint={() => setOpenDialog('hint')}
        onCheck={validateGrid}
        onOpenSettings={() => setOpenDialog('settings')}
        onOpenMenu={() => setOpenDialog('menu')}
      />

      {multiplayer.room?.mode === 'race' && (
        <div className="bg-panel/90 border-b border-line px-4 py-2.5 text-sm" role="status" aria-label="Race leaderboard">
          <div className="max-w-7xl mx-auto lg:px-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-display text-lg leading-none flex items-center gap-2">
              <Swords className="w-4 h-4 text-accent" aria-hidden="true" />
              Race
            </span>
            {multiplayer.room.players.map(p => (
              <div key={p.id} className="flex items-center gap-2 min-w-0">
                <span className="font-semibold truncate max-w-[8rem]">{p.name}</span>
                <div className="w-20 sm:w-28 h-2 bg-raised rounded-full overflow-hidden" aria-hidden="true">
                  <div className="h-full transition-all duration-300" style={{ width: `${p.progress || 0}%`, backgroundColor: p.color || 'rgb(var(--c-accent))' }} />
                </div>
                <span className="font-mono text-xs text-muted">{p.progress || 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoadingPuzzle && !currentPuzzle ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 min-h-[450px] text-center" role="status">
          <Disc3 className="w-14 h-14 text-accent animate-spin" aria-hidden="true" />
          <h2 className="font-display text-2xl">Picking songs…</h2>
          <p className="text-sm text-muted max-w-sm">Choosing tracks and building the grid.</p>
        </div>
      ) : puzzleError && !currentPuzzle ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 min-h-[450px] text-center" role="alert">
          <AlertCircle className="w-10 h-10 text-bad" aria-hidden="true" />
          <h2 className="font-display text-2xl">Couldn't build a puzzle</h2>
          <p className="text-sm text-muted max-w-sm">{puzzleError}</p>
          <Button variant="primary" onClick={() => generateNewPuzzle({ genre: 'all', targetWords: 10 })} className="mt-3">Try again</Button>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto w-full px-4 lg:px-8 pt-5 sm:pt-8 flex flex-col xl:flex-row items-stretch xl:items-start gap-5 xl:gap-8">
          <div className="xl:w-auto flex justify-center">
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
              celebratingCells={celebratingCells}
              enableWordAnimations={enableWordAnimations}
            />
          </div>

          <Panel aria-label="Clues" className="flex-1 min-w-0 p-3 sm:p-5">
            <ClueList clues={activePuzzle.clues} activeClue={activeClue} onSelectClue={selectClue} />
          </Panel>
        </main>
      )}

      {/* Persistent Bottom Audio Player */}
      <AudioPlayerBar
        activeClue={activeClue}
        onPrevClue={prevClue}
        onNextClue={nextClue}
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

      {/* Hidden artists and songs */}
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
        theme={settings.theme}
        onChangeTheme={theme => updateSettings({ theme })}
      />

      {/* Solved puzzles from /api/history */}
      <HistoryModal isOpen={openDialog === 'history'} onClose={closeDialog} />

      <MenuDrawer
        isOpen={openDialog === 'menu'}
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

      {/* Multiplayer victory */}
      <Modal isOpen={Boolean(multiplayer.winnerName)} onClose={multiplayer.dismissWinner} className="max-w-sm p-8 text-center" closeLabel={null}>
        {({ titleId, descriptionId }) => (
          <>
            <Trophy className="w-12 h-12 mx-auto mb-4 text-accent" aria-hidden="true" />
            <h2 id={titleId} className="font-display text-3xl leading-tight">Room solved</h2>
            <p id={descriptionId} className="mt-2 mb-6 text-muted">{multiplayer.winnerName} finished the puzzle.</p>
            <Button variant="primary" data-autofocus onClick={multiplayer.dismissWinner}>Nice</Button>
          </>
        )}
      </Modal>
    </div>
  );
}
