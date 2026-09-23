import { useCallback, useEffect, useRef, useState } from 'react';
import { Puzzle } from '../types/crossword';
import { socketService, MultiplayerRoom } from '../services/socketService';
import { dynamicMusicService } from '../services/dynamicMusicService';

export interface TeammateCell {
  row: number;
  col: number;
  name: string;
  color: string;
}

/** What the game does when room events arrive. */
export interface MultiplayerEvents {
  /** Show a room puzzle; `sharedGrid` holds the co-op letters typed so far. */
  onPuzzle: (puzzle: Puzzle, sharedGrid?: string[][]) => void;
  /** Adopt the co-op letters after resuming a seat (keeps local progress otherwise). */
  onSharedGrid: (grid: string[][]) => void;
  /** A teammate typed a letter. */
  onCoopLetter: (row: number, col: number, char: string) => void;
  /** The host started the game. */
  onGameStarted: () => void;
}

/**
 * Multiplayer room state over the WebSocket: the room, the teammate's last cell, the winner, and
 * the create/join/start actions. `events` are read through a ref, so the hook can be called
 * before the game hook that provides them.
 */
export function useMultiplayer(playerId: string, events: MultiplayerEvents) {
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [teammateCell, setTeammateCell] = useState<TeammateCell | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);

  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  useEffect(() => {
    socketService.init();
  }, []);

  useEffect(() => {
    const unsubscribers = [
      socketService.on('room_created', (data) => setRoom(data.room)),

      socketService.on('room_joined', (data) => {
        setRoom(data.room);
        if (data.resumed) {
          if (data.room?.mode === 'coop' && Array.isArray(data.room.sharedGrid)) eventsRef.current.onSharedGrid(data.room.sharedGrid);
          return;
        }
        if (data.room?.puzzle) eventsRef.current.onPuzzle(data.room.puzzle, data.room.sharedGrid);
      }),

      socketService.on('player_joined', (data) => {
        setRoom(prev => (prev ? { ...prev, players: data.players } : null));
      }),

      socketService.on('player_left', (data) => {
        setRoom(prev => (prev ? { ...prev, players: data.players, hostId: data.newHostId || prev.hostId } : null));
      }),

      socketService.on('game_started', (data: { puzzle?: Puzzle; sharedGrid?: string[][]; room?: MultiplayerRoom }) => {
        if (data.puzzle) eventsRef.current.onPuzzle(data.puzzle, data.sharedGrid);
        setRoom(prev => data.room ?? (prev ? { ...prev, isStarted: true, puzzle: data.puzzle || prev.puzzle } : null));
        eventsRef.current.onGameStarted();
      }),

      socketService.on('coop_cell_update', (data) => {
        if (data.row !== undefined && data.col !== undefined && data.char !== undefined) {
          eventsRef.current.onCoopLetter(data.row, data.col, data.char);
        }
        setTeammateCell({ row: data.row, col: data.col, name: data.playerName, color: data.playerColor });
        setTimeout(() => setTeammateCell(null), 1500);
      }),

      socketService.on('race_progress_update', (data) => {
        setRoom(prev => (prev
          ? { ...prev, players: prev.players.map(p => (p.id === data.playerId ? { ...p, progress: data.progress } : p)) }
          : null));
      }),

      socketService.on('puzzle_solved', (data) => setWinnerName(data.winnerName || 'A player')),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, []);

  /** Generates a live puzzle for the theme, shows it, and opens a room for it. */
  const createRoom = useCallback(async (playerName: string, mode: 'coop' | 'race', themeId = 'all') => {
    try {
      const { puzzle, livePuzzleToken } = await dynamicMusicService.generateLivePuzzle(themeId);
      eventsRef.current.onPuzzle(puzzle);
      socketService.createRoom(playerId, playerName, mode, livePuzzleToken);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to generate a live multiplayer puzzle.');
    }
  }, [playerId]);

  const joinRoom = useCallback((roomCode: string, playerName: string) => {
    socketService.joinRoom(roomCode, playerId, playerName);
  }, [playerId]);

  /** Host only: starts the room's puzzle (or `fallbackPuzzle` when the room has none yet). */
  const startGame = useCallback((fallbackPuzzle: Puzzle) => {
    if (room) socketService.startGame(room.code, playerId, room.puzzle || fallbackPuzzle);
  }, [room, playerId]);

  return {
    room,
    teammateCell,
    winnerName,
    dismissWinner: () => setWinnerName(null),
    createRoom,
    joinRoom,
    startGame,
  };
}
