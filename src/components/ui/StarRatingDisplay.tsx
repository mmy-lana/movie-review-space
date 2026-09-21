'use client';

/**
 * Five-star SVG renderer with full, half and empty fill states.
 *
 * Half stars use a per-instance linear gradient rather than two stacked paths,
 * so a half-filled star keeps crisp edges at every size and while animating.
 * The component is presentational: it exposes one accessible label and hides
 * the decorative glyphs from assistive technology.
 */

import { useId } from 'react';
import type { StarRating } from '@/types/cine';
import { formatRatingDisplay } from '@/lib/utils/rating-math';

export type StarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface StarRatingDisplayProps {
  /** Rating to visualise; `0` or `null` renders five empty stars. */
  rating: StarRating | number | null | undefined;
  size?: StarSize;
  /** Renders the numeric value beside the stars. */
  showNumeric?: boolean;
  /** Number of stars rendered across the track. */
  totalStars?: number;
  /** Dims the stars to the muted palette (dense metadata rows). */
  muted?: boolean;
  className?: string;
}

const STAR_PATH =
  'M12 2.6l2.95 5.98 6.6.96-4.78 4.65 1.13 6.57L12 17.66l-5.9 3.1 1.13-6.57L2.45 9.54l6.6-.96L12 2.6z';

const SIZE_CLASSES: Record<StarSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-5 w-5',
  xl: 'h-7 w-7',
};

const NUMERIC_CLASSES: Record<StarSize, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-lg',
};

/**
 * Builds the accessible label, e.g. "Rated 4.5 out of 5 stars" or "Not rated".
 */
function buildLabel(rating: number, totalStars: number): string {
  if (!Number.isFinite(rating) || rating <= 0) return 'Not rated';
  return `Rated ${formatRatingDisplay(rating)} out of ${totalStars} stars`;
}

export function StarRatingDisplay({
  rating,
  size = 'sm',
  showNumeric = false,
  totalStars = 5,
  muted = false,
  className = '',
}: StarRatingDisplayProps) {
  const reactId = useId();
  const gradientId = `star-half-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  const value = typeof rating === 'number' && Number.isFinite(rating) ? rating : 0;
  const clamped = Math.max(0, Math.min(totalStars, value));
  const stars = Array.from({ length: totalStars }, (_unused, index) => index + 1);

  const activeColor = muted ? 'var(--color-text-muted)' : 'var(--color-brand-green)';
  const emptyColor = 'var(--color-surface-hover)';

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      role="img"
      aria-label={buildLabel(clamped, totalStars)}
    >
      <span className="inline-flex items-center gap-[1px]" aria-hidden="true">
        {stars.map((starIndex) => {
          const isFull = clamped >= starIndex;
          const isHalf = !isFull && clamped >= starIndex - 0.5;

          return (
            <svg
              key={starIndex}
              viewBox="0 0 24 24"
              className={`shrink-0 ${SIZE_CLASSES[size]}`}
              focusable="false"
            >
              {isFull ? (
                <path d={STAR_PATH} fill={activeColor} />
              ) : isHalf ? (
                <>
                  <defs>
                    <linearGradient
                      id={`${gradientId}-${starIndex}`}
                      x1="0"
                      x2="1"
                      y1="0"
                      y2="0"
                    >
                      <stop offset="50%" stopColor={activeColor} />
                      <stop offset="50%" stopColor={emptyColor} />
                    </linearGradient>
                  </defs>
                  <path d={STAR_PATH} fill={`url(#${gradientId}-${starIndex})`} />
                </>
              ) : (
                <path d={STAR_PATH} fill={emptyColor} />
              )}
            </svg>
          );
        })}
      </span>

      {showNumeric ? (
        <span
          className={`tabular font-mono ${NUMERIC_CLASSES[size]} ${
            muted ? 'text-text-muted' : 'text-text-secondary'
          }`}
          aria-hidden="true"
        >
          {clamped > 0 ? formatRatingDisplay(clamped) : '—'}
        </span>
      ) : null}
    </span>
  );
}

export default StarRatingDisplay;
