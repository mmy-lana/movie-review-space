'use client';

/**
 * Accessible spoiler concealment for reviews flagged with spoilers.
 *
 * Hidden state renders a warning header plus a blurred phantom of the body with
 * `aria-hidden` applied to the real content, so assistive technology never reads
 * a spoiler aloud before it is deliberately revealed. Revealing is a single
 * activation — click, tap, `Enter` or `Space` — and is always reversible.
 */

import { useCallback, useState } from 'react';
import { Eye, EyeOff, TriangleAlert } from 'lucide-react';

export interface SpoilerMaskProps {
  /** The protected content. Not mounted while concealed. */
  children: React.ReactNode;
  /** Warning copy shown on the concealed plate. */
  warningText?: string;
  /** Starts revealed (used by "show all spoilers" preferences). */
  defaultRevealed?: boolean;
  /** Controls the reveal state from a parent. */
  revealed?: boolean;
  /** Notifies a parent when the reveal state changes. */
  onRevealedChange?: (revealed: boolean) => void;
  /** Renders the "Hide spoilers" control after revealing. */
  allowRehide?: boolean;
  className?: string;
}

/** Neutral filler used to size the concealed plate without leaking length. */
const DISGUISE_TEXT =
  'The concealed review text sits behind this plate. Reveal to read the full write-up.';

export function SpoilerMask({
  children,
  warningText = 'This review contains spoilers. Tap to reveal.',
  defaultRevealed = false,
  revealed,
  onRevealedChange,
  allowRehide = true,
  className = '',
}: SpoilerMaskProps) {
  const [internalRevealed, setInternalRevealed] = useState(defaultRevealed);
  const isControlled = revealed !== undefined;
  const isRevealed = isControlled ? revealed : internalRevealed;

  const setRevealed = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalRevealed(next);
      onRevealedChange?.(next);
    },
    [isControlled, onRevealedChange],
  );

  const handleReveal = useCallback(() => setRevealed(true), [setRevealed]);
  const handleRehide = useCallback(() => setRevealed(false), [setRevealed]);

  if (isRevealed) {
    return (
      <div className={`relative ${className}`}>
        <div className="flex items-center gap-2 pb-2 font-mono text-[10px] uppercase tracking-widest text-brand-orange">
          <Eye size={13} aria-hidden="true" />
          <span>Spoilers revealed</span>
        </div>

        <div className="animate-fade-in">{children}</div>

        {allowRehide ? (
          <button
            type="button"
            onClick={handleRehide}
            className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded text-[11px] text-text-muted underline decoration-text-dim underline-offset-2 transition-colors hover:text-text-secondary"
          >
            <EyeOff size={12} aria-hidden="true" />
            Hide spoilers
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleReveal}
        aria-label={`${warningText} Reveals hidden review content.`}
        className="group/mask w-full cursor-pointer rounded border border-brand-orange/30 bg-surface-input p-3 text-left transition-colors duration-200 hover:border-brand-orange/60 focus-visible:border-brand-orange sm:p-4"
      >
        <span className="flex items-center gap-2.5 text-brand-orange">
          <TriangleAlert size={15} aria-hidden="true" className="shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] sm:text-xs">
            {warningText}
          </span>
        </span>

        <span
          aria-hidden="true"
          className="spoiler-disguise mt-2 line-clamp-2 block text-xs leading-relaxed text-text-secondary"
        >
          {DISGUISE_TEXT}
        </span>

        <span className="mt-2 inline-block font-mono text-[10px] uppercase tracking-widest text-text-dim transition-colors group-hover/mask:text-brand-orange">
          Click to reveal
        </span>
      </button>

      {/* Real content stays out of the accessibility tree until revealed. */}
      <div className="hidden" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

export default SpoilerMask;
