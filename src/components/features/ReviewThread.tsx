'use client';

/**
 * Review thread.
 *
 * Owns the ordering and visibility controls that sit above a list of
 * `ReviewCard`s: sort (recent / highest rated / most liked), a spoiler
 * visibility toggle, and an "only my reviews" filter. Sorting a short local
 * array is cheaper than re-querying, so the parent passes every review for the
 * film and this component derives the visible slice.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Review, ReviewSortKey } from '@/types/cine';
import { ReviewCard } from '@/components/compound/ReviewCard';

/** Minimal viewer shape needed to gate owner-only review controls. */
export interface ReviewThreadViewer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface ReviewThreadProps {
  reviews: Review[];
  /** Viewer used to gate owner-only controls on each card. */
  viewer?: ReviewThreadViewer | null;
  isLoading?: boolean;
  error?: string | null;
  /** Reveals every spoiler block at once. */
  defaultRevealSpoilers?: boolean;
  /** Shows the sort and filter toolbar. */
  showControls?: boolean;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  onEditReview?: (review: Review) => void;
  onDeleteReview?: (review: Review) => void;
  className?: string;
}

const SORT_OPTIONS: ReadonlyArray<{ key: ReviewSortKey; label: string }> = [
  { key: 'recent', label: 'Recent' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'likes', label: 'Most liked' },
];

function sortReviews(reviews: Review[], sortBy: ReviewSortKey): Review[] {
  const copy = [...reviews];
  switch (sortBy) {
    case 'rating':
      return copy.sort(
        (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt),
      );
    case 'likes':
      return copy.sort(
        (a, b) => b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt),
      );
    case 'recent':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function ReviewThread({
  reviews,
  viewer = null,
  isLoading = false,
  error = null,
  defaultRevealSpoilers = false,
  showControls = true,
  pageSize = 8,
  emptyTitle = 'No reviews yet',
  emptyDescription = 'Be the first to write out what you thought of this film.',
  onEditReview,
  onDeleteReview,
  className = '',
}: ReviewThreadProps) {
  const [sortBy, setSortBy] = useState<ReviewSortKey>('recent');
  const [revealSpoilers, setRevealSpoilers] = useState(defaultRevealSpoilers);
  const [onlyMine, setOnlyMine] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setRevealSpoilers(defaultRevealSpoilers);
  }, [defaultRevealSpoilers]);

  const sorted = useMemo(() => {
    const filtered =
      onlyMine && viewer ? reviews.filter((review) => review.userId === viewer.id) : reviews;
    return sortReviews(filtered, sortBy);
  }, [onlyMine, reviews, sortBy, viewer]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, sortBy, onlyMine]);

  const handleSortChange = useCallback((key: ReviewSortKey) => setSortBy(key), []);

  if (isLoading) {
    return (
      <div className={`flex flex-col gap-3 ${className}`} role="status" aria-live="polite">
        <span className="sr-only">Loading reviews</span>
        {Array.from({ length: 3 }, (_unused, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded border border-border-subtle bg-surface-panel p-4"
          >
            <span className="flex items-center gap-3">
              <span className="h-9 w-9 animate-pulse rounded-full bg-surface-hover" />
              <span className="h-3 w-32 animate-pulse rounded bg-surface-hover" />
            </span>
            <span className="h-3 w-full animate-pulse rounded bg-surface-hover" />
            <span className="h-3 w-5/6 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded border border-brand-orange/40 bg-brand-orange/5 px-4 py-5 text-center"
      >
        <p className="text-[12px] font-semibold text-brand-orange">{error}</p>
        <p className="mt-1 text-[11px] text-text-muted">
          Reviews are read from this browser&apos;s IndexedDB store.
        </p>
      </div>
    );
  }

  const visible = sorted.slice(0, visibleCount);
  const hasSpoilers = sorted.some((review) => review.containsSpoilers);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {showControls && reviews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Sort reviews"
            className="flex items-center gap-1 rounded border border-border-subtle bg-surface-panel p-1"
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSortChange(option.key)}
                aria-pressed={sortBy === option.key}
                className={`min-h-11 rounded px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  sortBy === option.key
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {hasSpoilers ? (
            <button
              type="button"
              onClick={() => setRevealSpoilers((current) => !current)}
              aria-pressed={revealSpoilers}
              className={`inline-flex min-h-11 items-center gap-2 rounded border px-3 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                revealSpoilers
                  ? 'border-brand-orange/50 bg-brand-orange/10 text-brand-orange'
                  : 'border-border-subtle bg-surface-panel text-text-muted hover:border-border-strong hover:text-text-secondary'
              }`}
            >
              {revealSpoilers ? (
                <ShieldAlert size={13} aria-hidden="true" />
              ) : (
                <ShieldCheck size={13} aria-hidden="true" />
              )}
              {revealSpoilers ? 'Spoilers visible' : 'Spoilers hidden'}
            </button>
          ) : null}

          {viewer ? (
            <button
              type="button"
              onClick={() => setOnlyMine((current) => !current)}
              aria-pressed={onlyMine}
              className={`inline-flex min-h-11 items-center gap-2 rounded border px-3 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                onlyMine
                  ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
                  : 'border-border-subtle bg-surface-panel text-text-muted hover:border-border-strong hover:text-text-secondary'
              }`}
            >
              Only mine
            </button>
          ) : null}

          <p className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-dim">
            {sorted.length} review{sorted.length === 1 ? '' : 's'}
          </p>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div
          className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center"
          role="status"
        >
          <MessageSquare size={20} aria-hidden="true" className="text-text-dim" />
          <p className="text-[13px] font-semibold text-text-secondary">
            {onlyMine ? 'You have not reviewed this film' : emptyTitle}
          </p>
          <p className="max-w-xs text-[11px] leading-relaxed text-text-muted">
            {onlyMine ? 'Turn off the "Only mine" filter to read everyone else.' : emptyDescription}
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((review) => (
              <li key={review.id}>
                <ReviewCard
                  review={review}
                  user={review.user ?? null}
                  film={review.film ?? null}
                  viewerId={viewer?.id}
                  spoilerRevealed={revealSpoilers}
                  onEdit={onEditReview ? () => onEditReview(review) : undefined}
                  onDelete={onDeleteReview ? () => onDeleteReview(review) : undefined}
                />
              </li>
            ))}
          </ul>

          {visibleCount < sorted.length ? (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + pageSize)}
              className="mx-auto inline-flex min-h-11 items-center rounded border border-border-strong px-5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
            >
              Load {Math.min(pageSize, sorted.length - visibleCount)} more review
              {Math.min(pageSize, sorted.length - visibleCount) === 1 ? '' : 's'}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default ReviewThread;
