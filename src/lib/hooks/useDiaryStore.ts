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
import { normalizeRating, toRatedOrNull } from '@/lib/utils/rating-math';
import { applyLogRemovalToStats, applyLogToStats } from '@/lib/utils/profile-stats';
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
  /** True while a create, update or delete is in flight. */
  isSaving: boolean;
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
  const [isSaving, setIsSaving] = useState(false);
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
      setIsSaving(true);

      const rating = normalizeRating(draft.rating);
      const failValidation = (message: string): DiaryMutationResult => {
        setLastMutationError(message);
        setIsSaving(false);
        return { ok: false, error: message };
      };

      if (rating === 0) {
        return failValidation('Choose a rating between 0.5 and 5 stars before saving.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.watchedDate)) {
        return failValidation('Watched date must be a valid YYYY-MM-DD value.');
      }
      if (draft.writeReview && draft.reviewBody.trim().length === 0) {
        return failValidation('Add some text to the review, or switch the review toggle off.');
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

        // A like-only row carries the `0` unrated sentinel and contributes
        // nothing to the community distribution, so it is never removed from it.
        const previousRating = existing ? toRatedOrNull(existing.rating) : null;

        // `db.profiles` is part of the lock set because the activity event below
        // reads the author profile inside this transaction when no hydrated
        // viewer was passed in; Dexie rejects an out-of-scope table read with
        // `Table profiles not included in the transaction scope`.
        await db.transaction(
          'rw',
          [db.diary, db.reviews, db.films, db.activity, db.profiles],
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

            // The persisted profile row is the baseline for the lifetime
            // counters, so a stale hydrated `viewer` prop can never clobber a
            // concurrent write. It is only a fallback for the activity event.
            const storedProfile = await db.profiles.get(userId);
            const profile = storedProfile ?? viewer ?? null;

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
            }

            if (storedProfile) {
              // Profile statistics move in the same transaction as the log, so
              // the profile page can never disagree with the diary that
              // produced the numbers.
              await db.profiles.update(userId, {
                stats: applyLogToStats({
                  stats: storedProfile.stats,
                  previous: existing ?? null,
                  watchedDate: draft.watchedDate,
                  runtimeMinutes: film?.runtimeMinutes ?? null,
                  writesReview: draft.writeReview,
                  currentYear: new Date(now).getFullYear(),
                }),
                updatedAt: now,
              });
            }

            if (film && profile) {
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
          },
        );

        // The write is committed; stop blocking dismissal before the refetch,
        // which is a read and can take longer than the user expects to wait.
        if (isMountedRef.current) setIsSaving(false);

        await refresh();
        return { ok: true, entry };
      } catch (cause: unknown) {
        const message =
          cause instanceof Error
            ? `Your log could not be saved: ${cause.message}`
            : 'Your log could not be saved.';
        if (isMountedRef.current) {
          setLastMutationError(message);
          setIsSaving(false);
        }
        return { ok: false, error: message };
      }
    },
    [refresh, userId, viewer],
  );

  const deleteEntry = useCallback(
    async (entryId: string): Promise<{ ok: boolean; error?: string }> => {
      setLastMutationError(null);
      setIsSaving(true);
      try {
        const db = getDb();
        const now = new Date().toISOString();

        await db.transaction('rw', [db.diary, db.reviews, db.films, db.profiles], async () => {
          const entry = await db.diary.get(entryId);
          // Already-removed rows are a no-op: the counters below must not be
          // decremented twice for the same log.
          if (!entry || entry.isDeleted) return;

          await db.diary.update(entryId, { isDeleted: true, updatedAt: now });

          if (entry.reviewId) {
            await db.reviews.update(entry.reviewId, { isDeleted: true, updatedAt: now });
          }

          // An unrated like-only row never entered the distribution, so there is
          // nothing to remove for it.
          const entryRating = toRatedOrNull(entry.rating);
          if (entryRating !== null) {
            await applyCommunityRatingDeltaInTransaction(db, {
              filmId: entry.filmId,
              remove: entryRating,
              add: null,
            });
          }

          const film = await db.films.get(entry.filmId);
          if (film && film.metrics.logCount > 0) {
            await db.films.update(entry.filmId, {
              'metrics.logCount': film.metrics.logCount - 1,
            });
          }

          // Mirror the removal onto the lifetime counters, floored at zero so a
          // seeded baseline can never go negative.
          const storedProfile = await db.profiles.get(userId);
          if (storedProfile) {
            await db.profiles.update(userId, {
              stats: applyLogRemovalToStats({
                stats: storedProfile.stats,
                entry,
                runtimeMinutes: film?.runtimeMinutes ?? null,
                currentYear: new Date(now).getFullYear(),
              }),
              updatedAt: now,
            });
          }
        });

        if (isMountedRef.current) setIsSaving(false);

        await refresh();
        return { ok: true };
      } catch (cause: unknown) {
        const message =
          cause instanceof Error
            ? `The log could not be removed: ${cause.message}`
            : 'The log could not be removed.';
        if (isMountedRef.current) {
          setLastMutationError(message);
          setIsSaving(false);
        }
        return { ok: false, error: message };
      }
    },
    [refresh, userId],
  );

  const clearError = useCallback(() => setLastMutationError(null), []);

  return useMemo(
    () => ({
      entries,
      isReady,
      isLoading,
      isSaving,
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
      isSaving,
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
