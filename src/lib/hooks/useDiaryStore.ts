'use client';

/**
 * Reactive diary store.
 *
 * Owns every mutation the diary surface performs — create, update, soft delete —
 * and mirrors each one onto the derived community metrics, the linked review row
 * and the activity stream inside a single IndexedDB transaction.
 *
 * Failures never leave a half-written log behind: the transaction aborts as a
 * unit and the caller receives `{ ok: false, error }` with a human-readable
 * reason to render.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityEvent, DiaryEntry, Film, Review, StarRating, UserProfile } from '@/types/cine';
import { getDb, isDatabaseAvailable } from '@/lib/db/indexdb';
import { applyCommunityRatingDeltaInTransaction } from '@/lib/db/metrics';
import { getDiaryByUser } from '@/lib/db/queries';
import { normalizeRating } from '@/lib/utils/rating-math';
import { toPlainTextPreview } from '@/lib/utils/markdown-sanitizer';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type DiaryMutationResult =
  | { ok: true; entry: DiaryEntry }
  | { ok: false; error: string };

export interface DiaryDraft {
  filmId: string;
  /** ISO `YYYY-MM-DD`. */
  watchedDate: string;
  rating: StarRating;
  isLiked: boolean;
  /** Explicit rewatch flag chosen by the viewer. */
  isRewatch: boolean;
  /** When true, a review row is created (or updated) alongside the log. */
  writeReview: boolean;
  /** Markdown review body; ignored when `writeReview` is false. */
  reviewBody: string;
  containsSpoilers: boolean;
}

export interface UseDiaryStoreResult {
  entries: DiaryEntry[];
  isReady: boolean;
  isLoading: boolean;
  /** Load failure for the list itself. */
  error: string | null;
  /** Failure from the most recent mutation, shown as an inline banner. */
  lastMutationError: string | null;
  refresh: () => Promise<void>;
  /** Creates a new log, or updates the entry when `entryId` is supplied. */
  saveEntry: (draft: DiaryDraft, entryId?: string) => Promise<DiaryMutationResult>;
  /** Soft-deletes a log (and its linked review) so history stays auditable. */
  deleteEntry: (entryId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Clears the transient mutation error banner. */
  clearError: () => void;
}

export interface UseDiaryStoreOptions {
  userId: string;
  /** Hydrated viewer profile embedded into activity events. */
  viewer?: UserProfile | null;
  enabled?: boolean;
}

export function useDiaryStore({
  userId,
  viewer = null,
  enabled = true,
}: UseDiaryStoreOptions): UseDiaryStoreResult {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [lastMutationError, setLastMutationError] = useState<string | null>(null);

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
      setIsReady(true);
      return;
    }
    if (!isDatabaseAvailable()) {
      setError(
        'IndexedDB is unavailable in this browser context, so the diary cannot be loaded.',
      );
      setIsLoading(false);
      setIsReady(true);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await getDiaryByUser(userId);
      if (!isMountedRef.current) return;
      setEntries(rows);
      setError(null);
    } catch (cause: unknown) {
      if (!isMountedRef.current) return;
      setError(
        cause instanceof Error
          ? `The diary could not be loaded: ${cause.message}`
          : 'The diary could not be loaded.',
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsReady(true);
      }
    }
  }, [enabled, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveEntry = useCallback(
    async (draft: DiaryDraft, entryId?: string): Promise<DiaryMutationResult> => {
      setLastMutationError(null);

      const rating = normalizeRating(draft.rating);
      if (rating === 0) {
        const message = 'Choose a rating between 0.5 and 5 stars before saving.';
        setLastMutationError(message);
        return { ok: false, error: message };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.watchedDate)) {
        const message = 'Watched date must be a valid YYYY-MM-DD value.';
        setLastMutationError(message);
        return { ok: false, error: message };
      }
      if (draft.writeReview && draft.reviewBody.trim().length === 0) {
        const message = 'Add some text to the review, or switch the review toggle off.';
        setLastMutationError(message);
        return { ok: false, error: message };
      }

      try {
        const db = getDb();
        const now = new Date().toISOString();

        const existing = entryId
          ? ((await db.diary.get(entryId)) ?? null)
          : ((await db.diary
              .where('[userId+filmId]')
              .equals([userId, draft.filmId])
              .toArray()).find((row) => !row.isDeleted) ?? null);

        // A repeat watch is inferred only when the same film was logged before
        // through a different entry; the explicit toggle still wins.
        const otherLogCount = await db.diary
          .where('[userId+filmId]')
          .equals([userId, draft.filmId])
          .filter((row) => !row.isDeleted && row.id !== existing?.id)
          .count();

        const resolvedIsRewatch =
          draft.isRewatch || (!existing && otherLogCount > 0) || existing?.isRewatch === true;

        const entry: DiaryEntry = {
          id: existing?.id ?? createId('diary'),
          userId,
          filmId: draft.filmId,
          reviewId: existing?.reviewId,
          watchedDate: draft.watchedDate,
          rating,
          isLiked: draft.isLiked,
          isRewatch: resolvedIsRewatch,
          isDeleted: false,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };

        const previousRating = existing?.rating ?? null;

        await db.transaction(
          'rw',
          [db.diary, db.reviews, db.films, db.activity],
          async () => {
            let reviewForActivity: Review | null = null;
            if (draft.writeReview) {
              const existingReview = existing?.reviewId
                ? ((await db.reviews.get(existing.reviewId)) ?? null)
                : null;

              const review: Review = {
                id: existingReview?.id ?? createId('review'),
                filmId: draft.filmId,
                userId,
                rating,
                isLiked: draft.isLiked,
                containsSpoilers: draft.containsSpoilers,
                reviewBody: draft.reviewBody.trim(),
                watchedDate: draft.watchedDate,
                isRewatch: resolvedIsRewatch,
                likeCount: existingReview?.likeCount ?? 0,
                commentCount: existingReview?.commentCount ?? 0,
                isDeleted: false,
                createdAt: existingReview?.createdAt ?? now,
                updatedAt: now,
              };

              await db.reviews.put(review);
              entry.reviewId = review.id;
              reviewForActivity = review;
            } else if (existing?.reviewId) {
              await db.reviews.update(existing.reviewId, {
                rating,
                isLiked: draft.isLiked,
                isRewatch: resolvedIsRewatch,
                watchedDate: draft.watchedDate,
                updatedAt: now,
              });
            }

            await db.diary.put(entry);

            const film = await db.films.get(draft.filmId);
            if (film) {
              await applyCommunityRatingDeltaInTransaction(db, {
                filmId: draft.filmId,
                remove: previousRating,
                add: rating,
              });

              if (!existing) {
                await db.films.update(draft.filmId, {
                  'metrics.logCount': film.metrics.logCount + 1,
                });
              }

              const profile = viewer ?? (await db.profiles.get(userId)) ?? null;
              if (profile) {
                const activity: ActivityEvent = {
                  id: createId('act'),
                  userId,
                  user: profile,
                  type: reviewForActivity ? 'REVIEW_FILM' : 'LOG_FILM',
                  targetId: reviewForActivity ? reviewForActivity.id : entry.id,
                  filmSlug: film.slug,
                  metadata: {
                    filmTitle: film.title,
                    filmYear: film.releaseYear,
                    filmPoster: film.posterUrl,
                    rating,
                    isLiked: draft.isLiked,
                    ...(reviewForActivity
                      ? { reviewSnippet: toPlainTextPreview(reviewForActivity.reviewBody, 200) }
                      : {}),
                  },
                  createdAt: now,
                };
                await db.activity.put(activity);
              }
            }
          },
        );

        await refresh();
        return { ok: true, entry };
      } catch (cause: unknown) {
        const message =
          cause instanceof Error
            ? `Your log could not be saved: ${cause.message}`
            : 'Your log could not be saved.';
        if (isMountedRef.current) setLastMutationError(message);
        return { ok: false, error: message };
      }
    },
    [refresh, userId, viewer],
  );

  const deleteEntry = useCallback(
    async (entryId: string): Promise<{ ok: boolean; error?: string }> => {
      setLastMutationError(null);
      try {
        const db = getDb();
        const now = new Date().toISOString();

        await db.transaction('rw', [db.diary, db.reviews, db.films], async () => {
          const entry = await db.diary.get(entryId);
          if (!entry) return;

          await db.diary.update(entryId, { isDeleted: true, updatedAt: now });

          if (entry.reviewId) {
            await db.reviews.update(entry.reviewId, { isDeleted: true, updatedAt: now });
          }

          await applyCommunityRatingDeltaInTransaction(db, {
            filmId: entry.filmId,
            remove: entry.rating,
            add: null,
          });

          const film = await db.films.get(entry.filmId);
          if (film && film.metrics.logCount > 0) {
            await db.films.update(entry.filmId, {
              'metrics.logCount': film.metrics.logCount - 1,
            });
          }
        });

        await refresh();
        return { ok: true };
      } catch (cause: unknown) {
        const message =
          cause instanceof Error
            ? `The log could not be removed: ${cause.message}`
            : 'The log could not be removed.';
        if (isMountedRef.current) setLastMutationError(message);
        return { ok: false, error: message };
      }
    },
    [refresh],
  );

  const clearError = useCallback(() => setLastMutationError(null), []);

  return useMemo(
    () => ({
      entries,
      isReady,
      isLoading,
      error,
      lastMutationError,
      refresh,
      saveEntry,
      deleteEntry,
      clearError,
    }),
    [
      entries,
      isReady,
      isLoading,
      error,
      lastMutationError,
      refresh,
      saveEntry,
      deleteEntry,
      clearError,
    ],
  );
}

/** Film type is re-exported for consumers that wire the store into a picker. */
export type DiaryFilm = Film;
