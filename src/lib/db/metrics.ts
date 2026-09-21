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

/** Spacing used by newly appended items and by full renumbering passes. */
export const ORDER_STRIDE = 1000;

/** Below this gap midpoints stop being safely distinct, forcing a renumber. */
export const MIN_ORDER_GAP = 0.5;

export interface ReorderPlan {
  /**
   * `single` rewrites one item's index; `renumber` rewrites the whole sequence.
   */
  kind: 'single' | 'renumber';
  /** Index to write for the moved item when `kind === 'single'`. */
  orderIndex: number;
}

/**
 * Computes the fractional index for moving `fromIndex` to `toIndex`.
 *
 * Pure and total: it never throws and never produces a colliding index. When the
 * neighbours at the destination are closer than `MIN_ORDER_GAP` — which happens
 * after enough free dragging — it reports `renumber` so the caller rebuilds a
 * clean `ORDER_STRIDE` sequence instead.
 */
export function planReorder(
  orderIndexes: readonly number[],
  fromIndex: number,
  toIndex: number,
): ReorderPlan {
  const remaining = orderIndexes.filter((_value, index) => index !== fromIndex);
  const before = toIndex > 0 ? remaining[toIndex - 1] : null;
  const after = toIndex < remaining.length ? remaining[toIndex] : null;

  if (before !== null && before !== undefined && after !== null && after !== undefined) {
    const gap = after - before;
    if (gap <= MIN_ORDER_GAP) return { kind: 'renumber', orderIndex: 0 };
    return { kind: 'single', orderIndex: before + gap / 2 };
  }

  if (before !== null && before !== undefined) {
    return { kind: 'single', orderIndex: before + ORDER_STRIDE };
  }
  if (after !== null && after !== undefined) {
    return { kind: 'single', orderIndex: after - ORDER_STRIDE };
  }
  return { kind: 'single', orderIndex: ORDER_STRIDE };
}

/** Rewrites a sequence into clean `ORDER_STRIDE` multiples, preserving order. */
export function renumberOrderIndexes(count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => (index + 1) * ORDER_STRIDE);
}

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
