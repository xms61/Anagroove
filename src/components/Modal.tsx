import React, { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible dialog name; rendered by the caller, linked through `titleId`. */
  children: (ids: { titleId: string; descriptionId: string }) => React.ReactNode;
  /** Panel classes: width, padding and the accent border color (e.g. `border-amber-500/25`). */
  className?: string;
  /** Close when the dimmed backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Label for the built-in close button; `null` hides it. */
  closeLabel?: string | null;
}

/**
 * Shared modal shell: `role="dialog"` + `aria-modal`, labelled by the caller's heading,
 * focus trapped inside, Esc and backdrop close, focus returned to the opener.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className = 'max-w-md p-6 border-white/10',
  closeOnBackdrop = true,
  closeLabel = 'Close',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialog(panelRef, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onMouseDown={event => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`bg-kissa-surface border rounded-2xl w-full shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative text-slate-100 outline-none max-h-[90vh] overflow-y-auto ${className}`}
      >
        {closeLabel !== null && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute top-4 right-4 z-10 text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        {children({ titleId, descriptionId })}
      </div>
    </div>
  );
};
