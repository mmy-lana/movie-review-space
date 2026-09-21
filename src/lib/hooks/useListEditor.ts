'use client';

/**
 * List editing store.
 *
 * Lists are stored as a single row with their items embedded (`FilmList.items`),
 * so every item mutation reads, patches and writes that one row inside a
 * transaction. Two entry points share the same transactional helper:
 * `useListEditor` for the owner's editor and `useListStore` for programme-wide
 * reads.
 *
 * Reordering uses **fractional indexes** (the seed uses a stride of 1000), so
 * dropping a card between two neighbours rewrites one nested item instead of
 * renumbering the list. When two neighbours have collapsed onto the same index,
 * the store rebuilds a clean `ORDER_STRIDE` sequence in the same transaction so
 * ordering never becomes ambiguous.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Film, FilmList, ListItem } from '@/types/cine';
import { getDb, isDatabaseAvailable } from '@/lib/db/indexdb';
import {
  ORDER_STRIDE,
  planReorder,
  renumberOrderIndexes,
} from '@/lib/db/metrics';
import { getListById, sortListItems } from '@/lib/db/queries';

/** Longest custom note accepted on a list item. */
export const MAX_ITEM_NOTE_LENGTH = 280;

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseListEditorResult {
  list: FilmList | null;
  /** Items in display order with their film relation resolved. */
  items: ListItem[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  /** Transient confirmation message for the toolbar. */
  statusMessage: string | null;
  refresh: () => Promise<void>;
  /** Moves the item at `fromIndex` so it occupies `toIndex`. */
  reorder: (fromIndex: number, toIndex: number) => Promise<void>;
  /** Rewrites every index into a clean `ORDER_STRIDE` sequence. */
  renumber: () => Promise<void>;
  /** Appends a film to the end of the list. */
  addFilm: (film: Film) => Promise<void>;
  /** Removes a film from the list. */
  removeItem: (itemId: string) => Promise<void>;
  /** Persists an inline note for one item. */
  updateNote: (itemId: string, note: string) => Promise<void>;
  /** Renames the list and updates its description. */
  updateMeta: (patch: { title?: string; description?: string }) => Promise<void>;
  /** Flips the ranked/private flags. */
  setFlags: (patch: { isRanked?: boolean; isPrivate?: boolean }) => Promise<void>;
  clearStatus: () => void;
}

export interface UseListEditorOptions {
  listId: string;
  /** Skips loading (used by the "new list" flow). */
  enabled?: boolean;
}

export function useListEditor({
  listId,
  enabled = true,
}: UseListEditorOptions): UseListEditorResult {
  const [list, setList] = useState<FilmList | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    if (!isDatabaseAvailable()) {
      setError('IndexedDB is unavailable, so this list cannot be opened.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const row = await getListById(listId, { includePrivate: true });
      if (!isMountedRef.current) return;
      setList(row);
      setError(row ? null : 'That list no longer exists in this browser.');
    } catch (cause: unknown) {
      if (!isMountedRef.current) return;
      setError(
        cause instanceof Error
          ? `This list could not be loaded: ${cause.message}`
          : 'This list could not be loaded.',
      );
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [enabled, listId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo(
    () => (list ? sortListItems(list.items, list.isRanked) : []),
    [list],
  );

  /**
   * Applies a pure transformation to the embedded item array inside a single
   * transaction, keeping `itemCount` and `updatedAt` in step.
   */
  const commitItems = useCallback(
    async (transform: (current: ListItem[]) => ListItem[]): Promise<void> => {
      const db = getDb();
      await db.transaction('rw', db.lists, async () => {
        const row = await db.lists.get(listId);
        if (!row) throw new Error('The list no longer exists.');

        const nextItems = transform(sortListItems(row.items, row.isRanked));
        await db.lists.update(listId, {
          items: nextItems,
          itemCount: nextItems.length,
          updatedAt: new Date().toISOString(),
        });
      });
    },
    [listId],
  );

  /**
   * Writes the new fractional index for one item and mirrors the new order into
   * the in-memory list so the UI never waits for a refetch.
   */
  const reorder = useCallback(
    async (fromIndex: number, toIndex: number): Promise<void> => {
      if (!list) return;
      const current = sortListItems(list.items, list.isRanked);
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= current.length || toIndex >= current.length) return;

      const moved = current[fromIndex];
      const previousOrder = moved.orderIndex;
      const plan = planReorder(
        current.map((item) => item.orderIndex),
        fromIndex,
        toIndex,
      );

      if (plan.kind === 'renumber') {
        // Neighbours collided: relocate the row physically, then rebuild a clean
        // ORDER_STRIDE sequence so the numbering follows the dropped order.
        const reordered = current.filter((_item, index) => index !== fromIndex);
        reordered.splice(toIndex, 0, moved);
        const freshIndexes = renumberOrderIndexes(reordered.length);
        const finalRows = reordered.map((item, index) => ({
          ...item,
          orderIndex: freshIndexes[index],
        }));

        setIsSaving(true);
        setError(null);
        try {
          await commitItems(() => finalRows);
          setList((currentList) =>
            currentList
              ? { ...currentList, items: finalRows, itemCount: finalRows.length }
              : currentList,
          );
          if (isMountedRef.current) setStatusMessage('List order rebuilt');
        } catch (cause: unknown) {
          if (isMountedRef.current) {
            setError(
              cause instanceof Error
                ? `The list order could not be rebuilt: ${cause.message}`
                : 'The list order could not be rebuilt.',
            );
            await refresh();
          }
        } finally {
          if (isMountedRef.current) setIsSaving(false);
        }
        return;
      }

      const nextIndex = plan.orderIndex;

      // Optimistic: place the row at its new fractional index immediately.
      setList((currentList) =>
        currentList
          ? {
              ...currentList,
              items: currentList.items.map((item) =>
                item.id === moved.id ? { ...item, orderIndex: nextIndex } : item,
              ),
            }
          : currentList,
      );
      setIsSaving(true);
      setError(null);

      try {
        await commitItems((rows) =>
          rows.map((item) => (item.id === moved.id ? { ...item, orderIndex: nextIndex } : item)),
        );
        if (isMountedRef.current) setStatusMessage('Order updated');
      } catch (cause: unknown) {
        // Roll the index back so the optimistic move cannot persist visually.
        if (isMountedRef.current) {
          setList((currentList) =>
            currentList
              ? {
                  ...currentList,
                  items: currentList.items.map((item) =>
                    item.id === moved.id ? { ...item, orderIndex: previousOrder } : item,
                  ),
                }
              : currentList,
          );
          setError(
            cause instanceof Error
              ? `The new order could not be saved: ${cause.message}`
              : 'The new order could not be saved.',
          );
        }
      } finally {
        if (isMountedRef.current) setIsSaving(false);
      }
    },
    [commitItems, list, refresh],
  );

  /** Rewrites every item index to a clean `ORDER_STRIDE` sequence. */
  const renumber = useCallback(async (): Promise<void> => {
    if (!list) return;
    const current = sortListItems(list.items, list.isRanked);
    const renumbered = current.map((item, index) => ({
      ...item,
      orderIndex: (index + 1) * ORDER_STRIDE,
    }));

    setList((currentList) => (currentList ? { ...currentList, items: renumbered } : currentList));
    setIsSaving(true);
    setError(null);

    try {
      await commitItems(() => renumbered);
      if (isMountedRef.current) setStatusMessage('List order rebuilt');
    } catch (cause: unknown) {
      if (isMountedRef.current) {
        setError(
          cause instanceof Error
            ? `The list order could not be rebuilt: ${cause.message}`
            : 'The list order could not be rebuilt.',
        );
        await refresh();
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [commitItems, list, refresh]);

  const addFilm = useCallback(
    async (film: Film): Promise<void> => {
      if (!list) return;
      if (list.items.some((item) => item.filmId === film.id)) {
        setStatusMessage(`${film.title} is already on this list`);
        return;
      }

      const sorted = sortListItems(list.items, list.isRanked);
      const lastIndex = sorted.length > 0 ? sorted[sorted.length - 1].orderIndex : 0;
      const now = new Date().toISOString();

      const item: ListItem = {
        id: createId('item'),
        listId: list.id,
        filmId: film.id,
        orderIndex: lastIndex + ORDER_STRIDE,
        film,
        addedAt: now,
      };

      setList((current) =>
        current
          ? { ...current, items: [...current.items, item], itemCount: current.items.length + 1 }
          : current,
      );
      setIsSaving(true);
      setError(null);

      try {
        await commitItems((rows) => [...rows, item]);

        // `listCount` is the number of lists this film appears on.
        const db = getDb();
        await db.transaction('rw', db.films, async () => {
          const stored = await db.films.get(film.id);
          if (stored) {
            await db.films.update(film.id, {
              'metrics.listCount': stored.metrics.listCount + 1,
            });
          }
        });

        if (isMountedRef.current) setStatusMessage(`${film.title} added`);
      } catch (cause: unknown) {
        if (isMountedRef.current) {
          setList((current) =>
            current
              ? {
                  ...current,
                  items: current.items.filter((row) => row.id !== item.id),
                  itemCount: current.items.length - 1,
                }
              : current,
          );
          setError(
            cause instanceof Error
              ? `The film could not be added: ${cause.message}`
              : 'The film could not be added.',
          );
        }
      } finally {
        if (isMountedRef.current) setIsSaving(false);
      }
    },
    [commitItems, list],
  );

  const removeItem = useCallback(
    async (itemId: string): Promise<void> => {
      if (!list) return;
      const target = list.items.find((item) => item.id === itemId);
      if (!target) return;

      setList((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((row) => row.id !== itemId),
              itemCount: current.items.length - 1,
            }
          : current,
      );
      setIsSaving(true);
      setError(null);

      try {
        await commitItems((rows) => rows.filter((row) => row.id !== itemId));

        const db = getDb();
        await db.transaction('rw', db.films, async () => {
          const stored = await db.films.get(target.filmId);
          if (stored && stored.metrics.listCount > 0) {
            await db.films.update(target.filmId, {
              'metrics.listCount': stored.metrics.listCount - 1,
            });
          }
        });

        if (isMountedRef.current) setStatusMessage('Removed from list');
      } catch (cause: unknown) {
        if (isMountedRef.current) {
          setError(
            cause instanceof Error
              ? `The film could not be removed: ${cause.message}`
              : 'The film could not be removed.',
          );
          await refresh();
        }
      } finally {
        if (isMountedRef.current) setIsSaving(false);
      }
    },
    [commitItems, list, refresh],
  );

  const updateNote = useCallback(
    async (itemId: string, note: string): Promise<void> => {
      const trimmed = note.slice(0, MAX_ITEM_NOTE_LENGTH);
      setList((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === itemId ? { ...item, customNote: trimmed } : item,
              ),
            }
          : current,
      );

      try {
        await commitItems((rows) =>
          rows.map((item) => (item.id === itemId ? { ...item, customNote: trimmed } : item)),
        );
        if (isMountedRef.current) setStatusMessage('Note saved');
      } catch (cause: unknown) {
        if (isMountedRef.current) {
          setError(
            cause instanceof Error
              ? `The note could not be saved: ${cause.message}`
              : 'The note could not be saved.',
          );
        }
      }
    },
    [commitItems],
  );

  const updateMeta = useCallback(
    async (patch: { title?: string; description?: string }): Promise<void> => {
      if (!list) return;
      const title = patch.title?.trim();
      if (patch.title !== undefined && (title === undefined || title.length === 0)) {
        setError('A list needs a title.');
        return;
      }

      const nextTitle = title ?? list.title;
      const nextDescription = patch.description ?? list.description;
      const now = new Date().toISOString();

      setList((current) =>
        current
          ? { ...current, title: nextTitle, description: nextDescription, updatedAt: now }
          : current,
      );
      setIsSaving(true);
      setError(null);

      try {
        await getDb().lists.update(list.id, {
          title: nextTitle,
          description: nextDescription,
          updatedAt: now,
        });
        if (isMountedRef.current) setStatusMessage('List details saved');
      } catch (cause: unknown) {
        if (isMountedRef.current) {
          setError(
            cause instanceof Error
              ? `The list details could not be saved: ${cause.message}`
              : 'The list details could not be saved.',
          );
          await refresh();
        }
      } finally {
        if (isMountedRef.current) setIsSaving(false);
      }
    },
    [list, refresh],
  );

  const setFlags = useCallback(
    async (patch: { isRanked?: boolean; isPrivate?: boolean }): Promise<void> => {
      if (!list) return;
      const now = new Date().toISOString();
      const nextRanked = patch.isRanked ?? list.isRanked;
      const nextPrivate = patch.isPrivate ?? list.isPrivate;

      setList((current) =>
        current
          ? { ...current, isRanked: nextRanked, isPrivate: nextPrivate, updatedAt: now }
          : current,
      );
      setIsSaving(true);
      setError(null);

      try {
        await getDb().lists.update(list.id, {
          isRanked: nextRanked,
          isPrivate: nextPrivate,
          updatedAt: now,
        });
        if (isMountedRef.current) {
          setStatusMessage(
            patch.isRanked !== undefined
              ? `Ranking ${nextRanked ? 'enabled' : 'disabled'}`
              : `Visibility set to ${nextPrivate ? 'private' : 'public'}`,
          );
        }
      } catch (cause: unknown) {
        if (isMountedRef.current) {
          setError(
            cause instanceof Error
              ? `List settings could not be saved: ${cause.message}`
              : 'List settings could not be saved.',
          );
          await refresh();
        }
      } finally {
        if (isMountedRef.current) setIsSaving(false);
      }
    },
    [list, refresh],
  );

  const clearStatus = useCallback(() => setStatusMessage(null), []);

  return {
    list,
    items,
    isLoading,
    isSaving,
    error,
    statusMessage,
    refresh,
    reorder,
    renumber,
    addFilm,
    removeItem,
    updateNote,
    updateMeta,
    setFlags,
    clearStatus,
  };
}

export default useListEditor;
