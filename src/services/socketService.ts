import { Puzzle } from '../../shared/types';

export interface RoomPlayer {
  id: string;
  name: string;
  color: string;
  progress: number;
}

export interface MultiplayerRoom {
  code: string;
  hostId: string;
  mode: 'coop' | 'race';
  puzzle: Puzzle | null;
  sharedGrid: string[][] | null;
  isStarted: boolean;
  players: RoomPlayer[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketEventCallback = (payload: any) => void;

/** Seat held in a room; used to resume it automatically after a dropped connection. */
interface RoomSession {
  roomCode: string;
  playerId: string;
  playerName: string;
  resumeToken: string;
}

class SocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<SocketEventCallback>> = new Map();
  private isConnecting = false;
  private reconnectDelay = 1500;
  private maxReconnectDelay = 60000;
  private session: RoomSession | null = null;
  private pendingPlayerId = '';
  private pendingName = '';

  private connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    if (this.isConnecting && this.ws) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve(this.ws);
          }
        }, 50);
        const timeout = setTimeout(() => {
          clearInterval(check);
          reject(new Error('WebSocket connection timeout'));
        }, 10000);
      });
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // When using Vite proxy, ws connects to /ws on window.location.host
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        this.isConnecting = false;
        this.ws = socket;
        this.reconnectDelay = 1500;
        console.log('👥 Connected to Anagroove Multiplayer WebSocket');
        // Reclaim our seat after a reconnect (the server holds it for a short grace period)
        if (this.session) {
          const { roomCode, playerId, playerName, resumeToken } = this.session;
          socket.send(JSON.stringify({ action: 'join_room', roomCode, playerId, playerName, resumeToken }));
        }
        resolve(socket);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.trackSession(data);
          const callbacks = this.listeners.get(data.type);
          if (callbacks) {
            callbacks.forEach(cb => cb(data));
          }
        } catch (e) {
          console.error('Error handling socket message:', e);
        }
      };

      socket.onerror = (err) => {
        this.isConnecting = false;
        console.warn('WebSocket error, falling back:', err);
        reject(err);
      };

      socket.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        console.log(`Multiplayer WebSocket closed, reconnecting in ${delay}ms...`);
        setTimeout(() => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connect().catch(() => {});
          }
        }, delay);
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trackSession(data: any) {
    if (data?.type === 'error' && typeof data.message === 'string' && data.message.startsWith('Room not found')) {
      this.session = null;
      return;
    }
    if ((data?.type === 'room_created' || data?.type === 'room_joined') && data.room?.code && typeof data.resumeToken === 'string') {
      const current = this.session;
      const playerId = current && current.roomCode === data.room.code ? current.playerId : this.pendingPlayerId;
      if (playerId) {
        this.session = {
          roomCode: data.room.code,
          playerId,
          playerName: this.pendingName || this.session?.playerName || '',
          resumeToken: data.resumeToken,
        };
      }
    }
  }

  public leaveRoomSession() {
    this.session = null;
  }

  public init() {
    return this.connect().catch(() => {});
  }

  public on(type: string, cb: SocketEventCallback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async send(action: string, payload: Record<string, any> = {}) {
    try {
      const socket = await this.connect();
      socket.send(JSON.stringify({ action, ...payload }));
    } catch (e) {
      console.warn('Failed to send socket action:', action, e);
    }
  }

  public createRoom(playerId: string, playerName: string, mode: 'coop' | 'race', livePuzzleToken: string) {
    this.pendingPlayerId = playerId;
    this.pendingName = playerName;
    return this.send('create_room', { playerId, playerName, mode, livePuzzleToken });
  }

  public joinRoom(roomCode: string, playerId: string, playerName: string) {
    this.pendingPlayerId = playerId;
    this.pendingName = playerName;
    const resumeToken = this.session?.roomCode === roomCode.toUpperCase().trim() && this.session.playerId === playerId
      ? this.session.resumeToken
      : undefined;
    return this.send('join_room', { roomCode, playerId, playerName, ...(resumeToken ? { resumeToken } : {}) });
  }

  public startGame(roomCode: string, playerId: string, puzzle?: Puzzle) {
    return this.send('start_game', { roomCode, playerId, puzzle });
  }

  public sendCoopCellUpdate(
    roomCode: string,
    row: number,
    col: number,
    char: string,
    playerId: string,
    playerName: string,
    playerColor: string
  ) {
    return this.send('coop_cell_update', { roomCode, row, col, char, playerId, playerName, playerColor });
  }

  public sendRaceProgress(roomCode: string, progress: number, playerId: string) {
    return this.send('race_progress_update', { roomCode, progress, playerId });
  }

  public sendPuzzleSolved(roomCode: string, playerId: string, playerName: string) {
    return this.send('puzzle_solved', { roomCode, playerId, playerName });
  }
}

export const socketService = new SocketService();
