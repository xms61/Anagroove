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
    <Modal isOpen={isOpen} onClose={onClose} className="border-bad/20 max-w-lg p-6 flex flex-col">
      {({ titleId, descriptionId }) => (
      <>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-line/10">
          <div className="w-10 h-10 rounded-xl bg-bad/20 border border-bad/35 text-bad flex items-center justify-center shadow-sm">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-fg flex items-center gap-2">
              Music Blacklist
              <span className="text-xs bg-bad/20 text-bad border border-bad/30 px-2 py-0.5 rounded-full font-mono">
                {blacklist.length} blocked
              </span>
            </h2>
            <p id={descriptionId} className="text-xs text-muted">
              Blacklisted artists and tracks will never appear in your crosswords.
            </p>
          </div>
        </div>

        {/* Add Field */}
        <form onSubmit={handleAdd} className="my-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-line/10 bg-panel p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInputType('artist')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  inputType === 'artist' ? 'bg-bad text-fg font-bold shadow-sm' : 'text-muted hover:text-fg'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Artist</span>
              </button>
              <button
                type="button"
                onClick={() => setInputType('song')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  inputType === 'song' ? 'bg-bad text-fg font-bold shadow-sm' : 'text-muted hover:text-fg'
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
              className="flex-1 px-3 py-2 rounded-xl bg-panel border border-line/10 text-sm text-fg placeholder:text-muted focus:outline-none focus:border-bad"
            />

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3.5 py-2 rounded-xl bg-bad hover:bg-bad disabled:opacity-40 text-fg font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Block</span>
            </button>
          </div>
        </form>

        {/* Search existing list */}
        {blacklist.length > 5 && (
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter blocked items..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-panel border border-line/10 text-xs text-fg placeholder:text-muted focus:outline-none"
            />
          </div>
        )}

        {/* Blacklist Items List */}
        <div className="flex-1 overflow-y-auto pr-1 divide-y divide-line/5">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted text-xs font-mono">
              {searchQuery ? 'No matching blocked items.' : 'Your blacklist is currently empty.'}
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.id}
                className="py-2.5 px-2.5 flex items-center justify-between hover:bg-fg/5 rounded-xl transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`text-[9.5px] px-2 py-0.5 rounded font-mono uppercase font-bold shrink-0 border ${
                      item.type === 'artist'
                        ? 'bg-hi/20 text-hi border-hi/30'
                        : 'bg-hi/20 text-hi border-hi/30'
                    }`}
                  >
                    {item.type}
                  </span>
                  <span className="text-sm font-semibold text-fg truncate">{item.name}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  title="Remove from blacklist"
                  className="p-1.5 text-muted hover:text-bad hover:bg-bad/10 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-2 border-t border-line/10 flex items-center justify-between text-xs text-muted">
          <span>Synced automatically without accounts</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-fg/10 hover:bg-fg/15 text-fg transition cursor-pointer font-semibold"
          >
            Done
          </button>
        </div>
      </>
      )}
    </Modal>
  );
};
