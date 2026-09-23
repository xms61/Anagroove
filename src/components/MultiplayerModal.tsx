import React, { useState } from 'react';
import { Check, Copy, Crown, HeartHandshake, Play, Swords } from 'lucide-react';
import { MultiplayerRoom } from '../services/socketService';
import { Puzzle } from '../../shared/types';
import { Modal } from './Modal';
import { Button, cx } from './ui';
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

const MODES = {
  coop: { title: 'Co-op', detail: 'One shared grid, solved together', icon: HeartHandshake },
  race: { title: 'Race', detail: 'Same puzzle, first to finish wins', icon: Swords },
} as const;

const LABEL = 'block mb-2 text-xs font-bold tracking-[0.14em] text-muted uppercase';
const INPUT = 'w-full px-3.5 py-2.5 rounded-control bg-bg/50 border border-line text-fg placeholder:text-muted focus:outline-none focus:border-accent';

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'p-3 rounded-control border text-left transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        selected ? 'bg-accent/15 border-accent' : 'bg-raised/60 border-line hover:bg-raised',
      )}
    >
      {children}
    </button>
  );
}

function RoomView({ room, playerId, onStartGame }: { room: MultiplayerRoom; playerId: string; onStartGame: () => void }) {
  const [copied, setCopied] = useState(false);
  const mode = MODES[room.mode];
  const isHost = room.hostId === playerId;

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-panel bg-raised/60 border border-line flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold tracking-[0.14em] text-muted uppercase">Room code</div>
          <div className="font-mono text-3xl font-bold tracking-widest">{room.code}</div>
        </div>
        <Button onClick={copyCode} icon={copied ? <Check className="w-4 h-4 text-ok" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 min-w-0">
          <mode.icon className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
          <span className="font-bold">{mode.title}</span>
          <span className="text-muted truncate">· {room.puzzle?.title || 'New puzzle'}</span>
        </span>
        <span className="text-muted shrink-0">{room.puzzle?.clues?.length || 10} words</span>
      </div>

      <section>
        <h3 className={LABEL}>Players ({room.players.length})</h3>
        <ul className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
          {room.players.map((p, idx) => (
            <li key={p.id || idx} className="flex items-center gap-2.5 px-3 py-2 rounded-control bg-raised/60 border border-line">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color || 'rgb(var(--c-accent))' }} aria-hidden="true" />
              <span className="text-sm font-semibold flex-1 truncate">{p.name}{p.id === playerId ? ' (you)' : ''}</span>
              {room.hostId === p.id && (
                <span className="flex items-center gap-1 text-xs font-bold text-accent">
                  <Crown className="w-3.5 h-3.5" aria-hidden="true" /> Host
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <Button variant="primary" onClick={onStartGame} icon={<Play className="w-4 h-4 fill-current" aria-hidden="true" />} className="w-full h-12 text-base">
          Start for everyone
        </Button>
      ) : (
        <p className="p-3 rounded-control bg-raised/60 border border-line text-center text-sm text-muted" role="status">
          Waiting for the host to start…
        </p>
      )}
    </div>
  );
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
  const [playerName, setPlayerName] = useState(() => readString(STORAGE_KEYS.playerName) || `DJ_${Math.floor(100 + Math.random() * 900)}`);
  const [joinCode, setJoinCode] = useState('');
  const [selectedMode, setSelectedMode] = useState<'coop' | 'race'>('coop');
  const [selectedTheme, setSelectedTheme] = useState('all');

  const changeName = (name: string) => {
    setPlayerName(name);
    writeString(STORAGE_KEYS.playerName, name);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg p-6 sm:p-7 flex flex-col">
      {({ titleId, descriptionId }) => (
        <div className="flex flex-col gap-5">
          <div className="pr-10">
            <h2 id={titleId} className="font-display text-2xl leading-none">Multiplayer</h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted">Solve one grid together, or race on the same puzzle.</p>
          </div>

          {currentRoom ? (
            <RoomView room={currentRoom} playerId={playerId} onStartGame={onStartGame} />
          ) : (
            <>
              <div>
                <label htmlFor="player-name" className={LABEL}>Your name</label>
                <input id="player-name" type="text" value={playerName} onChange={e => changeName(e.target.value)} className={INPUT} />
              </div>

              <div className="flex gap-1 p-1 bg-bg/40 border border-line rounded-control" role="group" aria-label="Create or join">
                {(['create', 'join'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={cx('flex-1 h-9 rounded-control text-sm font-bold cursor-pointer transition', activeTab === tab ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
                  >
                    {tab === 'create' ? 'Create a room' : 'Join with a code'}
                  </button>
                ))}
              </div>

              {activeTab === 'create' ? (
                <div className="flex flex-col gap-4">
                  <section>
                    <h3 className={LABEL}>Mode</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(MODES) as ('coop' | 'race')[]).map(id => {
                        const mode = MODES[id];
                        return (
                          <Option key={id} selected={selectedMode === id} onClick={() => setSelectedMode(id)}>
                            <div className="flex items-center gap-1.5 text-sm font-bold">
                              <mode.icon className="w-4 h-4 text-accent" aria-hidden="true" />
                              {mode.title}
                            </div>
                            <div className="text-xs text-muted mt-0.5">{mode.detail}</div>
                          </Option>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className={LABEL}>Theme</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                      {THEMES.map(theme => (
                        <Option key={theme.id} selected={selectedTheme === theme.id} onClick={() => setSelectedTheme(theme.id)}>
                          <span className="block text-sm font-semibold truncate"><span aria-hidden="true">{theme.icon}</span> {theme.name}</span>
                        </Option>
                      ))}
                    </div>
                  </section>

                  <Button variant="primary" onClick={() => onCreateRoom(playerName, selectedMode, selectedTheme)} className="w-full h-12 text-base">
                    Create room
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <label htmlFor="join-code" className={LABEL}>Room code</label>
                    <input
                      id="join-code"
                      type="text"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="BEAT-42"
                      className={cx(INPUT, 'text-lg font-mono font-bold tracking-widest text-center uppercase')}
                    />
                  </div>
                  <Button variant="primary" onClick={() => onJoinRoom(joinCode, playerName)} disabled={!joinCode.trim()} className="w-full h-12 text-base">
                    Join room
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
