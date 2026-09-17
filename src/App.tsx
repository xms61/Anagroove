import { useState, useMemo, useEffect, useCallback } from 'react';
import catalogData from './data/themes_catalog.json';
import { ThemesCatalog, Puzzle, CellValidity } from './types/crossword';
import { useCrosswordGame } from './hooks/useCrosswordGame';
import { CrosswordGrid } from './components/CrosswordGrid';
import { ClueList } from './components/ClueList';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { HintModal } from './components/HintModal';
import { EndScreenModal } from './components/EndScreenModal';
import { PuzzlePickerModal } from './components/PuzzlePickerModal';
import { LiveGeneratorModal } from './components/LiveGeneratorModal';
import { BlacklistModal } from './components/BlacklistModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { LoungeDrawer } from './components/LoungeDrawer';
import { SongItem, generateLiveCrossword } from './utils/liveGenerator';
import { apiClient, getMultiplayerPlayerId } from './services/apiClient';
import { socketService, MultiplayerRoom } from './services/socketService';
import { useBlacklist } from './hooks/useBlacklist';
import { Disc3, Lightbulb, CheckSquare, Menu, ChevronDown, Swords } from 'lucide-react';
import { shuffleArray } from '../shared/shuffle';

const catalog: ThemesCatalog = catalogData as unknown as ThemesCatalog;

export default function App() {
  const playerId = useMemo(() => getMultiplayerPlayerId(), []);
  const [activeThemeId, setActiveThemeId] = useState<string>('mixed');

  const activeTheme = useMemo(() => {
    return catalog.themes.find(t => t.id === activeThemeId) || catalog.themes[0];
  }, [activeThemeId]);

  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle>(activeTheme.puzzles[0]);

  // Modals state
  const [isHintOpen, setIsHintOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLiveGeneratorOpen, setIsLiveGeneratorOpen] = useState(false);
  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false);
  const [isLoungeDrawerOpen, setIsLoungeDrawerOpen] = useState(false);

  // Multiplayer state
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoom | null>(null);
  const [teammateCell, setTeammateCell] = useState<{ row: number; col: number; name: string; color: string } | null>(null);

  // Blacklist state
  const { blacklist, addArtist, addSong, removeItem } = useBlacklist();

  // Playback state for vinyl animation sync
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // All catalog songs for the live generator
  const allCatalogSongs = useMemo(() => {
    const map = new Map<string, SongItem>();
    catalog.themes.forEach(t => {
      t.puzzles.forEach(p => {
        p.clues.forEach(c => {
          if (!map.has(c.song.id)) {
            map.set(c.song.id, {
              ...c.song,
              answer: c.answer,
              clueType: c.clueType,
              clueText: c.clueText,
            });
          }
        });
      });
    });
    return Array.from(map.values());
  }, []);

  const {
    userLetters,
    setUserLetters,
    validity,
    setValidity,
    selectedCell,
    activeClue,
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
  } = useCrosswordGame(currentPuzzle, {
    themeId: activeThemeId,
    multiplayerRoom,
    playerId,
    playerName: localStorage.getItem('spotyspice_player_name') || 'Player',
    playerColor: '#1db954',
  });

  // Restore server progress on initial load (no accounts needed)
  useEffect(() => {
    apiClient.getProgress().then(saved => {
      if (saved && saved.puzzleId) {
        // Find puzzle in catalog
        for (const t of catalog.themes) {
          const found = t.puzzles.find(p => p.id === saved.puzzleId);
          if (found) {
            setActiveThemeId(saved.themeId || t.id);
            setCurrentPuzzle(found);
            if (saved.userLetters && saved.userLetters.length === found.rows) {
              setUserLetters(saved.userLetters);
            }
            if (saved.validity && saved.validity.length === found.rows) {
              setValidity(saved.validity as CellValidity[][]);
            }
            console.log('☁️ Restored progress from server session without account');
            break;
          }
        }
      }
    });
  }, [setUserLetters, setValidity]);

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

    const offGameStarted = (data: any) => {
      if (data.puzzle) {
        setCurrentPuzzle(data.puzzle);
        if (data.sharedGrid && Array.isArray(data.sharedGrid)) {
          setUserLetters(data.sharedGrid);
        } else {
          setUserLetters(Array.from({ length: data.puzzle.rows }, () => Array(data.puzzle.cols).fill('')));
        }
        setValidity(Array.from({ length: data.puzzle.rows }, () => Array(data.puzzle.cols).fill('untested')));
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

  const handleSelectTheme = (themeId: string) => {
    setActiveThemeId(themeId);
    const theme = catalog.themes.find(t => t.id === themeId);
    if (theme && theme.puzzles.length > 0) {
      setCurrentPuzzle(theme.puzzles[0]);
    }
  };

  const handleNextPuzzle = () => {
    const idx = activeTheme.puzzles.findIndex(p => p.id === currentPuzzle.id);
    const nextIdx = (idx + 1) % activeTheme.puzzles.length;
    setCurrentPuzzle(activeTheme.puzzles[nextIdx]);
    setShowEndScreen(false);
  };

  const handleRestartPuzzle = () => {
    setCurrentPuzzle({ ...currentPuzzle });
    setShowEndScreen(false);
  };

  // Helper to generate a brand-new, fresh crossword specifically for multiplayer lobbies
  const createFreshCrosswordForLobby = useCallback((themeId: string = 'mixed'): Puzzle => {
    const theme = catalog.themes.find(t => t.id === themeId) || catalog.themes[0];
    let candidates: SongItem[];

    if (themeId === 'mixed') {
      candidates = allCatalogSongs.filter(s =>
        !blacklist.some(b => s.artist.toLowerCase().includes(b.name.toLowerCase()) || s.title.toLowerCase().includes(b.name.toLowerCase()))
      );
    } else {
      const map = new Map<string, SongItem>();
      theme.puzzles.forEach(p => {
        p.clues.forEach(c => {
          if (!map.has(c.song.id)) {
            const isBl = blacklist.some(b => c.song.artist.toLowerCase().includes(b.name.toLowerCase()) || c.song.title.toLowerCase().includes(b.name.toLowerCase()));
            if (!isBl) {
              map.set(c.song.id, {
                ...c.song,
                answer: c.answer,
                clueType: c.clueType,
                clueText: c.clueText
              });
            }
          }
        });
      });
      candidates = Array.from(map.values());
    }

    const shuffled = shuffleArray(candidates);
    const uniquePuzzleId = `mp-${themeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const generated = generateLiveCrossword(shuffled, `👥 Match: ${theme.name}`, 10);

    if (generated) {
      return {
        ...generated,
        id: uniquePuzzleId,
        title: `👥 Match: ${theme.name}`,
      };
    }

    // Fallback: Pick a random verified puzzle from theme and assign a unique ID so it resets all boards cleanly
    const randomExisting = theme.puzzles[Math.floor(Math.random() * theme.puzzles.length)];
    return {
      ...randomExisting,
      id: uniquePuzzleId,
      title: `👥 Match: ${randomExisting.title}`,
    };
  }, [allCatalogSongs, blacklist]);

  const handleCreateRoom = (playerName: string, mode: 'coop' | 'race', themeId: string = 'mixed') => {
    const newLobbyPuzzle = createFreshCrosswordForLobby(themeId);
    setCurrentPuzzle(newLobbyPuzzle);
    setUserLetters(Array.from({ length: newLobbyPuzzle.rows }, () => Array(newLobbyPuzzle.cols).fill('')));
    setValidity(Array.from({ length: newLobbyPuzzle.rows }, () => Array(newLobbyPuzzle.cols).fill('untested')));
    socketService.createRoom(playerId, playerName, mode, newLobbyPuzzle);
  };

  const handleJoinRoom = (roomCode: string, playerName: string) => {
    socketService.joinRoom(roomCode, playerId, playerName);
  };

  const handleStartRoomGame = () => {
    if (multiplayerRoom) {
      socketService.startGame(multiplayerRoom.code, playerId, multiplayerRoom.puzzle || currentPuzzle);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0d12] text-slate-100 flex flex-col pb-36">
      {/* Top Clean Minimalist Header */}
      <header className="border-b border-white/10 bg-[#12141c]/90 backdrop-blur-md sticky top-0 z-30 px-4 py-2.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Brand & Theme Pill */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.35)] shrink-0">
              <Disc3 className={`w-5 h-5 ${isAudioPlaying ? 'animate-spin-slow' : ''}`} />
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-white flex items-center gap-2">
                <span>SpotySpice</span>
                <span className="text-[9px] font-mono font-bold tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded">
                  HI-FI SALON
                </span>
              </h1>
            </div>

            {/* Quick Theme / Puzzle Selector Button */}
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#171a25] hover:bg-[#1f2333] border border-amber-500/30 hover:border-amber-500/60 text-xs font-semibold text-slate-200 transition cursor-pointer shadow-sm group"
              title="Click to browse all 20 puzzles or switch theme"
            >
              <span>{activeTheme.icon}</span>
              <span className="font-bold text-amber-200 truncate max-w-[130px] sm:max-w-[180px]">
                {currentPuzzle.title}
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                ({currentPuzzle.clues.length} clues)
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 ml-0.5" />
            </button>
          </div>

          {/* Essential Actions: Hint, Check, and Salon Menu (☰) */}
          <div className="flex items-center gap-2">
            {/* Hint Button */}
            <button
              type="button"
              onClick={() => setIsHintOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#171a25] hover:bg-[#202536] text-amber-300 hover:text-amber-200 text-xs font-bold border border-amber-500/30 transition cursor-pointer shadow-sm"
              title="Get a hint (letter, word, or reveal)"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span>Hint</span>
            </button>

            {/* Check Button */}
            <button
              type="button"
              onClick={validateGrid}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] transition cursor-pointer active:scale-95"
              title="Check answers"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Check</span>
            </button>

            {/* Lounge Menu Button (Consolidates themes, live generator, multiplayer, blacklist, history) */}
            <button
              type="button"
              onClick={() => setIsLoungeDrawerOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer shadow-sm relative ${
                multiplayerRoom
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-[#171a25] hover:bg-[#202536] text-slate-200 border-white/10 hover:border-amber-500/40'
              }`}
              title="Open Lounge Menu (Themes, Live Mode, Multiplayer, Blacklist, History)"
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
      <main className="max-w-6xl mx-auto w-full p-4 lg:p-6 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8">
        {/* Crossword Grid with Vinyl Backdrop */}
        <div className="w-full lg:w-auto flex justify-center">
          <CrosswordGrid
            puzzle={currentPuzzle}
            userLetters={userLetters}
            validity={validity}
            selectedCell={selectedCell}
            isCellInActiveWord={isCellInActiveWord}
            onSelectCell={selectCell}
            onInputLetter={handleInputLetter}
            onBackspace={handleBackspace}
            onMoveCursor={moveCursor}
            teammateCell={teammateCell}
            isPlaying={isAudioPlaying}
          />
        </div>

        {/* Clue Lists (Across & Down) */}
        <div className="w-full lg:w-80 shrink-0 bg-[#131722]/85 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-200/80 flex items-center gap-1.5">
              <span>{activeTheme.icon}</span>
              <span>{activeTheme.name}</span>
            </span>
            <span className="text-xs font-mono font-bold text-slate-400">
              {currentPuzzle.clues.length} Words
            </span>
          </div>

          <ClueList
            clues={currentPuzzle.clues}
            activeClue={activeClue}
            onSelectClue={selectClue}
          />
        </div>
      </main>

      {/* Persistent Bottom Audio Player */}
      <AudioPlayerBar
        activeClue={activeClue}
        onPrevClue={prevClue}
        onNextClue={nextClue}
        onPlaybackChange={setIsAudioPlaying}
      />

      {/* 20-Puzzle Browser Modal */}
      <PuzzlePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        activeTheme={activeTheme}
        currentPuzzleId={currentPuzzle.id}
        onSelectPuzzle={p => setCurrentPuzzle(p)}
      />

      {/* On-The-Fly Live Generator Modal with Live Global Charts */}
      <LiveGeneratorModal
        isOpen={isLiveGeneratorOpen}
        onClose={() => setIsLiveGeneratorOpen(false)}
        themes={catalog.themes}
        allSongs={allCatalogSongs}
        blacklist={blacklist}
        onPuzzleGenerated={livePuzzle => {
          setCurrentPuzzle(livePuzzle);
          setActiveThemeId('mixed');
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
        currentPuzzle={currentPuzzle}
        themes={catalog.themes}
      />

      {/* Hint Modal */}
      <HintModal
        isOpen={isHintOpen}
        onClose={() => setIsHintOpen(false)}
        activeClue={activeClue}
        onApplyHint={applyHint}
      />

      {/* Victory / Song Showcase Modal */}
      <EndScreenModal
        isOpen={showEndScreen}
        onClose={() => setShowEndScreen(false)}
        puzzle={currentPuzzle}
        onNextPuzzle={handleNextPuzzle}
        onRestartPuzzle={handleRestartPuzzle}
        onBlacklistArtist={addArtist}
        onBlacklistSong={addSong}
      />

      {/* Unified Lounge Slide-Over Menu */}
      <LoungeDrawer
        isOpen={isLoungeDrawerOpen}
        onClose={() => setIsLoungeDrawerOpen(false)}
        themes={catalog.themes}
        activeThemeId={activeThemeId}
        onSelectTheme={handleSelectTheme}
        onOpenPuzzlePicker={() => setIsPickerOpen(true)}
        onOpenLiveGenerator={() => setIsLiveGeneratorOpen(true)}
        onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
        onOpenBlacklist={() => setIsBlacklistOpen(true)}
        onOpenSolvedHistory={() => setShowEndScreen(true)}
        blacklistCount={blacklist.length}
        multiplayerCode={multiplayerRoom?.code}
        activePuzzleTitle={currentPuzzle.title}
      />
    </div>
  );
}
