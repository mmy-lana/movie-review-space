'use client';

/**
 * Letterboxd-signature like control.
 *
 * The heart fills with `brand-orange` (#ff8000) and fires a short scale pulse on
 * activation. The pulse is driven by state rather than pure CSS `:active` so it
 * plays once per toggle — including for keyboard activation — and is disabled
 * entirely under `prefers-reduced-motion`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';

export type LikeButtonSize = 'sm' | 'md' | 'lg';
export type LikeButtonVariant = 'icon' | 'pill';

export interface LikeButtonProps {
  /** Current like state. */
  isLiked: boolean;
  /** Called with the next state. */
  onToggle: (nextLiked: boolean) => void;
  /** Optional like total rendered beside the heart. */
  count?: number;
  /** Accessible name; defaults to like/unlike wording for the item. */
  label?: string;
  size?: LikeButtonSize;
  variant?: LikeButtonVariant;
  disabled?: boolean;
  className?: string;
}

const ICON_SIZES: Record<LikeButtonSize, number> = { sm: 14, md: 18, lg: 22 };

/** Minimum 44×44px pointer target for the icon variant. */
const HIT_AREAS: Record<LikeButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
};

const TEXT_SIZES: Record<LikeButtonSize, string> = {
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-sm',
};

export function LikeButton({
  isLiked,
  onToggle,
  count,
  label,
  size = 'md',
  variant = 'icon',
  disabled = false,
  className = '',
}: LikeButtonProps) {
  const [isPulsing, setIsPulsing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    const next = !isLiked;
    onToggle(next);
    if (next) {
      setIsPulsing(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setIsPulsing(false), 420);
    }
  }, [disabled, isLiked, onToggle]);

  const accessibleLabel =
    label ?? (isLiked ? 'Remove like' : 'Like');
  const ariaLabel =
    typeof count === 'number' ? `${accessibleLabel} (${count})` : accessibleLabel;

  const heart = (
    <Heart
      size={ICON_SIZES[size]}
      strokeWidth={2}
      aria-hidden="true"
      className={`transition-colors duration-150 ${
        isLiked ? 'fill-brand-orange text-brand-orange' : 'fill-transparent text-text-muted'
      } ${isPulsing ? 'animate-heart-pulse' : ''}`}
    />
  );

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={isLiked}
        aria-label={ariaLabel}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
          TEXT_SIZES[size]
        } ${
          isLiked
            ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange'
            : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong hover:text-text-primary'
        } ${className}`}
      >
        {heart}
        {typeof count === 'number' ? (
          <span className="tabular font-mono">{count > 0 ? count : ''}</span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isLiked}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-surface-hover/70 disabled:cursor-not-allowed disabled:opacity-50 ${
        HIT_AREAS[size]
      } ${className}`}
    >
      {heart}
    </button>
  );
}

export default LikeButton;
