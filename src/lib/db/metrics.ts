'use client';

/**
 * Community-metric maintenance.
 *
 * Whenever the viewer rates or un-rates a film, the stored histogram must move
 * with them or the distribution silently contradicts itself. Two entry points
 * share one calculation:
 *
 * - `applyCommunityRatingDelta` opens its own transaction (rating widgets).
 * - `applyCommunityRatingDeltaInTransaction` joins a caller's transaction
 *   (the diary store), so a log write and its metric update commit atomically.
 *
 * Reads are browser-only by construction: the module imports `getDb`, which
 * throws outside a client island.
 */

import type { StarRating } from '@/types/cine';
import { computeCommunityRating, toDenseHistogram } from '@/lib/utils/rating-math';
import { getDb, type CineSocialDatabase } from './indexdb';

export interface ApplyCommunityRatingDeltaInput {
  filmId: string;
  /** Rating to remove from the distribution, or `null` for a fresh entry. */
  remove: StarRating | null;
  /** Rating to add to the distribution, or `null` when clearing a rating. */
  add: StarRating | null;
}

/** Pure histogram mutation: returns the next distribution and its total. */
export function projectHistogramDelta(
  currentHistogram: Parameters<typeof toDenseHistogram>[0],
  delta: Pick<ApplyCommunityRatingDeltaInput, 'remove' | 'add'>,
): { histogram: ReturnType<typeof toDenseHistogram>; ratingCount: number; communityRating: number } {
  const histogram = toDenseHistogram(currentHistogram);

  if (delta.remove !== null && histogram[delta.remove] > 0) {
    histogram[delta.remove] -= 1;
  }
  if (delta.add !== null) {
    histogram[delta.add] += 1;
  }

  const ratingCount = Object.values(histogram).reduce((total, value) => total + value, 0);

  return {
    histogram,
    ratingCount,
    communityRating: ratingCount === 0 ? 0 : computeCommunityRating(histogram),
  };
}

/**
 * Applies a rating delta inside an existing read-write transaction.
 *
 * The caller must already hold `db.films` for writing; this function never opens
 * a transaction of its own, which is what makes atomic log + metric writes
 * possible.
 */
export async function applyCommunityRatingDeltaInTransaction(
  db: CineSocialDatabase,
  { filmId, remove, add }: ApplyCommunityRatingDeltaInput,
): Promise<void> {
  if (remove === add) return;

  const film = await db.films.get(filmId);
  if (!film) return;

  const next = projectHistogramDelta(film.metrics.histogram, { remove, add });

  await db.films.update(filmId, {
    'metrics.histogram': next.histogram,
    'metrics.ratingCount': next.ratingCount,
    'metrics.communityRating': next.communityRating,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Standalone convenience wrapper: opens its own transaction and applies a single
 * rating delta to a film's distribution.
 */
export async function applyCommunityRatingDelta(
  input: ApplyCommunityRatingDeltaInput,
): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.films, async () => {
    await applyCommunityRatingDeltaInTransaction(db, input);
  });
}

/**
 * Recomputes a film's rating count and community average from its stored
 * histogram, clearing the average when the distribution is empty.
 */
export async function recomputeFilmRatingMetrics(filmId: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.films, async () => {
    const film = await db.films.get(filmId);
    if (!film) return;

    const histogram = toDenseHistogram(film.metrics.histogram);
    const ratingCount = Object.values(histogram).reduce((total, value) => total + value, 0);

    await db.films.update(filmId, {
      'metrics.ratingCount': ratingCount,
      'metrics.communityRating': ratingCount === 0 ? 0 : computeCommunityRating(histogram),
      updatedAt: new Date().toISOString(),
    });
  });
}
