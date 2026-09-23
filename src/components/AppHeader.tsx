import { Check, ChevronDown, Lightbulb, Menu, Music2, Settings, Shuffle } from 'lucide-react';
import { Button, IconButton } from './ui';

interface AppHeaderProps {
  puzzleTitle: string;
  clueCount: number;
  isLoading: boolean;
  inRoom: boolean;
  onOpenGenerator: () => void;
  onNewPuzzle: () => void;
  onHint: () => void;
  onCheck: () => void;
  onOpenSettings: () => void;
  onOpenMenu: () => void;
}

/**
 * Name and puzzle picker on the left; Hint and Check (the only primary action), then New,
 * Settings and Menu as icons. Phones get two rows: name, Check and Menu, then the picker and icons.
 */
export function AppHeader({
  puzzleTitle,
  clueCount,
  isLoading,
  inRoom,
  onOpenGenerator,
  onNewPuzzle,
  onHint,
  onCheck,
  onOpenSettings,
  onOpenMenu,
}: AppHeaderProps) {
  const noPuzzle = clueCount === 0;

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-line">
      {/* Flex order puts Check and Menu on the phone's first row, and the picker with the other icons on the second */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2.5 flex flex-wrap items-center gap-2">
        <div className="order-1 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-control bg-accent text-on-accent shadow-accent flex items-center justify-center" aria-hidden="true">
            <Music2 className="w-[18px] h-[18px]" />
          </span>
          <h1 className="font-display text-2xl leading-none">Anagroove</h1>
        </div>

        <span className="hidden sm:block order-2 w-px h-6 mx-2 bg-line" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenGenerator}
          title="Pick a theme or write a prompt"
          className="order-4 sm:order-3 flex-1 sm:flex-initial min-w-[50%] sm:min-w-0 flex items-center gap-2 h-10 px-3 rounded-control bg-raised sm:bg-transparent border border-line sm:border-transparent hover:bg-raised text-sm font-bold cursor-pointer transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="truncate">{puzzleTitle}</span>
          {!noPuzzle && <span className="font-semibold text-muted shrink-0">{clueCount} words</span>}
          <ChevronDown className="w-4 h-4 text-muted shrink-0 ml-auto sm:ml-0" aria-hidden="true" />
        </button>

        <Button onClick={onHint} disabled={noPuzzle} icon={<Lightbulb className="w-4 h-4" aria-hidden="true" />} className="hidden sm:inline-flex sm:order-4 sm:ml-auto">
          Hint
        </Button>
        <Button variant="primary" onClick={onCheck} disabled={noPuzzle} icon={<Check className="w-4 h-4" aria-hidden="true" />} className="order-2 sm:order-5 ml-auto sm:ml-0">
          Check
        </Button>
        <span className="hidden sm:block order-6 w-px h-6 mx-1 bg-line" aria-hidden="true" />
        <IconButton label="Hint" onClick={onHint} disabled={noPuzzle} className="order-5 sm:hidden">
          <Lightbulb className="w-[18px] h-[18px]" aria-hidden="true" />
        </IconButton>
        <IconButton label="New puzzle" onClick={onNewPuzzle} disabled={isLoading} className="order-6 sm:order-7">
          <Shuffle className={`w-[18px] h-[18px] ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </IconButton>
        <IconButton label="Settings" onClick={onOpenSettings} className="order-7 sm:order-8">
          <Settings className="w-[18px] h-[18px]" aria-hidden="true" />
        </IconButton>
        <IconButton label="Menu" onClick={onOpenMenu} className="order-3 sm:order-9">
          <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
          {inRoom && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-hi" aria-label="In a multiplayer room" />}
        </IconButton>
      </div>
    </header>
  );
}
