import React, { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { BlacklistItem } from '../services/apiClient';
import { Modal } from './Modal';
import { Button, IconButton, cx } from './ui';

interface BlacklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  blacklist: BlacklistItem[];
  onAddArtist: (name: string) => void;
  onAddSong: (title: string) => void;
  onRemoveItem: (id: string) => void;
}

const INPUT = 'bg-bg/50 border border-line rounded-control text-sm text-fg placeholder:text-muted focus:outline-none focus:border-accent';

/** Artists and songs that never appear in new puzzles. */
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

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (inputType === 'artist') onAddArtist(inputText);
    else onAddSong(inputText);
    setInputText('');
  };

  const filtered = blacklist.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg p-6 sm:p-7 flex flex-col">
      {({ titleId, descriptionId }) => (
        <div className="flex flex-col gap-5 min-h-0">
          <div className="pr-10">
            <h2 id={titleId} className="font-display text-2xl leading-none">Hidden artists &amp; songs</h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted">
              {blacklist.length} hidden. They never appear in new puzzles.
            </p>
          </div>

          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-1 p-1 bg-bg/40 border border-line rounded-control shrink-0" role="group" aria-label="Hide an artist or a song">
              {(['artist', 'song'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={inputType === type}
                  onClick={() => setInputType(type)}
                  className={cx('px-3 h-8 rounded-control text-sm font-bold capitalize cursor-pointer transition', inputType === type ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
                >
                  {type}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              aria-label={inputType === 'artist' ? 'Artist to hide' : 'Song to hide'}
              placeholder={inputType === 'artist' ? 'Artist name' : 'Song title'}
              className={cx(INPUT, 'flex-1 min-w-0 px-3 py-2')}
            />
            <Button type="submit" variant="primary" disabled={!inputText.trim()}>Hide</Button>
          </form>

          {blacklist.length > 5 && (
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Filter hidden items"
                placeholder="Filter"
                className={cx(INPUT, 'w-full pl-9 pr-3 py-2')}
              />
            </div>
          )}

          <ul className="flex-1 overflow-y-auto divide-y divide-line border-y border-line">
            {filtered.length === 0 ? (
              <li className="py-10 text-center text-sm text-muted">{searchQuery ? 'Nothing matches.' : 'Nothing hidden yet.'}</li>
            ) : (
              filtered.map(item => (
                <li key={item.id} className="py-2 flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs font-bold tracking-wider text-muted uppercase">{item.type}</span>
                  <span className="flex-1 min-w-0 text-sm font-semibold truncate">{item.name}</span>
                  <IconButton label={`Show ${item.name} again`} onClick={() => onRemoveItem(item.id)} className="hover:text-bad">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </IconButton>
                </li>
              ))
            )}
          </ul>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
