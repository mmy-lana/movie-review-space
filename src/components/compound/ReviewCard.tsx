'use client';

/**
 * Full review card: author, rating, watch context and Markdown body.
 *
 * Spoiler handling is delegated to `SpoilerMask`, so a flagged review is never
 * mounted into the accessibility tree until it is deliberately revealed.
 */

import Link from 'next/link';
import { Heart, MessageSquare, MoreHorizontal } from 'lucide-react';
import type { Film, Review, UserProfile } from '@/types/cine';
import { Badge, RewatchBadge } from '@/components/ui/Badge';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { LikeButton } from '@/components/ui/LikeButton';
import { MarkdownBody } from '@/components/ui/MarkdownBody';
import { SpoilerMask } from '@/components/compound/SpoilerMask';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { formatAccessibleTimestamp, formatDiaryDate, formatRuntime } from '@/lib/utils/date-format';

export interface ReviewCardProps {
  review: Review;
  /** Hydrated film relation; supply `showFilmHeader` to render it. */
  film?: Film | null;
  /** Hydrated author relation; falls back to `review.user`. */
  user?: UserProfile | null;
  /** The signed-in user id, used to decide ownership affordances. */
  viewerId?: string;
  /** Whether the viewer has liked this review. */
  isReviewLiked?: boolean;
  onToggleReviewLike?: (review: Review, nextLiked: boolean) => void;
  /** Overrides the reveal state of a spoiler-flagged body. */
  spoilerRevealed?: boolean;
  onSpoilerRevealedChange?: (revealed: boolean) => void;
  onEdit?: (review: Review) => void;
  onDelete?: (review: Review) => void;
  /** Renders a poster + title strip above the review (profile & feed views). */
  showFilmHeader?: boolean;
  /** Renders the review body without truncation. */
  priority?: boolean;
  className?: string;
}

export function ReviewCard({
  review,
  film,
  user,
  viewerId,
  isReviewLiked = false,
  onToggleReviewLike,
  spoilerRevealed,
  onSpoilerRevealedChange,
  onEdit,
  onDelete,
  showFilmHeader = false,
  priority = false,
  className = '',
}: ReviewCardProps) {
  const author = user ?? review.user ?? null;
  const subject = film ?? review.film ?? null;
  const isOwner = viewerId !== undefined && viewerId === review.userId;

  const watchContext = formatDiaryDate(review.watchedDate, { withWeekday: false });

  const menuItems: DropdownMenuItem[] = [];
  if (isOwner && onEdit) {
    menuItems.push({ id: 'edit', label: 'Edit review', onSelect: () => onEdit(review) });
  }
  if (isOwner && onDelete) {
    menuItems.push({
      id: 'delete',
      label: 'Delete review',
      onSelect: () => onDelete(review),
      tone: 'danger',
      separated: menuItems.length > 0,
    });
  }

  const body = (
    <MarkdownBody
      source={review.reviewBody}
      emptyFallback={
        <p className="text-[13px] italic text-text-muted">No written review — rating only.</p>
      }
    />
  );

  return (
    <article
      className={`rounded border border-border-subtle bg-surface-panel p-3 transition-colors sm:p-4 ${
        priority ? 'border-border-strong' : ''
      } ${className}`}
    >
      {showFilmHeader && subject ? (
        <div className="mb-3 flex items-center gap-3 border-b border-border-subtle pb-3">
          <Link
            href={`/films/${subject.slug}`}
            className="poster-frame h-[54px] w-9 shrink-0"
            aria-hidden="true"
            tabIndex={-1}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={subject.posterUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/films/${subject.slug}`}
              className="block truncate text-sm font-bold text-text-primary transition-colors hover:text-brand-green"
            >
              {subject.title}
            </Link>
            <p className="tabular font-mono text-[11px] text-text-muted">
              {subject.releaseYear} · {formatRuntime(subject.runtimeMinutes)}
              {subject.directors[0] ? ` · ${subject.directors[0].name}` : ''}
            </p>
          </div>
          <StarRatingDisplay rating={review.rating} size="md" showNumeric />
        </div>
      ) : null}

      <header className="flex items-start gap-3">
        <Link
          href={author ? `/profile/${author.username}` : '#'}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
          aria-label={author ? `View ${author.displayName}'s profile` : 'View profile'}
        >
          {author?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatarUrl}
              alt=""
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              className="h-8 w-8 rounded-full border border-border-subtle object-cover sm:h-10 sm:w-10"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-surface-hover font-mono text-[11px] font-bold text-text-secondary sm:h-10 sm:w-10"
            >
              {(author?.displayName ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link
              href={author ? `/profile/${author.username}` : '#'}
              className="text-[13px] font-bold text-text-primary transition-colors hover:text-brand-green"
            >
              {author?.displayName ?? 'Unknown viewer'}
            </Link>
            <Link
              href={author ? `/profile/${author.username}` : '#'}
              className="font-mono text-[11px] text-text-muted transition-colors hover:text-text-secondary"
            >
              @{author?.username ?? 'unknown'}
            </Link>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {showFilmHeader ? null : (
              <StarRatingDisplay rating={review.rating} size="md" showNumeric />
            )}
            <time
              dateTime={review.watchedDate}
              title={formatAccessibleTimestamp(review.watchedDate)}
              className="font-mono text-[11px] text-text-muted"
            >
              {watchContext}
            </time>
            {review.isRewatch ? <RewatchBadge /> : null}
            {review.isLiked ? (
              <Badge tone="orange" size="xs" title={`${author?.displayName ?? 'They'} liked this film`}>
                <Heart size={9} aria-hidden="true" className="fill-brand-orange" />
                Liked
              </Badge>
            ) : null}
          </div>
        </div>

        {menuItems.length > 0 ? (
          <DropdownMenu
            items={menuItems}
            label={`Actions for ${author?.displayName ?? 'this review'}`}
            renderTrigger={(triggerProps) => (
              <button
                ref={triggerProps.ref}
                type="button"
                onClick={triggerProps.onClick}
                aria-haspopup="menu"
                aria-expanded={triggerProps['aria-expanded']}
                aria-label={`Review actions for ${author?.displayName ?? 'this review'}`}
                className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            )}
          />
        ) : null}
      </header>

      <div className="mt-3 pl-0 sm:pl-[52px]">
        {review.containsSpoilers ? (
          <SpoilerMask
            revealed={spoilerRevealed}
            onRevealedChange={onSpoilerRevealedChange}
            warningText="This review contains spoilers"
          >
            {body}
          </SpoilerMask>
        ) : (
          body
        )}
      </div>

      <footer className="mt-3 flex items-center gap-4 border-t border-border-subtle pt-2.5 sm:pl-[52px]">
        <LikeButton
          isLiked={isReviewLiked}
          onToggle={(next) => onToggleReviewLike?.(review, next)}
          count={review.likeCount}
          variant="pill"
          size="sm"
          label={isReviewLiked ? 'Unlike this review' : 'Like this review'}
          disabled={onToggleReviewLike === undefined}
        />

        <Link
          href={subject ? `/films/${subject.slug}/reviews#review-${review.id}` : '#'}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-input px-3 font-mono text-[11px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          aria-label={`${review.commentCount} comments on this review`}
        >
          <MessageSquare size={13} aria-hidden="true" />
          <span className="tabular">{review.commentCount}</span>
        </Link>

        {subject && !showFilmHeader ? (
          <Link
            href={`/films/${subject.slug}`}
            className="ml-auto truncate text-[11px] text-text-muted transition-colors hover:text-brand-cyan"
          >
            {subject.title} →
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

export default ReviewCard;
