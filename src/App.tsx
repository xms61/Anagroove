import { useState, useMemo, useEffect, useCallback } from 'react';
import { Puzzle, CellValidity } from './types/crossword';
import { useCrosswordGame } from './hooks/useCrosswordGame';
import { CrosswordGrid } from './components/CrosswordGrid';
import { ClueList } from './components/ClueList';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { HintModal } from './components/HintModal';
import { EndScreenModal } from './components/EndScreenModal';
import { LiveGeneratorModal } from './components/LiveGeneratorModal';
import { BlacklistModal } from './components/BlacklistModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { LoungeDrawer } from './components/LoungeDrawer';
import { apiClient, getMultiplayerPlayerId } from './services/apiClient';
import { socketService, MultiplayerRoom } from './services/socketService';
import { useBlacklist } from './hooks/useBlacklist';
import { dynamicMusicService } from './services/dynamicMusicService';
import { SettingsModal } from './components/SettingsModal';
import { Disc3, Lightbulb, CheckSquare, Menu, ChevronDown, Swords, Sparkles, Shuffle, AlertCircle, Settings } from 'lucide-react';

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
  const [currentGenre, setCurrentGenre] = useState<string>(() => {
    return localStorage.getItem('spotyspice_active_genre') || 'all';
  });

  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(() => {
    try {
      const saved = localStorage.getItem('spotyspice_active_live_puzzle');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  const [isLoadingPuzzle, setIsLoadingPuzzle] = useState(false);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);

  // Modals state
  const [isHintOpen, setIsHintOpen] = useState(false);
  const [isLiveGeneratorOpen, setIsLiveGeneratorOpen] = useState(false);
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false);
  const [isLoungeDrawerOpen, setIsLoungeDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings state with localStorage persistence
  const [enableWordAnimations, setEnableWordAnimations] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('spotyspice_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.enableWordAnimations === 'boolean') return parsed.enableWordAnimations;
      }
    } catch {
      // ignore parse errors
    }
    return true;
  });
  const [defaultVolume, setDefaultVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('spotyspice_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.defaultVolume === 'number') return parsed.defaultVolume;
      }
    } catch {
      // ignore parse errors
    }
    return 0.15;
  });

  const handleToggleWordAnimations = (enabled: boolean) => {
    setEnableWordAnimations(enabled);
    try {
      const current = JSON.parse(localStorage.getItem('spotyspice_settings') || '{}');
      localStorage.setItem('spotyspice_settings', JSON.stringify({ ...current, enableWordAnimations: enabled }));
    } catch {
      // ignore storage errors
    }
  };

  const handleChangeDefaultVolume = (vol: number) => {
    setDefaultVolume(vol);
    try {
      const current = JSON.parse(localStorage.getItem('spotyspice_settings') || '{}');
      localStorage.setItem('spotyspice_settings', JSON.stringify({ ...current, defaultVolume: vol }));
    } catch {
      // ignore storage errors
    }
  };

  // Multiplayer state
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoom | null>(null);
  const [teammateCell, setTeammateCell] = useState<{ row: number; col: number; name: string; color: string } | null>(null);

  // Blacklist state
  const { blacklist, addArtist, addSong, removeItem } = useBlacklist();

  // Playback state for vinyl animation sync
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const activePuzzle = currentPuzzle || EMPTY_PUZZLE;

  const {
    userLetters,
    setUserLetters,
    validity,
    setValidity,
    selectedCell,
    activeClue,
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
    multiplayerRoom,
    playerId,
    playerName: localStorage.getItem('spotyspice_player_name') || 'Player',
    playerColor: '#1db954',
  });

  const generateNewPuzzle = useCallback(async (genre = currentGenre, targetWords = 10) => {
    setIsLoadingPuzzle(true);
    setPuzzleError(null);
    try {
      const { puzzle } = await dynamicMusicService.generateLivePuzzle(genre, targetWords);
      setCurrentPuzzle(puzzle);
      setCurrentGenre(genre);
      localStorage.setItem('spotyspice_active_live_puzzle', JSON.stringify(puzzle));
      localStorage.setItem('spotyspice_active_genre', genre);
      setUserLetters(Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('')));
      setValidity(Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('untested')));
      setShowEndScreen(false);
      setIsCompleted(false);
    } catch (err: unknown) {
      console.error('Failed to generate live puzzle:', err);
      setPuzzleError(err instanceof Error ? err.message : 'Could not generate live crossword.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }, [currentGenre, setUserLetters, setValidity, setShowEndScreen, setIsCompleted]);

  // Initial load: generate random puzzle if none stored in localStorage
  useEffect(() => {
    if (!currentPuzzle) {
      generateNewPuzzle(currentGenre, 10);
    }
  }, [currentPuzzle, currentGenre, generateNewPuzzle]);

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

  // Initialize socket connection on mount
  useEffect(() => {
    socketService.init();
  }, []);

  // Listen to WebSocket events for Multiplayer Lobby
  useEffect(() => {
    const offCreated = socketService.on('room_created', (data) => {
      setMultiplayerRoom(data.room);
    });

    const offJoined = socketService.on('room_joined', (data) => {
      setMultiplayerRoom(data.room);
      if (data.room?.puzzle) {
        setCurrentPuzzle(data.room.puzzle);
        localStorage.setItem('spotyspice_active_live_puzzle', JSON.stringify(data.room.puzzle));
        if (data.room.sharedGrid && Array.isArray(data.room.sharedGrid)) {
          setUserLetters(data.room.sharedGrid);
        } else {
          setUserLetters(Array.from({ length: data.room.puzzle.rows }, () => Array(data.room.puzzle.cols).fill('')));
        }
        setValidity(Array.from({ length: data.room.puzzle.rows }, () => Array(data.room.puzzle.cols).fill('untested')));
      }
    });

    const offPlayerJoined = socketService.on('player_joined', (data) => {
      setMultiplayerRoom(prev => prev ? { ...prev, players: data.players } : null);
    });

    const offPlayerLeft = socketService.on('player_left', (data) => {
      setMultiplayerRoom(prev => prev ? { ...prev, players: data.players, hostId: data.newHostId || prev.hostId } : null);
    });

    const offGameStarted = (data: { puzzle?: Puzzle; sharedGrid?: string[][]; room?: MultiplayerRoom }) => {
      const puzzle = data.puzzle;
      if (puzzle) {
        setCurrentPuzzle(puzzle);
        localStorage.setItem('spotyspice_active_live_puzzle', JSON.stringify(puzzle));
        if (data.sharedGrid && Array.isArray(data.sharedGrid)) {
          setUserLetters(data.sharedGrid);
        } else {
          setUserLetters(Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('')));
        }
        setValidity(Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('untested')));
      }
      if (data.room) {
        setMultiplayerRoom(data.room);
      } else {
        setMultiplayerRoom(prev => prev ? { ...prev, isStarted: true, puzzle: data.puzzle || prev.puzzle } : null);
      }
      setIsMultiplayerOpen(false);
    };

    const unsubGameStarted = socketService.on('game_started', offGameStarted);

    const offCoopUpdate = socketService.on('coop_cell_update', (data) => {
      if (data.row !== undefined && data.col !== undefined && data.char !== undefined) {
        setUserLetters(prev => {
          if (!prev || data.row >= prev.length || data.col >= prev[0].length) return prev;
          const next = prev.map(r => [...r]);
          next[data.row][data.col] = data.char;
          return next;
        });
      }
      setTeammateCell({
        row: data.row,
        col: data.col,
        name: data.playerName,
        color: data.playerColor,
      });
      setTimeout(() => setTeammateCell(null), 1500);
    });

    const offRaceProgress = socketService.on('race_progress_update', (data) => {
      setMultiplayerRoom(prev => {
        if (!prev) return null;
        const updated = prev.players.map(p =>
          p.id === data.playerId ? { ...p, progress: data.progress } : p
        );
        return { ...prev, players: updated };
      });
    });

    const offPuzzleSolved = socketService.on('puzzle_solved', (data) => {
      alert(`🏆 Room Victory! ${data.winnerName} solved the puzzle!`);
    });

    return () => {
      offCreated();
      offJoined();
      offPlayerJoined();
      offPlayerLeft();
      unsubGameStarted();
      offCoopUpdate();
      offRaceProgress();
      offPuzzleSolved();
    };
  }, [setUserLetters, setValidity]);

  const handleNextPuzzle = () => {
    generateNewPuzzle(currentGenre, 10);
  };

  const handleRestartPuzzle = () => {
    if (currentPuzzle) {
      setUserLetters(Array.from({ length: currentPuzzle.rows }, () => Array(currentPuzzle.cols).fill('')));
      setValidity(Array.from({ length: currentPuzzle.rows }, () => Array(currentPuzzle.cols).fill('untested')));
    }
    setShowEndScreen(false);
    setIsCompleted(false);
  };

  const handleCreateRoom = useCallback(async (playerName: string, mode: 'coop' | 'race', themeId = 'all') => {
    try {
      const { puzzle: newLobbyPuzzle, livePuzzleToken } = await dynamicMusicService.generateLivePuzzle(themeId === 'mixed' ? 'all' : themeId);
      setCurrentPuzzle(newLobbyPuzzle);
      localStorage.setItem('spotyspice_active_live_puzzle', JSON.stringify(newLobbyPuzzle));
      setUserLetters(Array.from({ length: newLobbyPuzzle.rows }, () => Array(newLobbyPuzzle.cols).fill('')));
      setValidity(Array.from({ length: newLobbyPuzzle.rows }, () => Array(newLobbyPuzzle.cols).fill('untested')));
      socketService.createRoom(playerId, playerName, mode, livePuzzleToken);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to generate a live multiplayer puzzle.');
    }
  }, [playerId, setUserLetters, setValidity]);

  const handleJoinRoom = (roomCode: string, playerName: string) => {
    socketService.joinRoom(roomCode, playerId, playerName);
  };

  const handleStartRoomGame = () => {
    if (multiplayerRoom) {
      socketService.startGame(multiplayerRoom.code, playerId, multiplayerRoom.puzzle || activePuzzle);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0d12] text-slate-100 flex flex-col pb-36">
      {/* Top Clean Minimalist Header */}
      <header className="border-b border-white/10 bg-[#12141c]/90 backdrop-blur-md sticky top-0 z-30 px-4 py-2.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Brand & Live Style Selector */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.35)] shrink-0">
              <Disc3 className={`w-5 h-5 ${isAudioPlaying ? 'animate-spin-slow' : ''}`} />
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-white flex items-center gap-2">
                <span>SpotySpice</span>
              </h1>
            </div>

            {/* Live Style Badge & Generator Trigger */}
            <button
              type="button"
              onClick={() => setIsLiveGeneratorOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#171a25] hover:bg-[#1f2333] border border-amber-500/30 hover:border-amber-500/60 text-xs font-semibold text-slate-200 transition cursor-pointer shadow-sm group"
              title="Click to generate a custom live crossword or change musical style"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-amber-200 truncate max-w-[130px] sm:max-w-[200px]">
                {currentPuzzle?.title || 'Live Crossword'}
              </span>
              {currentPuzzle && (
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  ({currentPuzzle.clues.length} clues)
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 ml-0.5" />
            </button>
          </div>

          {/* Essential Actions: Quick Shuffle, Hint, Check, and Salon Menu (☰) */}
          <div className="flex items-center gap-2">
            {/* Quick Random Shuffle Button */}
            <button
              type="button"
              onClick={() => generateNewPuzzle(currentGenre, 10)}
              disabled={isLoadingPuzzle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#171a25] hover:bg-[#202536] text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm disabled:opacity-50"
              title="Generate a fresh random crossword on the fly"
            >
              <Shuffle className={`w-3.5 h-3.5 text-amber-400 ${isLoadingPuzzle ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Shuffle</span>
            </button>

            {/* Hint Button */}
            <button
              type="button"
              onClick={() => setIsHintOpen(true)}
              disabled={!currentPuzzle || currentPuzzle.clues.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#171a25] hover:bg-[#202536] text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm disabled:opacity-40"
              title="Get a hint ([Space] Letter, [Tab] Word, [Shift+Tab] Reveal All)"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span>Hint</span>
            </button>

            {/* Check Button */}
            <button
              type="button"
              onClick={validateGrid}
              disabled={!currentPuzzle || currentPuzzle.clues.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] transition cursor-pointer active:scale-95 disabled:opacity-40"
              title="Check answers"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Check</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#171a25] hover:bg-[#202536] text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm"
              title="Open Lounge Settings"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {/* Lounge Menu Button */}
            <button
              type="button"
              onClick={() => setIsLoungeDrawerOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer shadow-sm relative ${
                multiplayerRoom
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-[#171a25] hover:bg-[#202536] text-slate-200 border-white/10 hover:border-amber-500/40'
              }`}
              title="Open Lounge Menu (Live Generator, Multiplayer, Blacklist, History)"
            >
              <Menu className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Menu</span>

              {/* Status indicator dot if multiplayer is active */}
              {multiplayerRoom && (
                <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Versus Race Mode Live Leaderboard Bar (if in race mode) */}
      {multiplayerRoom?.mode === 'race' && (
        <div className="bg-[#191024]/90 border-b border-rose-500/30 px-4 py-2 text-xs">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <span className="font-bold text-rose-300 flex items-center gap-1.5">
              <Swords className="w-4 h-4 text-rose-400" />
              <span>VERSUS RACE LEADERBOARD</span>
            </span>
            <div className="flex items-center gap-4">
              {multiplayerRoom.players.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="font-medium text-slate-300">{p.name}:</span>
                  <div className="w-24 bg-black/40 rounded-full h-2 overflow-hidden border border-white/10">
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
            onClick={() => generateNewPuzzle('all', 10)}
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
              teammateCell={teammateCell}
              isPlaying={isAudioPlaying}
              celebratingCells={celebratingCells}
              enableWordAnimations={enableWordAnimations}
            />
          </div>

          {/* Clue Lists (Across & Down side-by-side) */}
          <div className="w-full xl:flex-1 xl:max-w-2xl bg-[#131722]/85 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md">
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
      />

      {/* On-The-Fly Live Generator Modal */}
      <LiveGeneratorModal
        isOpen={isLiveGeneratorOpen}
        onClose={() => setIsLiveGeneratorOpen(false)}
        onPuzzleGenerated={livePuzzle => {
          setCurrentPuzzle(livePuzzle);
          localStorage.setItem('spotyspice_active_live_puzzle', JSON.stringify(livePuzzle));
          setUserLetters(Array.from({ length: livePuzzle.rows }, () => Array(livePuzzle.cols).fill('')));
          setValidity(Array.from({ length: livePuzzle.rows }, () => Array(livePuzzle.cols).fill('untested')));
          setShowEndScreen(false);
          setIsCompleted(false);
        }}
      />

      {/* Blacklist Management Modal */}
      <BlacklistModal
        isOpen={isBlacklistOpen}
        onClose={() => setIsBlacklistOpen(false)}
        blacklist={blacklist}
        onAddArtist={addArtist}
        onAddSong={addSong}
        onRemoveItem={removeItem}
      />

      {/* Multiplayer Lobby Modal */}
      <MultiplayerModal
        isOpen={isMultiplayerOpen}
        onClose={() => setIsMultiplayerOpen(false)}
        currentRoom={multiplayerRoom}
        playerId={playerId}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onStartGame={handleStartRoomGame}
        currentPuzzle={currentPuzzle || undefined}
      />

      {/* Hint Modal */}
      <HintModal
        isOpen={isHintOpen}
        onClose={() => setIsHintOpen(false)}
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
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        enableWordAnimations={enableWordAnimations}
        onToggleWordAnimations={handleToggleWordAnimations}
        defaultVolume={defaultVolume}
        onChangeDefaultVolume={handleChangeDefaultVolume}
      />

      {/* Unified Lounge Slide-Over Menu */}
      <LoungeDrawer
        isOpen={isLoungeDrawerOpen}
        onClose={() => setIsLoungeDrawerOpen(false)}
        onOpenLiveGenerator={() => setIsLiveGeneratorOpen(true)}
        onInstantRandomPuzzle={() => {
          setIsLoungeDrawerOpen(false);
          generateNewPuzzle(currentGenre, 10);
        }}
        onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
        onOpenBlacklist={() => setIsBlacklistOpen(true)}
        onOpenSolvedHistory={() => setShowEndScreen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        blacklistCount={blacklist.length}
        multiplayerCode={multiplayerRoom?.code}
        activePuzzleTitle={currentPuzzle?.title || 'Live Crossword'}
      />
    </div>
  );
}
