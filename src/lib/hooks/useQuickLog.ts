'use client';

/**
 * Global quick-log controller.
 *
 * Owns the open/close state of the quick-log surface so any island — the mobile
 * bottom nav, a film card, a search result, or a detail-page button — can open
 * the same form with a film pre-selected, without prop drilling.
 *
 * The context deliberately holds no persistence logic: the provider component
 * owns the write path and calls back into these setters.
 */

import { createContext, useContext, useEffect } from 'react';
import type { Film } from '@/types/cine';

export interface QuickLogOpenOptions {
  /** Film to log; `null` opens a free-form entry that searches the catalogue. */
  film?: Film | null;
  /** Diary entry id when editing an existing log rather than creating one. */
  entryId?: string | null;
}

export interface QuickLogContextValue {
  /** Whether the quick-log surface is currently open. */
  isOpen: boolean;
  /** Film the form is editing, or `null` for a free-form new entry. */
  film: Film | null;
  /** Diary entry id when editing an existing log, otherwise `null`. */
  entryId: string | null;
  /** Opens the surface, optionally pre-selecting a film or an existing log. */
  open: (options?: QuickLogOpenOptions) => void;
  /** Requests a close (the provider refuses while a write is in flight). */
  close: () => void;
  /** True while a write is pending; blocks dismissal. */
  isBusy: boolean;
  /** Marks the write state, used to lock dismissal during persistence. */
  setBusy: (busy: boolean) => void;
  /** Called by the provider after a successful save. */
  notifySaved: (result: { entryId: string; isNewFilmLog: boolean }) => void;
  /** Monotonic counter bumped after every successful save. */
  lastSavedAt: number;
  /** Registers a listener invoked after each successful save. */
  subscribeToSaves: (listener: () => void) => () => void;
}

export const QuickLogContext = createContext<QuickLogContextValue | null>(null);

/**
 * Reads the quick-log controller.
 *
 * @throws Error when called outside `QuickLogProvider`, so a missing provider is
 *         caught during development rather than silently doing nothing.
 */
export function useQuickLog(): QuickLogContextValue {
  const context = useContext(QuickLogContext);
  if (!context) {
    throw new Error('useQuickLog must be used inside a <QuickLogProvider>.');
  }
  return context;
}

/**
 * Non-throwing variant for components that must also render without a provider
 * (embedded widgets and component previews).
 */
export function useOptionalQuickLog(): QuickLogContextValue | null {
  return useContext(QuickLogContext);
}

/**
 * Subscribes a callback to successful quick-log saves.
 *
 * Used by pages that own their own queries (diary, lists, profile) so a save made
 * from the global surface refreshes them without a global state library.
 */
export function useQuickLogSaveEffect(onSaved: () => void, enabled = true): void {
  const context = useOptionalQuickLog();

  useEffect(() => {
    if (!enabled || !context) return;
    return context.subscribeToSaves(onSaved);
  }, [context, enabled, onSaved]);
}

/**
 * Returns a counter that increments after every successful quick-log save.
 * List it as an effect dependency to refetch local queries.
 */
export function useQuickLogSaveSignal(): number {
  return useOptionalQuickLog()?.lastSavedAt ?? 0;
}
