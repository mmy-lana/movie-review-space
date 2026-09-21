'use client';

/**
 * Mobile slide-up action panel (< 768px).
 *
 * Behaves like `Modal` for accessibility (portal, scroll lock, focus trap,
 * `Escape`, backdrop click) and adds touch ergonomics:
 * - Drag the grabber handle downwards to dismiss; the panel follows the finger
 *   and snaps back if the release velocity/distance is short of the threshold.
 * - The sheet is capped at `maxHeight` (default 90dvh) and its body scrolls
 *   independently, so long forms stay reachable above the keyboard.
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useFocusTrap, useScrollLock } from '@/lib/hooks/useFocusTrap';
import { useSwipeGesture } from '@/lib/hooks/useSwipeGesture';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sheet heading; also the accessible name. */
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Sticky footer content, typically action buttons. */
  footer?: React.ReactNode;
  /** CSS length for the expanded sheet height. */
  maxHeight?: string;
  preventDismiss?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/** Drag distance (px) that commits a dismiss on release. */
const DISMISS_DISTANCE = 96;
const EXIT_DURATION_MS = 200;

export function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxHeight = '90dvh',
  preventDismiss = false,
  initialFocusRef,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setDragOffset(0);
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

  const swipe = useSwipeGesture({
    enabled: !preventDismiss,
    onSwipeMove: (deltaY) => {
      // Only downward travel moves the sheet; upward drags are ignored.
      setDragOffset(Math.max(0, deltaY));
    },
    onSwipeEnd: (deltaY) => {
      if (deltaY > DISMISS_DISTANCE) {
        setDragOffset(0);
        requestClose();
        return;
      }
      setDragOffset(0);
    },
    onSwipeCancel: () => setDragOffset(0),
  });

  useScrollLock(isOpen);
  useFocusTrap({
    active: isOpen,
    containerRef: sheetRef,
    initialFocusRef,
    onEscape: requestClose,
  });

  if (!isMounted || !isVisible) return null;

  const titleId = 'bottom-sheet-title';
  const descriptionId = description ? 'bottom-sheet-description' : undefined;
  const isDragging = dragOffset > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        aria-hidden="true"
        onClick={requestClose}
        className={`absolute inset-0 bg-black/70 ${isOpen ? 'animate-fade-in' : 'animate-fade-out'}`}
        style={{ animationDuration: `${EXIT_DURATION_MS}ms` }}
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={{
          maxHeight,
          transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : undefined,
        }}
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-t-xl border-t border-border-strong bg-surface-elevated shadow-sheet ${
          isOpen ? 'animate-slide-up' : 'animate-slide-down'
        }`}
      >
        {/* Drag handle: the only region wired to the dismiss gesture, so the
            scrollable body keeps its native vertical scrolling. */}
        <div
          {...swipe}
          className="flex cursor-grab touch-none flex-col items-center gap-2 px-4 pb-2 pt-3 active:cursor-grabbing"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-10 rounded-full bg-border-strong"
          />
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-sm font-bold text-text-primary">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-[11px] leading-snug text-text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={preventDismiss}
              aria-label="Close panel"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <span className="sr-only">Drag down to dismiss this panel</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>

        {footer ? (
          <footer className="border-t border-border-subtle bg-surface-panel px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default BottomSheet;
