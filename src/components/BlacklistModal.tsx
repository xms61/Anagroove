import React, { useState } from 'react';
import { BlacklistItem } from '../services/apiClient';
import { Ban, Plus, Trash2, Search, User, Music } from 'lucide-react';
import { Modal } from './Modal';

interface BlacklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  blacklist: BlacklistItem[];
  onAddArtist: (name: string) => void;
  onAddSong: (title: string) => void;
  onRemoveItem: (id: string) => void;
}

export const BlacklistModal: React.FC<BlacklistModalProps> = ({
  isOpen,
  onClose,
  blacklist,
  onAddArtist,
  onAddSong,
  onRemoveItem,
}) => {
  const [inputText, setInputText] = useState('');
  const [inputType, setInputType] = useState<'artist' | 'song'>('artist');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (inputType === 'artist') {
      onAddArtist(inputText);
    } else {
      onAddSong(inputText);
    }
    setInputText('');
  };

  const filtered = blacklist.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="border-rose-500/20 max-w-lg p-6 flex flex-col">
      {({ titleId, descriptionId }) => (
      <>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/35 text-rose-400 flex items-center justify-center shadow-sm">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-white flex items-center gap-2">
              Music Blacklist
              <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono">
                {blacklist.length} blocked
              </span>
            </h2>
            <p id={descriptionId} className="text-xs text-slate-400">
              Blacklisted artists and tracks will never appear in your crosswords.
            </p>
          </div>
        </div>

        {/* Add Field */}
        <form onSubmit={handleAdd} className="my-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-white/10 bg-kissa-card p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInputType('artist')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  inputType === 'artist' ? 'bg-rose-500 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Artist</span>
              </button>
              <button
                type="button"
                onClick={() => setInputType('song')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  inputType === 'song' ? 'bg-rose-500 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Song</span>
              </button>
            </div>

            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Block ${inputType}... (e.g. ${inputType === 'artist' ? 'Taylor Swift, Drake' : 'Despacito'})`}
              className="flex-1 px-3 py-2 rounded-xl bg-kissa-card border border-white/10 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
            />

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Block</span>
            </button>
          </div>
        </form>

        {/* Search existing list */}
        {blacklist.length > 5 && (
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter blocked items..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-kissa-card border border-white/10 text-xs text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        )}

        {/* Blacklist Items List */}
        <div className="flex-1 overflow-y-auto pr-1 divide-y divide-white/5">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs font-mono">
              {searchQuery ? 'No matching blocked items.' : 'Your blacklist is currently empty.'}
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.id}
                className="py-2.5 px-2.5 flex items-center justify-between hover:bg-white/5 rounded-xl transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`text-[9.5px] px-2 py-0.5 rounded font-mono uppercase font-bold shrink-0 border ${
                      item.type === 'artist'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    {item.type}
                  </span>
                  <span className="text-sm font-semibold text-slate-200 truncate">{item.name}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  title="Remove from blacklist"
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span>Synced automatically without accounts</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 transition cursor-pointer font-semibold"
          >
            Done
          </button>
        </div>
      </>
      )}
    </Modal>
  );
};
