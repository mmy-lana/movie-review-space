'use client';

/**
 * Watchlist persistence.
 *
 * The watchlist is intentionally lightweight: it is a set of film ids in
 * `localStorage` rather than a table, because it carries no fields beyond
 * membership and is read on every film card. Writes broadcast through a custom
 * window event so multiple islands on the same page stay in sync without a
 * global store.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cineslate:watchlist:v1';
const CHANGE_EVENT = 'cineslate:watchlist-change';

function readWatchlist(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    // Corrupt or unavailable storage must never break rendering.
    return new Set();
  }
}

function writeWatchlist(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Quota or privacy-mode failures are non-fatal: the toggle stays in memory.
  }
}

export interface WatchlistController {
  /** Every film id currently on the watchlist. */
  filmIds: string[];
  isReady: boolean;
  has: (filmId: string) => boolean;
  toggle: (filmId: string) => boolean;
  add: (filmId: string) => void;
  remove: (filmId: string) => void;
  /** Total number of watchlisted films. */
  count: number;
}

/** Subscribes to the watchlist and exposes cheap membership checks. */
export function useWatchlist(): WatchlistController {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setIds(readWatchlist());
      setIsReady(true);
    };
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const has = useCallback((filmId: string) => ids.has(filmId), [ids]);

  const toggle = useCallback(
    (filmId: string) => {
      const next = readWatchlist();
      const nowPresent = next.has(filmId);
      if (nowPresent) next.delete(filmId);
      else next.add(filmId);
      writeWatchlist(next);
      setIds(next);
      return !nowPresent;
    },
    [],
  );

  const add = useCallback((filmId: string) => {
    const next = readWatchlist();
    if (next.has(filmId)) return;
    next.add(filmId);
    writeWatchlist(next);
    setIds(next);
  }, []);

  const remove = useCallback((filmId: string) => {
    const next = readWatchlist();
    if (!next.has(filmId)) return;
    next.delete(filmId);
    writeWatchlist(next);
    setIds(next);
  }, []);

  return {
    filmIds: [...ids],
    isReady,
    has,
    toggle,
    add,
    remove,
    count: ids.size,
  };
}

export default useWatchlist;
