import React, { useState } from 'react';
import { MultiplayerRoom } from '../services/socketService';
import { Puzzle } from '../types/crossword';
import { Users, X, Copy, Check, Play, Crown, Zap, Swords, HeartHandshake, Sparkles } from 'lucide-react';

export const MULTIPLAYER_STYLES = [
  { id: 'all', name: 'Mixed & Eclectic', icon: '🎲' },
  { id: 'rock', name: 'Rock & Retro', icon: '🎸' },
  { id: 'pop', name: 'Global Pop', icon: '✨' },
  { id: 'kpop', name: 'K-Pop Universe', icon: '🌸' },
  { id: 'hiphop', name: 'Hip-Hop Giants', icon: '🎤' },
  { id: 'edm', name: 'EDM & Dance', icon: '🎧' },
  { id: 'latin', name: 'Latin & Reggaeton', icon: '🔥' },
  { id: 'gaming', name: 'Video Game OSTs', icon: '🎮' },
  { id: 'anime', name: 'Anime & J-Rock', icon: '⚔️' },
  { id: 'cinematic', name: 'Cinematic OSTs', icon: '🎬' },
  { id: 'poppunk', name: 'Pop-Punk & Emo', icon: '🖤' },
];

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
    return localStorage.getItem('spotyspice_player_name') || `DJ_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [joinCode, setJoinCode] = useState('');
  const [selectedMode, setSelectedMode] = useState<'coop' | 'race'>('coop');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    localStorage.setItem('spotyspice_player_name', val);
  };

  const handleCopyLink = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHost = currentRoom?.hostId === playerId;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-cyan-500/25 rounded-2xl max-w-lg w-full p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/35 text-cyan-300 flex items-center justify-center shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Multiplayer Lobby
            </h2>
            <p className="text-xs text-slate-400">
              Solve musical crosswords together in real-time or race head-to-head!
            </p>
          </div>
        </div>

        {/* Room View (if in room) */}
        {currentRoom ? (
          <div className="py-4 flex flex-col gap-4 overflow-y-auto">
            {/* Room Code Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-purple-950/60 border border-cyan-500/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider">Room Code</span>
                <div className="text-2xl font-mono font-extrabold text-white tracking-widest">{currentRoom.code}</div>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Puzzle & Mode Notice */}
            <div className="p-3 rounded-xl bg-[#181e2c] border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Puzzle: <strong className="text-amber-200">{currentRoom.puzzle?.title || 'Brand New Match Crossword'}</strong></span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {currentRoom.puzzle?.clues?.length || 10} words
              </span>
            </div>

            {/* Mode & Status Badge */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                {currentRoom.mode === 'coop' ? (
                  <>
                    <HeartHandshake className="w-4 h-4 text-emerald-400" />
                    <span>Mode: <strong className="text-slate-100">Co-op Symphony (Shared Live Grid)</strong></span>
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4 text-rose-400" />
                    <span>Mode: <strong className="text-slate-100">Versus Race (Head-to-Head)</strong></span>
                  </>
                )}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">{currentRoom.players.length} Player{currentRoom.players.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Connected Players List */}
            <div className="p-3 rounded-xl bg-[#181e2c] border border-white/5 flex flex-col gap-2 max-h-40 overflow-y-auto">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Connected Players</span>
              {currentRoom.players.map((p, idx) => (
                <div key={p.id || idx} className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-3.5 h-3.5 rounded-full ring-2 ring-white/20"
                      style={{ backgroundColor: p.color || '#f59e0b' }}
                    />
                    <span className="text-sm font-semibold text-slate-200">
                      {p.name} {p.id === playerId ? '(You)' : ''}
                    </span>
                  </div>

                  {currentRoom.hostId === p.id && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
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
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-slate-950 font-black text-sm shadow-[0_0_15px_rgba(6,182,212,0.35)] flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Game for All Players</span>
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-white/5 text-center text-xs text-slate-300 animate-pulse font-mono border border-cyan-500/20">
                Connected! Waiting for host to launch the crossword...
              </div>
            )}
          </div>
        ) : (
          /* Lobby Setup View (Create or Join) */
          <div className="py-4 flex flex-col gap-4 overflow-y-auto">
            {/* Player Name Input */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Your Player Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Enter nickname..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#181e2c] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Create vs Join Tabs */}
            <div className="flex rounded-xl overflow-hidden border border-white/10 bg-[#181e2c] p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'create' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Create Room</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('join')}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'join' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
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
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    1. Select Game Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMode('coop')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        selectedMode === 'coop'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-inner'
                          : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-300 mb-1">
                        <HeartHandshake className="w-4 h-4" />
                        <span>Co-op Symphony</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-tight">
                        Shared grid, live sync, solve as a team!
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedMode('race')}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        selectedMode === 'race'
                          ? 'bg-rose-500/15 border-rose-500 text-white shadow-inner'
                          : 'bg-[#181e2c] border-white/5 text-slate-400 hover:bg-[#202738]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-sm text-rose-300 mb-1">
                        <Swords className="w-4 h-4" />
                        <span>Versus Race</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-tight">
                        Head-to-head race with live leaderboard!
                      </div>
                    </button>
                  </div>
                </div>

                {/* Theme / Style Select for Brand New Crossword */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    2. Crossword Musical Style
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                    {MULTIPLAYER_STYLES.map(style => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setSelectedTheme(style.id)}
                        className={`p-2 rounded-xl border text-xs font-semibold text-left transition cursor-pointer truncate ${
                          selectedTheme === style.id
                            ? 'bg-cyan-500/25 border-cyan-500 text-cyan-200'
                            : 'bg-[#181e2c] border-white/5 text-slate-300 hover:bg-[#202738]'
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
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-slate-950 font-black text-sm shadow-[0_0_15px_rgba(6,182,212,0.35)] flex items-center justify-center gap-2 transition cursor-pointer mt-2"
                >
                  <Users className="w-4 h-4" />
                  <span>Generate New Match & Create Room</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Enter Room Code
                  </label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BEAT-42"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#181e2c] border border-white/10 text-base font-mono font-bold tracking-widest text-center text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 uppercase"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onJoinRoom(joinCode, playerName)}
                  disabled={!joinCode.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 disabled:opacity-40 text-slate-950 font-black text-sm shadow-[0_0_15px_rgba(6,182,212,0.35)] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Join Room</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
