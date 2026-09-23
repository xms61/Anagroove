import React, { useState } from 'react';
import { MultiplayerRoom } from '../services/socketService';
import { Puzzle } from '../types/crossword';
import { Users, Copy, Check, Play, Crown, Zap, Swords, HeartHandshake, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { THEMES } from '../../shared/themes';
import { readString, STORAGE_KEYS, writeString } from '../services/storage';


interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoom: MultiplayerRoom | null;
  playerId: string;
  onCreateRoom: (playerName: string, mode: 'coop' | 'race', themeId: string) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onStartGame: () => void;
  currentPuzzle?: Puzzle;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  isOpen,
  onClose,
  currentRoom,
  playerId,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [playerName, setPlayerName] = useState(() => {
    return readString(STORAGE_KEYS.playerName) || `DJ_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [joinCode, setJoinCode] = useState('');
  const [selectedMode, setSelectedMode] = useState<'coop' | 'race'>('coop');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    writeString(STORAGE_KEYS.playerName, val);
  };

  const handleCopyLink = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHost = currentRoom?.hostId === playerId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="border-hi/25 max-w-lg p-6 flex flex-col">
      {({ titleId, descriptionId }) => (
      <>
        {/* Modal Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-line/10">
          <div className="w-10 h-10 rounded-xl bg-hi/20 border border-hi/35 text-hi flex items-center justify-center shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-fg flex items-center gap-2">
              Multiplayer Lobby
            </h2>
            <p id={descriptionId} className="text-xs text-muted">
              Solve musical crosswords together in real-time or race head-to-head!
            </p>
          </div>
        </div>

        {/* Room View (if in room) */}
        {currentRoom ? (
          <div className="py-4 flex flex-col gap-4 overflow-y-auto">
            {/* Room Code Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-hi/15 to-hi/15 border border-hi/30 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase font-bold text-hi tracking-wider">Room Code</span>
                <div className="text-2xl font-mono font-extrabold text-fg tracking-widest">{currentRoom.code}</div>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fg/10 hover:bg-fg/20 border border-line/10 text-xs font-semibold transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Puzzle & Mode Notice */}
            <div className="p-3 rounded-xl bg-panel border border-line/10 flex items-center justify-between text-xs">
              <span className="text-fg font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>Puzzle: <strong className="text-accent">{currentRoom.puzzle?.title || 'Brand New Match Crossword'}</strong></span>
              </span>
              <span className="text-xs font-mono text-muted">
                {currentRoom.puzzle?.clues?.length || 10} words
              </span>
            </div>

            {/* Mode & Status Badge */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted flex items-center gap-1.5">
                {currentRoom.mode === 'coop' ? (
                  <>
                    <HeartHandshake className="w-4 h-4 text-ok" />
                    <span>Mode: <strong className="text-fg">Co-op Symphony (Shared Live Grid)</strong></span>
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4 text-bad" />
                    <span>Mode: <strong className="text-fg">Versus Race (Head-to-Head)</strong></span>
                  </>
                )}
              </span>
              <span className="text-muted font-mono text-xs">{currentRoom.players.length} Player{currentRoom.players.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Connected Players List */}
            <div className="p-3 rounded-xl bg-panel border border-line/5 flex flex-col gap-2 max-h-40 overflow-y-auto">
              <span className="text-xs uppercase font-bold text-muted tracking-wider">Connected Players</span>
              {currentRoom.players.map((p, idx) => (
                <div key={p.id || idx} className="flex items-center justify-between p-2 rounded-lg bg-bg/40 border border-line/5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-3.5 h-3.5 rounded-full ring-2 ring-line/20"
                      style={{ backgroundColor: p.color || 'rgb(var(--c-accent))' }}
                    />
                    <span className="text-sm font-semibold text-fg">
                      {p.name} {p.id === playerId ? '(You)' : ''}
                    </span>
                  </div>

                  {currentRoom.hostId === p.id && (
                    <span className="flex items-center gap-1 text-xs font-bold text-accent bg-accent/20 border border-accent/30 px-2 py-0.5 rounded-full">
                      <Crown className="w-3 h-3" />
                      <span>Host</span>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Host Action or Waiting Indicator */}
            {isHost ? (
              <button
                type="button"
                onClick={onStartGame}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-hi to-hi hover:opacity-95 text-on-accent font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Game for All Players</span>
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-fg/5 text-center text-xs text-fg animate-pulse font-mono border border-hi/20">
                Connected! Waiting for host to launch the crossword...
              </div>
            )}
          </div>
        ) : (
          /* Lobby Setup View (Create or Join) */
          <div className="py-4 flex flex-col gap-4 overflow-y-auto">
            {/* Player Name Input */}
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                Your Player Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Enter nickname..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-panel border border-line/10 text-sm text-fg placeholder:text-muted focus:outline-none focus:border-hi"
              />
            </div>

            {/* Create vs Join Tabs */}
            <div className="flex rounded-xl overflow-hidden border border-line/10 bg-panel p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'create' ? 'bg-hi text-on-accent shadow-sm' : 'text-muted hover:text-fg'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Create Room</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('join')}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'join' ? 'bg-hi text-on-accent shadow-sm' : 'text-muted hover:text-fg'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Join with Code</span>
              </button>
            </div>

            {activeTab === 'create' ? (
              <div className="flex flex-col gap-4">
                {/* Mode Select */}
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    1. Select Game Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMode('coop')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        selectedMode === 'coop'
                          ? 'bg-ok/15 border-ok text-fg shadow-inner'
                          : 'bg-panel border-line/5 text-muted hover:bg-raised'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-sm text-ok mb-1">
                        <HeartHandshake className="w-4 h-4" />
                        <span>Co-op Symphony</span>
                      </div>
                      <div className="text-xs text-muted leading-tight">
                        Shared grid, live sync, solve as a team!
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedMode('race')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        selectedMode === 'race'
                          ? 'bg-bad/15 border-bad text-fg shadow-inner'
                          : 'bg-panel border-line/5 text-muted hover:bg-raised'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-sm text-bad mb-1">
                        <Swords className="w-4 h-4" />
                        <span>Versus Race</span>
                      </div>
                      <div className="text-xs text-muted leading-tight">
                        Head-to-head race with live leaderboard!
                      </div>
                    </button>
                  </div>
                </div>

                {/* Theme / Style Select for Brand New Crossword */}
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    2. Crossword Musical Style
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                    {THEMES.map(style => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setSelectedTheme(style.id)}
                        className={`p-2 rounded-xl border text-xs font-semibold text-left transition cursor-pointer truncate ${
                          selectedTheme === style.id
                            ? 'bg-hi/25 border-hi text-hi'
                            : 'bg-panel border-line/5 text-fg hover:bg-raised'
                        }`}
                      >
                        {style.icon} {style.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onCreateRoom(playerName, selectedMode, selectedTheme)}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-hi to-hi hover:opacity-95 text-on-accent font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer mt-2"
                >
                  <Users className="w-4 h-4" />
                  <span>Generate New Match & Create Room</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                    Enter Room Code
                  </label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BEAT-42"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-panel border border-line/10 text-base font-mono font-bold tracking-widest text-center text-fg placeholder:text-muted focus:outline-none focus:border-hi uppercase"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onJoinRoom(joinCode, playerName)}
                  disabled={!joinCode.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-hi to-hi hover:opacity-95 disabled:opacity-40 text-on-accent font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Join Room</span>
                </button>
              </div>
            )}
          </div>
        )}
      </>
      )}
    </Modal>
  );
};
