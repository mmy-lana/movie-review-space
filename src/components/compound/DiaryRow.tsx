'use client';

/**
 * Compact chronological diary row.
 *
 * Desktop renders a Letterboxd-style table row (month/day · poster · title ·
 * rating · like · rewatch); below `sm` the same data collapses into a two-line
 * list item with a full-width tap target. Rows with a linked review expose a
 * separate "Review" affordance so the row itself stays a film link.
 */

import Link from 'next/link';
import { Heart, MessageSquare } from 'lucide-react';
import type { DiaryEntry } from '@/types/cine';
import { PosterImage } from '@/components/ui/PosterImage';
import { RewatchBadge } from '@/components/ui/Badge';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import {
  formatAccessibleTimestamp,
  formatDayOfMonth,
  formatMonthShort,
  formatRuntime,
} from '@/lib/utils/date-format';

export interface DiaryRowProps {
  entry: DiaryEntry;
  /** Renders the month/day column (default on tablet and up). */
  showDateColumn?: boolean;
  /** Optional review snippet shown under the title. */
  reviewSnippet?: string;
  /** Total likes on the linked review. */
  reviewLikeCount?: number;
  /** Opens the edit form for this log. */
  onEdit?: (entry: DiaryEntry) => void;
  /** Soft-deletes this log. */
  onDelete?: (entry: DiaryEntry) => void;
  /** Disables row interactions while a mutation is in flight. */
  isBusy?: boolean;
  className?: string;
}

export function DiaryRow({
  entry,
  showDateColumn = true,
  reviewSnippet,
  reviewLikeCount,
  onEdit,
  onDelete,
  isBusy = false,
  className = '',
}: DiaryRowProps) {
  const film = entry.film;
  const hasActions = onEdit !== undefined || onDelete !== undefined;

  return (
    <li
      className={`group/row relative flex items-center gap-3 border-b border-border-subtle px-2 py-2.5 transition-colors last:border-b-0 hover:bg-surface-panel/60 sm:gap-4 sm:px-3 ${
        isBusy ? 'pointer-events-none opacity-60' : ''
      } ${className}`}
    >
      {showDateColumn ? (
        <time
          dateTime={entry.watchedDate}
          title={formatAccessibleTimestamp(entry.watchedDate)}
          className="tabular hidden w-12 shrink-0 flex-col items-center leading-none sm:flex"
        >
          <span className="font-mono text-base font-bold text-text-primary">
            {formatDayOfMonth(entry.watchedDate)}
          </span>
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {formatMonthShort(entry.watchedDate)}
          </span>
        </time>
      ) : null}

      <Link
        href={film ? `/films/${film.slug}` : '#'}
        className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
        aria-hidden="true"
        tabIndex={-1}
      >
        <PosterImage
          src={film?.posterUrl ?? null}
          title={film?.title ?? 'Unknown film'}
          sizeHint="row"
          decorative
          className="!w-10 sm:!w-[52px]"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link
            href={film ? `/films/${film.slug}` : '#'}
            className="truncate text-[13px] font-semibold text-text-primary transition-colors hover:text-brand-green sm:text-sm"
          >
            {film?.title ?? 'Unknown film'}
          </Link>
          <span className="tabular shrink-0 font-mono text-[11px] text-text-muted">
            {film?.releaseYear ?? '—'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StarRatingDisplay rating={entry.rating} size="sm" showNumeric />
          {entry.isLiked ? (
            <span title="Liked" className="inline-flex">
              <Heart
                size={12}
                aria-hidden="true"
                className="fill-brand-orange text-brand-orange"
              />
              <span className="sr-only">Liked</span>
            </span>
          ) : null}
          {entry.isRewatch ? <RewatchBadge /> : null}
          {film ? (
            <span className="tabular hidden font-mono text-[10px] text-text-dim sm:inline">
              {formatRuntime(film.runtimeMinutes)}
            </span>
          ) : null}
          <time
            dateTime={entry.watchedDate}
            className="tabular font-mono text-[10px] text-text-dim sm:hidden"
          >
            {formatDayOfMonth(entry.watchedDate)} {formatMonthShort(entry.watchedDate)}
          </time>
        </div>

        {reviewSnippet ? (
          <Link
            href={
              film && entry.reviewId
                ? `/films/${film.slug}/reviews#review-${entry.reviewId}`
                : film
                  ? `/films/${film.slug}`
                  : '#'
            }
            className="mt-0.5 flex min-h-6 items-center gap-1.5 text-[11px] italic leading-snug text-text-muted transition-colors hover:text-text-secondary"
          >
            <MessageSquare size={11} aria-hidden="true" className="shrink-0" />
            <span className="line-clamp-1">{reviewSnippet}</span>
            {typeof reviewLikeCount === 'number' && reviewLikeCount > 0 ? (
              <span className="tabular shrink-0 font-mono text-brand-orange">
                ♥ {reviewLikeCount}
              </span>
            ) : null}
          </Link>
        ) : null}
      </div>

      {hasActions ? (
        <div className="flex shrink-0 items-center gap-1">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="inline-flex min-h-9 items-center rounded border border-border-subtle px-2 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
              aria-label={`Edit log for ${film?.title ?? 'this film'}`}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(entry)}
              className="inline-flex min-h-9 items-center rounded border border-border-subtle px-2 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-brand-orange/60 hover:text-brand-orange"
              aria-label={`Delete log for ${film?.title ?? 'this film'}`}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default DiaryRow;
