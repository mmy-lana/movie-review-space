/**
 * Profile lifetime-counter arithmetic.
 *
 * The diary store writes a log, its review, the film metrics and the author's
 * profile counters inside one IndexedDB transaction. The arithmetic lives here
 * so it stays pure, total and directly verifiable without a database or a React
 * renderer.
 *
 * Two properties matter:
 * - a counter that was seeded above the local diary total (the profile fixtures
 *   carry lifetime baselines) is never driven below zero;
 * - "this year" is decided by the caller's clock, injected as `currentYear`, so
 *   the same inputs always produce the same counters.
 */

import type { DiaryEntry, UserStats } from '@/types/cine';

/** Characters taken from an ISO `YYYY-MM-DD` date to read its year. */
const YEAR_SLICE_END = 4;

/** The calendar year of an ISO `YYYY-MM-DD` date, or `NaN` when unparseable. */
function watchedYear(watchedDate: string): number {
  return Number(watchedDate.slice(0, YEAR_SLICE_END));
}

/** The slice of a diary row these projections read. */
export type StatsDiaryRow = Pick<DiaryEntry, 'watchedDate' | 'reviewId' | 'isDeleted'>;

export interface LogStatsInput {
  stats: UserStats;
  /** The stored row this write replaces, or `null` for a brand-new log. */
  previous: StatsDiaryRow | null;
  /** ISO `YYYY-MM-DD` watch date of the row being written. */
  watchedDate: string;
  /** Runtime of the logged film, or `null` when the film row is missing. */
  runtimeMinutes: number | null;
  /** Whether this write creates or updates a review row. */
  writesReview: boolean;
  /** The year the caller treats as "this year". */
  currentYear: number;
}

/**
 * Applies a created or updated log to the viewer's lifetime counters.
 *
 * A new log counts one watch and the film's runtime; an edit only moves the
 * "watched this year" figure when the watch date crosses the year boundary, and
 * only counts a review the first time one is written for that log.
 */
export function applyLogToStats({
  stats,
  previous,
  watchedDate,
  runtimeMinutes,
  writesReview,
  currentYear,
}: LogStatsInput): UserStats {
  const isNewLog = previous === null || previous.isDeleted === true;
  const isThisYear = watchedYear(watchedDate) === currentYear;
  const wasThisYear = !isNewLog && watchedYear(previous.watchedDate) === currentYear;
  const reviewAlreadyCounted =
    previous !== null && previous.isDeleted !== true && Boolean(previous.reviewId);

  return {
    ...stats,
    filmsWatched: stats.filmsWatched + (isNewLog ? 1 : 0),
    thisYearCount: Math.max(
      0,
      stats.thisYearCount + (isThisYear ? 1 : 0) - (wasThisYear ? 1 : 0),
    ),
    totalWatchTimeMinutes:
      stats.totalWatchTimeMinutes +
      (isNewLog && runtimeMinutes !== null ? runtimeMinutes : 0),
    reviewsWritten: stats.reviewsWritten + (writesReview && !reviewAlreadyCounted ? 1 : 0),
  };
}

export interface LogRemovalStatsInput {
  stats: UserStats;
  /** The row being soft-deleted. */
  entry: Pick<DiaryEntry, 'watchedDate' | 'reviewId'>;
  /** Runtime of the logged film, or `null` when the film row is missing. */
  runtimeMinutes: number | null;
  /** The year the caller treats as "this year". */
  currentYear: number;
}

/** Reverses a soft-deleted log from the viewer's lifetime counters. */
export function applyLogRemovalToStats({
  stats,
  entry,
  runtimeMinutes,
  currentYear,
}: LogRemovalStatsInput): UserStats {
  const watchedThisYear = watchedYear(entry.watchedDate) === currentYear;

  return {
    ...stats,
    filmsWatched: Math.max(0, stats.filmsWatched - 1),
    thisYearCount: Math.max(0, stats.thisYearCount - (watchedThisYear ? 1 : 0)),
    totalWatchTimeMinutes: Math.max(
      0,
      stats.totalWatchTimeMinutes - (runtimeMinutes ?? 0),
    ),
    reviewsWritten: Math.max(0, stats.reviewsWritten - (entry.reviewId ? 1 : 0)),
  };
}
