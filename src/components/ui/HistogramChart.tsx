'use client';

/**
 * Letterboxd rating-distribution histogram.
 *
 * Ten vertical bars scaled against the tallest bucket, with the viewer's own
 * rating highlighted in `brand-green`. Every bar is a real button so the chart
 * is fully operable by pointer, touch, keyboard (`Tab` + `Enter`/`Space`) and
 * assistive technology; hovering, focusing or tapping a bar reveals its exact
 * count and share.
 */

import { useCallback, useId, useMemo, useState } from 'react';
import type { PartialRatingHistogram, StarRating } from '@/types/cine';
import {
  formatRatingDisplay,
  getHistogramPercentages,
  histogramTotal,
  mostCommonRating,
  positiveRatingShare,
} from '@/lib/utils/rating-math';
import { formatCount } from '@/lib/utils/date-format';

export interface HistogramChartProps {
  /** Sparse or dense histogram keyed by the ten rating steps. */
  histogram: PartialRatingHistogram | null | undefined;
  /** The viewer's rating, highlighted in the active brand colour. */
  userRating?: StarRating | null;
  /** Authoritative total; falls back to the histogram sum when omitted. */
  totalRatings?: number;
  /** Bar rail height in pixels (tooltip and labels sit outside this box). */
  heightPx?: number;
  /** Invoked when a bar is activated (used to filter by rating). */
  onSelectRating?: (rating: StarRating) => void;
  /** Hides the axis captions for dense embeds. */
  compact?: boolean;
  className?: string;
}

interface ActiveState {
  rating: StarRating;
  source: 'pointer' | 'focus' | 'click';
}

export function HistogramChart({
  histogram,
  userRating = null,
  totalRatings,
  heightPx = 48,
  onSelectRating,
  compact = false,
  className = '',
}: HistogramChartProps) {
  const reactId = useId();
  const descriptionId = `${reactId.replace(/[^a-zA-Z0-9-]/g, '')}-histogram-description`;

  const [active, setActive] = useState<ActiveState | null>(null);

  const total = totalRatings ?? histogramTotal(histogram);
  const bars = useMemo(
    () => getHistogramPercentages(histogram, userRating),
    [histogram, userRating],
  );

  const peak = useMemo(() => mostCommonRating(histogram), [histogram]);
  const positiveShare = useMemo(() => positiveRatingShare(histogram), [histogram]);

  const handleEnter = useCallback((rating: StarRating, source: ActiveState['source']) => {
    setActive({ rating, source });
  }, []);

  const handleLeave = useCallback((rating: StarRating, source: ActiveState['source']) => {
    setActive((current) =>
      current && current.rating === rating && current.source === source ? null : current,
    );
  }, []);

  const handleActivate = useCallback(
    (rating: StarRating) => {
      setActive((current) =>
        current && current.rating === rating && current.source === 'click'
          ? null
          : { rating, source: 'click' },
      );
      onSelectRating?.(rating);
    },
    [onSelectRating],
  );

  const activeBar = active ? bars.find((bar) => bar.rating === active.rating) ?? null : null;

  if (total <= 0) {
    return (
      <div
        className={`flex w-full max-w-[280px] flex-col items-center justify-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-6 text-center ${className}`}
        role="img"
        aria-label="No ratings recorded yet"
      >
        <span className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
          No ratings yet
        </span>
        <span className="text-[11px] leading-snug text-text-dim">
          Be the first to rate this film and the distribution will appear here.
        </span>
      </div>
    );
  }

  return (
    <div className={`flex w-full max-w-[320px] flex-col gap-1.5 ${className}`}>
      <div className="relative">
        {activeBar ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute -top-9 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center animate-zoom-in-95"
            style={{ animationDuration: '120ms' }}
          >
            <span className="whitespace-nowrap rounded border border-border-strong bg-surface-elevated px-2 py-1 font-mono text-[10px] text-text-primary shadow-popover">
              {formatRatingDisplay(activeBar.rating)} stars · {formatCount(activeBar.count)}{' '}
              rating{activeBar.count === 1 ? '' : 's'} · {activeBar.sharePercentage}%
            </span>
            <span className="-mt-1 h-1.5 w-1.5 rotate-45 border-b border-r border-border-strong bg-surface-elevated" />
          </div>
        ) : null}

        <div
          role="group"
          aria-label={`Rating distribution across ${formatCount(total)} ratings`}
          aria-describedby={descriptionId}
          className="flex items-end justify-between gap-[3px] rounded border border-border-subtle bg-surface-panel p-2"
          style={{ height: `${heightPx + 16}px` }}
        >
          {bars.map((bar) => {
            const isSelected = active?.rating === bar.rating;
            const barColor = bar.isUserRating
              ? 'bg-brand-green'
              : isSelected
                ? 'bg-text-secondary'
                : 'bg-text-dim hover:bg-text-muted';

            return (
              <button
                key={bar.rating}
                type="button"
                onClick={() => handleActivate(bar.rating)}
                onMouseEnter={() => handleEnter(bar.rating, 'pointer')}
                onMouseLeave={() => handleLeave(bar.rating, 'pointer')}
                onFocus={() => handleEnter(bar.rating, 'focus')}
                onBlur={() => handleLeave(bar.rating, 'focus')}
                aria-label={`${formatRatingDisplay(bar.rating)} stars: ${formatCount(
                  bar.count,
                )} ratings, ${bar.sharePercentage} percent${
                  bar.isUserRating ? ', your rating' : ''
                }`}
                aria-pressed={isSelected}
                className="flex h-full flex-1 cursor-pointer items-end justify-center rounded-sm px-[2px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-green"
              >
                <span
                  aria-hidden="true"
                  className={`w-full rounded-[1px] transition-[height,background-color] duration-200 ${barColor}`}
                  style={{
                    height: `${bar.heightPercentage}%`,
                    ...(bar.isUserRating
                      ? { boxShadow: '0 0 8px color-mix(in srgb, var(--color-brand-green) 45%, transparent)' }
                      : {}),
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {compact ? null : (
        <div className="tabular flex items-center justify-between px-1 font-mono text-[10px] text-text-muted select-none">
          <span>½★</span>
          {userRating ? (
            <span className="text-brand-green">★ your rating</span>
          ) : (
            <span>{positiveShare}% at 3★ or higher</span>
          )}
          <span>★★★★★</span>
        </div>
      )}

      <p id={descriptionId} className="sr-only">
        {`Distribution of ${formatCount(total)} ratings. Most common rating is ${
          peak ? formatRatingDisplay(peak) : 'unknown'
        } stars. ${positiveShare} percent of ratings are three stars or higher.`}
        {userRating
          ? ` Your rating of ${formatRatingDisplay(userRating)} stars is highlighted.`
          : ''}
      </p>
    </div>
  );
}

export default HistogramChart;
