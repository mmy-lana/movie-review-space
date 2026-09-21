'use client';

/**
 * Focus-trapped accessible dialog for desktop and tablet viewports.
 *
 * Contract:
 * - Renders into a portal attached to `document.body`, so no ancestor
 *   `overflow` or `transform` can clip or re-position it.
 * - Locks page scroll (with scrollbar compensation) while open.
 * - Traps `Tab`/`Shift+Tab`, focuses the requested initial element on open,
 *   restores focus to the trigger on close, and closes on `Escape`.
 * - Clicking the backdrop requests a close; clicks inside the panel do not.
 * - Announces itself through `aria-labelledby` / `aria-describedby`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap, useScrollLock } from '@/lib/hooks/useFocusTrap';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dialog heading; also the accessible name. */
  title: string;
  /** Optional supporting copy, wired to `aria-describedby`. */
  description?: string;
  /** Body content. */
  children: React.ReactNode;
  /** Sticky footer content, typically action buttons. */
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Hides the header close button when the footer owns dismissal. */
  showCloseButton?: boolean;
  /** Prevents backdrop/Escape dismissal while a write is in flight. */
  preventDismiss?: boolean;
  /** Element focused on open; defaults to the first focusable descendant. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

const EXIT_DURATION_MS = 150;

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  preventDismiss = false,
  initialFocusRef,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => setIsMounted(true), []);

  // Keeps the panel mounted through the exit animation, then unmounts it.
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      return;
    }
    if (!isVisible) return;
    const timer = window.setTimeout(() => setIsVisible(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, isVisible]);

  const requestClose = useCallback(() => {
    if (preventDismiss) return;
    onClose();
  }, [onClose, preventDismiss]);

  useScrollLock(isOpen);
  useFocusTrap({
    active: isOpen,
    containerRef: panelRef,
    initialFocusRef,
    onEscape: requestClose,
  });

  const handleBackdropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      requestClose();
    },
    [requestClose],
  );

  if (!isMounted || !isVisible) return null;

  const titleId = 'modal-title';
  const descriptionId = description ? 'modal-description' : undefined;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6 ${
        isOpen ? 'animate-fade-in' : 'animate-fade-out'
      }`}
      style={{ animationDuration: `${EXIT_DURATION_MS}ms` }}
    >
      <div
        aria-hidden="true"
        onPointerDown={handleBackdropPointerDown}
        className="fixed inset-0 bg-black/75 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg border border-border-strong bg-surface-elevated shadow-popover sm:rounded-lg ${
          SIZE_CLASSES[size]
        } ${isOpen ? 'animate-zoom-in-95' : 'animate-fade-out'}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-bold text-text-primary sm:text-base">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-[11px] leading-snug text-text-muted">
                {description}
              </p>
            ) : null}
          </div>

          {showCloseButton ? (
            <button
              type="button"
              onClick={requestClose}
              disabled={preventDismiss}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer ? (
          <footer className="border-t border-border-subtle bg-surface-panel px-4 py-3 sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
