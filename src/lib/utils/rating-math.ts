/**
 * Ten-point (half-star) rating mathematics.
 *
 * The entire application funnels rating arithmetic through this module so that
 * pointer interactions, keyboard interactions, histograms, aggregate community
 * scores and display formatting can never drift apart.
 */

import {
  MAX_STAR_RATING,
  MIN_STAR_RATING,
  STAR_RATING_INCREMENT,
  STAR_RATING_STEPS,
  type PartialRatingHistogram,
  type RatingHistogram,
  type StarRating,
} from '@/types/cine';

/** Total number of discrete rating intervals on a five-star scale. */
export const RATING_INTERVALS = STAR_RATING_STEPS.length;

/**
 * Quantises an arbitrary number onto the 0.5 – 5.0 ladder.
 *
 * Anything at or below zero collapses to `0` — the "no rating" sentinel — so
 * callers can distinguish "unrated" from the lowest legal rating.
 */
export function normalizeRating(value: number): StarRating | 0 {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const stepped = Math.round(value * 2) / 2;
  const clamped = Math.max(MIN_STAR_RATING, Math.min(MAX_STAR_RATING, stepped));
  return clamped as StarRating;
}

/**
 * Nudges a rating by a number of half-star steps.
 *
 * The `min` argument is a *floor*, not a lower bound for clearing: any step that
 * would land below it resolves to `min` itself. With the default floor of `0.5`
 * this means stepping down from half a star holds at half a star; keyboard
 * decrement never silently discards a rating. Callers that genuinely need to
 * clear a rating pass `min: 0` explicitly, which allows the `0` "unrated"
 * sentinel to be reached.
 */
export function stepRating(
  rating: StarRating | 0,
  steps: number,
  min: StarRating | 0 = MIN_STAR_RATING,
): StarRating | 0 {
  if (steps === 0) return rating;
  const next = rating + steps * STAR_RATING_INCREMENT;
  if (min === 0 && next <= 0) return 0;
  if (next < min) return min;
  return normalizeRating(next);
}

/**
 * Derives a 0.5 – 5.0 rating from a pointer position inside the star track.
 *
 * Consumes a raw client coordinate rather than hover state, so mouse, pen and
 * touch input all resolve identically. The left edge of the track — and any
 * position left of it — resolves to the lowest legal rating (0.5); positions at
 * or beyond the right edge resolve to five stars. The result is always a member
 * of `StarRating`, never the `0` "unrated" sentinel: clearing a rating is an
 * explicit action in the UI, not an accidental pointer position.
 */
export function calculateStarFromPointer(
  clientX: number,
  containerRect: DOMRect,
  totalStars: number = 5,
): StarRating {
  const width = containerRect.width;
  if (!Number.isFinite(clientX) || width <= 0) return MIN_STAR_RATING;

  const rawX = clientX - containerRect.left;
  const clampedX = Math.max(0, Math.min(rawX, width));
  const ratio = clampedX / width;

  const intervals = totalStars * 2;
  const discreteStep = Math.ceil(ratio * intervals) / 2;
  const normalized = Math.max(MIN_STAR_RATING, Math.min(totalStars, discreteStep));

  return normalized as StarRating;
}

/** Percentage of the track width occupied by a given rating (0 – 100). */
export function ratingToPercent(rating: StarRating | 0, totalStars: number = 5): number {
  const clamped = Math.max(0, Math.min(totalStars, rating));
  return (clamped / totalStars) * 100;
}

/**
 * Formats a rating for display, dropping `.0` on whole stars to match the
 * Letterboxd convention (`4` rather than `4.0`, while `4.5` stays precise).
 */
export function formatRatingDisplay(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || !Number.isFinite(rating)) {
    return '—';
  }
  const rounded = Math.round(rating * 10) / 10;
  if (rounded === 0) return '0';
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** Formats a community average, always at two decimals (e.g. `4.58`). */
export function formatCommunityRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || !Number.isFinite(rating)) {
    return '—';
  }
  return rating.toFixed(2);
}

/** Normalises a sparse histogram into a dense one with all ten buckets. */
export function toDenseHistogram(
  histogram: PartialRatingHistogram | null | undefined,
): RatingHistogram {
  const dense = {} as RatingHistogram;
  for (const step of STAR_RATING_STEPS) {
    const value = histogram?.[step];
    dense[step] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return dense;
}

/** Sum of every bucket in a histogram. */
export function histogramTotal(
  histogram: PartialRatingHistogram | null | undefined,
): number {
  return STAR_RATING_STEPS.reduce((total, step) => total + (histogram?.[step] ?? 0), 0);
}

/** Weighted mean of a histogram, rounded to two decimals. */
export function computeCommunityRating(
  histogram: PartialRatingHistogram | null | undefined,
): number {
  const total = histogramTotal(histogram);
  if (total <= 0) return 0;
  const weighted = STAR_RATING_STEPS.reduce(
    (sum, step) => sum + step * (histogram?.[step] ?? 0),
    0,
  );
  return Number((weighted / total).toFixed(2));
}

export interface HistogramBar {
  rating: StarRating;
  count: number;
  /** Bar height as a percentage of the tallest bucket (4% floor). */
  heightPercentage: number;
  /** Share of all ratings held by this bucket (0 – 100, one decimal). */
  sharePercentage: number;
  isUserRating: boolean;
}

/**
 * Projects a histogram into render-ready bars scaled against its tallest
 * bucket. The 4% floor keeps near-empty buckets visible as a hairline.
 */
export function getHistogramPercentages(
  hist: PartialRatingHistogram | null | undefined,
  userRating?: StarRating | null,
): HistogramBar[] {
  const dense = toDenseHistogram(hist);
  const total = histogramTotal(dense);

  let max = 0;
  for (const step of STAR_RATING_STEPS) {
    if (dense[step] > max) max = dense[step];
  }

  return STAR_RATING_STEPS.map((step) => {
    const count = dense[step];
    const percentage = max > 0 ? (count / max) * 100 : 0;
    return {
      rating: step,
      count,
      heightPercentage: Math.max(4, Math.round(percentage)),
      sharePercentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      isUserRating: userRating != null && userRating === step,
    };
  });
}

/** The bucket holding the most ratings, or `null` when nothing was rated. */
export function mostCommonRating(
  hist: PartialRatingHistogram | null | undefined,
): StarRating | null {
  const dense = toDenseHistogram(hist);
  let best: StarRating | null = null;
  let bestCount = 0;
  for (const step of STAR_RATING_STEPS) {
    if (dense[step] > bestCount) {
      bestCount = dense[step];
      best = step;
    }
  }
  return best;
}

/** Percentage of ratings at three stars or above. */
export function positiveRatingShare(
  hist: PartialRatingHistogram | null | undefined,
): number {
  const total = histogramTotal(hist);
  if (total <= 0) return 0;
  const positive = STAR_RATING_STEPS.filter((step) => step >= 3).reduce(
    (sum, step) => sum + (hist?.[step] ?? 0),
    0,
  );
  return Math.round((positive / total) * 100);
}

/** Descending-frequency ranking of genres derived from a film collection. */
export function rankGenres(
  genres: readonly string[],
): { genre: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const genre of genres) {
    tally.set(genre, (tally.get(genre) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}
