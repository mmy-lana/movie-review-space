'use client';

/**
 * Reactive per-user film interactions: ratings, likes and diary presence.
 *
 * Reads are batched into a single pass over the diary table (rather than one
 * query per film) so a grid of sixty cards costs one IndexedDB round-trip.
 *
 * Writes are **optimistic with rollback**: the local map updates immediately so
 * the UI never lags behind the tap, and the previous value is restored if the
 * IndexedDB transaction rejects. Failures are surfaced through `error`, never
 * swallowed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiaryEntry, Film, StarRating } from '@/types/cine';
import { getDb } from '@/lib/db/indexdb';
import { getDiaryByUser } from '@/lib/db/queries';
import { applyCommunityRatingDelta } from '@/lib/db/metrics';
import { normalizeRating, toRatedOrNull } from '@/lib/utils/rating-math';

/** Generates a collision-resistant id, with a fallback for older engines. */
function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface FilmInteractionState {
  /** The viewer's most recent rating per film id. */
  ratings: Map<string, StarRating>;
  /** Whether the viewer liked the film most recently. */
  liked: Map<string, boolean>;
  /** The viewer's most recent diary entry per film id. */
  latestEntry: Map<string, DiaryEntry>;
}

export interface UseFilmRatingsResult extends FilmInteractionState {
  isReady: boolean;
  error: string | null;
  /** Refetches the interaction maps from IndexedDB. */
  refresh: () => Promise<void>;
  /** Sets (or clears, with `0`) the viewer's rating for a film. */
  setRating: (film: Film, rating: StarRating | 0) => Promise<boolean>;
  /** Toggles the viewer's like for a film. */
  toggleLike: (film: Film, nextLiked?: boolean) => Promise<boolean>;
  /** The viewer's rating for a film, or `null`. */
  getRating: (filmId: string) => StarRating | null;
  /** Whether the viewer liked a film. */
  isLiked: (filmId: string) => boolean;
}

export interface UseFilmRatingsOptions {
  userId: string;
  /** Skips the initial load (used when the viewer is not resolved yet). */
  enabled?: boolean;
}

export function useFilmRatings({
  userId,
  enabled = true,
}: UseFilmRatingsOptions): UseFilmRatingsResult {
  const [ratings, setRatings] = useState<Map<string, StarRating>>(() => new Map());
  const [liked, setLiked] = useState<Map<string, boolean>>(() => new Map());
  const [latestEntry, setLatestEntry] = useState<Map<string, DiaryEntry>>(() => new Map());
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against setting state after unmount during long transactions.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const entries = await getDiaryByUser(userId);
      if (!isMountedRef.current) return;

      const nextRatings = new Map<string, StarRating>();
      const nextLiked = new Map<string, boolean>();
      const nextLatest = new Map<string, DiaryEntry>();

      // Entries arrive newest-first, so the first occurrence per film wins.
      for (const entry of entries) {
        if (!nextLatest.has(entry.filmId)) {
          nextLatest.set(entry.filmId, entry);
          // A like-only row carries the `0` unrated sentinel: it must never
          // surface as a rating.
          const rated = toRatedOrNull(entry.rating);
          if (rated !== null) nextRatings.set(entry.filmId, rated);
          nextLiked.set(entry.filmId, entry.isLiked);
        }
      }

      setRatings(nextRatings);
      setLiked(nextLiked);
      setLatestEntry(nextLatest);
      setIsReady(true);
      setError(null);
    } catch (cause: unknown) {
      if (!isMountedRef.current) return;
      setIsReady(true);
      setError(
        cause instanceof Error
          ? `Could not read your ratings: ${cause.message}`
          : 'Could not read your ratings.',
      );
    }
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  const getRating = useCallback(
    (filmId: string): StarRating | null => ratings.get(filmId) ?? null,
    [ratings],
  );

  const isLiked = useCallback(
    (filmId: string): boolean => liked.get(filmId) ?? false,
    [liked],
  );

  /**
   * Writes the rating to the viewer's most recent diary entry for the film,
   * creating one when the film has never been logged.
   *
   * Clearing (`0`) soft-deletes that entry, reverses its contribution to the
   * community distribution and drops the film from every local map, so a later
   * refresh cannot resurrect the rating or underflow a histogram bucket.
   */
  const setRating = useCallback(
    async (film: Film, rating: StarRating | 0): Promise<boolean> => {
      const normalized = normalizeRating(rating);
      const previous = ratings.get(film.id) ?? null;
      const previousLiked = liked.get(film.id) ?? false;
      const previousEntry = latestEntry.get(film.id) ?? null;

      // The stored distribution follows the diary row's rating, which is the
      // authoritative baseline. An unrated row contributes nothing.
      const storedRating = previousEntry ? toRatedOrNull(previousEntry.rating) : null;
      const previousStoredRating: StarRating | null = storedRating ?? previous;

      // Optimistic projection. Clearing removes the film from every map rather
      // than leaving a stale entry behind.
      const dropFromMaps = () => {
        setRatings((current) => {
          const next = new Map(current);
          next.delete(film.id);
          return next;
        });
        setLiked((current) => {
          const next = new Map(current);
          next.delete(film.id);
          return next;
        });
        setLatestEntry((current) => {
          const next = new Map(current);
          next.delete(film.id);
          return next;
        });
      };

      if (normalized === 0) dropFromMaps();
      else setRatings((current) => new Map(current).set(film.id, normalized));
      setError(null);

      try {
        const db = getDb();
        const now = new Date().toISOString();
        const today = now.slice(0, 10);

        if (normalized === 0) {
          // Clearing is a soft delete: history stays auditable, but the row no
          // longer feeds the viewer's maps or the community distribution.
          if (previousEntry) {
            await db.diary.update(previousEntry.id, { isDeleted: true, updatedAt: now });
          }
          if (previousStoredRating !== null) {
            await applyCommunityRatingDelta({
              filmId: film.id,
              remove: previousStoredRating,
              add: null,
            });
          }
          return true;
        }

        if (previousEntry) {
          await db.diary.update(previousEntry.id, {
            rating: normalized,
            isDeleted: false,
            updatedAt: now,
          });
        } else {
          const created: DiaryEntry = {
            id: createId('diary'),
            userId,
            filmId: film.id,
            watchedDate: today,
            rating: normalized,
            isLiked: false,
            isRewatch: false,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          };
          await db.diary.put(created);
          setLatestEntry((current) => new Map(current).set(film.id, created));
        }

        // Keep the stored community histogram consistent with the change.
        await applyCommunityRatingDelta({
          filmId: film.id,
          remove: previousStoredRating,
          add: normalized,
        });

        return true;
      } catch (cause: unknown) {
        // Rollback to the pre-write snapshot.
        if (isMountedRef.current) {
          setRatings((current) => {
            const next = new Map(current);
            if (previous === null) next.delete(film.id);
            else next.set(film.id, previous);
            return next;
          });
          setLiked((current) => {
            const next = new Map(current);
            if (previousLiked) next.set(film.id, true);
            else next.delete(film.id);
            return next;
          });
          setLatestEntry((current) => {
            const next = new Map(current);
            if (previousEntry === null) next.delete(film.id);
            else next.set(film.id, previousEntry);
            return next;
          });
          setError(
            cause instanceof Error
              ? `Rating could not be saved: ${cause.message}`
              : 'Rating could not be saved.',
          );
        }
        return false;
      }
    },
    [latestEntry, liked, ratings, userId],
  );

  const toggleLike = useCallback(
    async (film: Film, nextLiked?: boolean): Promise<boolean> => {
      const previousLiked = liked.get(film.id) ?? false;
      const target = nextLiked ?? !previousLiked;
      const existing = latestEntry.get(film.id) ?? null;

      setLiked((current) => new Map(current).set(film.id, target));
      setError(null);

      try {
        const now = new Date().toISOString();

        if (existing) {
          await getDb().diary.update(existing.id, { isLiked: target, updatedAt: now });
          setLatestEntry((current) =>
            new Map(current).set(film.id, { ...existing, isLiked: target, updatedAt: now }),
          );
          return true;
        }

        // A like on a never-logged film must not invent a rating. The row is
        // created unrated and therefore contributes nothing to the rating
        // histogram, the community average or the viewer's rating map.
        const created: DiaryEntry = {
          id: createId('diary'),
          userId,
          filmId: film.id,
          watchedDate: now.slice(0, 10),
          rating: 0,
          isLiked: target,
          isRewatch: false,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        };
        await getDb().diary.put(created);
        setLatestEntry((current) => new Map(current).set(film.id, created));

        return true;
      } catch (cause: unknown) {
        if (isMountedRef.current) {
          setLiked((current) => {
            const next = new Map(current);
            if (previousLiked) next.set(film.id, true);
            else next.delete(film.id);
            return next;
          });
          setError(
            cause instanceof Error
              ? `Like could not be saved: ${cause.message}`
              : 'Like could not be saved.',
          );
        }
        return false;
      }
    },
    [latestEntry, liked, userId],
  );

  return useMemo(
    () => ({
      ratings,
      liked,
      latestEntry,
      isReady,
      error,
      refresh,
      setRating,
      toggleLike,
      getRating,
      isLiked,
    }),
    [
      ratings,
      liked,
      latestEntry,
      isReady,
      error,
      refresh,
      setRating,
      toggleLike,
      getRating,
      isLiked,
    ],
  );
}

export default useFilmRatings;
