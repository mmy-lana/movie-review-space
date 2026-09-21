'use client';

/**
 * Ten-step precision rating control (0.5 → 5.0).
 *
 * Interaction model:
 * - Pointer: `pointerdown` + `pointermove` + `pointerup` with pointer capture,
 *   so one continuous touch drag scrubs the whole track on mobile while a mouse
 *   click resolves on the first press. Positions come from raw `clientX` values,
 *   never from hover-only state.
 * - Keyboard: the track is a single `slider` stop. `ArrowRight`/`ArrowUp`
 *   increments by 0.5, `ArrowLeft`/`ArrowDown` decrements by 0.5, `Home`/`End`
 *   jump to the bounds, and `0`/`Delete`/`Backspace` clear the rating.
 * - `Escape` while previewing discards the uncommitted preview without altering
 *   the stored rating.
 *
 * Clearing is always explicit through the "Clear rating" control, so a pointer
 * that lands left of the first star can never silently unset a rating.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { StarRating } from '@/types/cine';
import {
  calculateStarFromPointer,
  formatRatingDisplay,
  normalizeRating,
  ratingToPercent,
  stepRating,
} from '@/lib/utils/rating-math';

export type RatingSize = 'sm' | 'md' | 'lg';

export interface StarRatingInputProps {
  /** Current committed rating; `null` or `0` means unrated. */
  value: StarRating | 0 | null;
  /** Receives the next rating, or `0` when cleared. */
  onChange: (rating: StarRating | 0) => void;
  /** Accessible name for the control. */
  label?: string;
  /** Renders the numeric read-out beside the stars. */
  showNumeric?: boolean;
  /** Disables interaction (used while a write is in flight). */
  disabled?: boolean;
  /** Hides the clear control for compact inline rating widgets. */
  allowClear?: boolean;
  size?: RatingSize;
  className?: string;
}

const STAR_PATH =
  'M12 2.6l2.95 5.98 6.6.96-4.78 4.65 1.13 6.57L12 17.66l-5.9 3.1 1.13-6.57L2.45 9.54l6.6-.96L12 2.6z';

const SIZE_CLASSES: Record<RatingSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

/** Vertical hit area per size — always ≥ 32px, 44px+ at `lg`. */
const TRACK_HEIGHTS: Record<RatingSize, string> = {
  sm: 'h-8',
  md: 'h-11',
  lg: 'h-12',
};

const NUMERIC_CLASSES: Record<RatingSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const TOTAL_STARS = 5;
const STEP = 0.5;
/** Lowest legal rating, used when the track has not been laid out yet. */
const FALLBACK_RATING: StarRating = 0.5;

function toRating(value: StarRating | 0 | null | undefined): StarRating | 0 {
  if (value === null || value === undefined) return 0;
  return normalizeRating(value);
}

export function StarRatingInput({
  value,
  onChange,
  label = 'Rate this film',
  showNumeric = true,
  disabled = false,
  allowClear = true,
  size = 'md',
  className = '',
}: StarRatingInputProps) {
  const reactId = useId();
  const gradientId = `input-half-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingXRef = useRef<number | null>(null);

  const [preview, setPreview] = useState<StarRating | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const committed = toRating(value);
  const display = preview ?? committed;

  const stars = useMemo(
    () => Array.from({ length: TOTAL_STARS }, (_unused, index) => index + 1),
    [],
  );

  const resolveFromPointer = useCallback((clientX: number): StarRating => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return FALLBACK_RATING;
    return calculateStarFromPointer(clientX, rect, TOTAL_STARS);
  }, []);

  /** Coalesces pointermove bursts into one preview update per frame. */
  const schedulePreview = useCallback(
    (clientX: number) => {
      pendingXRef.current = clientX;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const x = pendingXRef.current;
        if (x === null) return;
        pendingXRef.current = null;
        setPreview(resolveFromPointer(x));
      });
    },
    [resolveFromPointer],
  );

  const cancelScheduledPreview = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingXRef.current = null;
  }, []);

  useEffect(() => cancelScheduledPreview, [cancelScheduledPreview]);

  const commit = useCallback(
    (next: StarRating | 0) => {
      if (disabled) return;
      onChange(next);
    },
    [disabled, onChange],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      const next = resolveFromPointer(event.clientX);
      setPreview(next);
      commit(next);
    },
    [commit, disabled, resolveFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (isDragging) {
        const next = resolveFromPointer(event.clientX);
        setPreview(next);
        commit(next);
        return;
      }
      schedulePreview(event.clientX);
    },
    [commit, disabled, isDragging, resolveFromPointer, schedulePreview],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      cancelScheduledPreview();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!isDragging) return;
      setIsDragging(false);
      const next = resolveFromPointer(event.clientX);
      setPreview(next);
      commit(next);
    },
    [cancelScheduledPreview, commit, disabled, isDragging, resolveFromPointer],
  );

  const handlePointerLeave = useCallback(() => {
    cancelScheduledPreview();
    if (!isDragging) setPreview(null);
  }, [cancelScheduledPreview, isDragging]);

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      cancelScheduledPreview();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsDragging(false);
      setPreview(null);
    },
    [cancelScheduledPreview],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const current = preview ?? committed;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          event.preventDefault();
          setPreview(null);
          commit(stepRating(current, 1) as StarRating);
          return;
        case 'ArrowLeft':
        case 'ArrowDown':
          event.preventDefault();
          setPreview(null);
          commit(stepRating(current, -1) as StarRating);
          return;
        case 'Home':
          event.preventDefault();
          setPreview(null);
          commit(0.5);
          return;
        case 'End':
          event.preventDefault();
          setPreview(null);
          commit(5);
          return;
        case '0':
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          setPreview(null);
          commit(0);
          return;
        case 'Escape':
          if (preview !== null) {
            event.preventDefault();
            setPreview(null);
          }
          return;
        default:
          return;
      }
    },
    [commit, committed, disabled, preview],
  );

  const handleClear = useCallback(() => {
    cancelScheduledPreview();
    setPreview(null);
    commit(0);
  }, [cancelScheduledPreview, commit]);

  const percent = ratingToPercent(display, TOTAL_STARS);
  const fillColor = disabled ? 'var(--color-text-dim)' : 'var(--color-brand-green)';
  const emptyColor = 'var(--color-surface-hover)';
  const isPreviewing = preview !== null && preview !== committed;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-3">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={TOTAL_STARS}
          aria-valuenow={committed}
          aria-valuetext={
            committed > 0 ? `${formatRatingDisplay(committed)} out of 5 stars` : 'Not rated'
          }
          aria-disabled={disabled || undefined}
          aria-orientation="horizontal"
          data-previewing={isPreviewing ? 'true' : undefined}
          data-fill-percent={Math.round(percent)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          className={`rating-track relative inline-flex min-w-[220px] flex-1 items-center justify-between rounded-sm px-1 sm:flex-none ${TRACK_HEIGHTS[size]} ${
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
          }`}
        >
          {stars.map((starIndex) => {
            const isFull = display >= starIndex;
            const isHalf = !isFull && display >= starIndex - STEP;

            return (
              <span
                key={starIndex}
                className="pointer-events-none flex flex-1 items-center justify-center"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`${SIZE_CLASSES[size]} shrink-0`}
                  focusable="false"
                  aria-hidden="true"
                >
                  {isFull ? (
                    <path d={STAR_PATH} fill={fillColor} />
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
                          <stop offset="50%" stopColor={fillColor} />
                          <stop offset="50%" stopColor={emptyColor} />
                        </linearGradient>
                      </defs>
                      <path d={STAR_PATH} fill={`url(#${gradientId}-${starIndex})`} />
                    </>
                  ) : (
                    <path d={STAR_PATH} fill={emptyColor} />
                  )}
                </svg>
              </span>
            );
          })}
        </div>

        {showNumeric ? (
          <span
            className={`tabular w-12 shrink-0 text-right font-mono ${NUMERIC_CLASSES[size]} ${
              isPreviewing ? 'text-brand-green' : 'text-text-secondary'
            }`}
            aria-hidden="true"
          >
            {display > 0 ? formatRatingDisplay(display) : '—'}
          </span>
        ) : null}
      </div>

      {allowClear ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || (committed === 0 && preview === null)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-2 text-[11px] font-medium text-text-muted underline decoration-text-dim underline-offset-2 transition-colors hover:text-text-secondary disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
          >
            Clear rating
          </button>
          <span className="text-[11px] text-text-dim">
            Half-star precision · arrow keys adjust by 0.5
          </span>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {isPreviewing
          ? `Previewing ${formatRatingDisplay(preview)} stars, not yet saved`
          : committed > 0
            ? `Current rating ${formatRatingDisplay(committed)} stars`
            : 'No rating set'}
      </span>
    </div>
  );
}

export default StarRatingInput;
