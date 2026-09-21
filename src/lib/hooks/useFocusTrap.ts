'use client';

/**
 * Focus and viewport management for dialogs, sheets and popovers.
 *
 * These are the only places in the app that move focus programmatically, so
 * behaviour stays consistent: focus enters the container on open, cycles inside
 * it while `Tab` is held, and returns to the invoking element on close.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Collects visible, focusable descendants in DOM order. */
export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.hasAttribute('disabled')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      // `offsetParent` is null for `display:none` subtrees; fixed-position
      // elements report null too, so exempt them explicitly.
      const isFixed = window.getComputedStyle(element).position === 'fixed';
      return isFixed || element.offsetParent !== null;
    },
  );
}

export interface UseFocusTrapOptions {
  /** Whether the trap is currently engaged. */
  active: boolean;
  /** The element focus is confined to. */
  containerRef: RefObject<HTMLElement | null>;
  /** Element focused on open. Defaults to the first focusable descendant. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Restores focus to the previously focused element on close. */
  restoreFocus?: boolean;
  /** Invoked when `Escape` is pressed while the trap is engaged. */
  onEscape?: () => void;
}

/**
 * Traps keyboard focus inside `containerRef` while `active` is true and wires
 * the `Escape` key to `onEscape`.
 */
export function useFocusTrap({
  active,
  containerRef,
  initialFocusRef,
  restoreFocus = true,
  onEscape,
}: UseFocusTrapOptions): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    const target =
      initialFocusRef?.current ?? getFocusableElements(container)[0] ?? container;

    const restore = () => {
      const restoreTarget = previouslyFocusedRef.current;
      if (restoreFocus && restoreTarget?.isConnected) {
        restoreTarget.focus({ preventScroll: true });
      }
    };

    if (!(target instanceof HTMLElement)) return restore;

    // Defer so the element exists after the enter animation has mounted it.
    const frame = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      restore();
    };
  }, [active, containerRef, initialFocusRef, restoreFocus]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!active) return;

      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;
      const isInside = activeElement instanceof Node && container.contains(activeElement);

      if (event.shiftKey) {
        if (activeElement === first || !isInside) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (activeElement === last || !isInside) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    },
    [active, containerRef, onEscape],
  );

  useEffect(() => {
    if (!active) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);
}

/**
 * Locks page scroll while a modal or sheet is open, compensating for the
 * scrollbar width so the underlying layout does not shift horizontally.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}

/**
 * Tracks a CSS media query. Returns `defaultMatches` during server rendering
 * and on the first client paint, then the live value.
 */
export function useMediaQuery(query: string, defaultMatches = false): boolean {
  const [matches, setMatches] = useState(defaultMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
