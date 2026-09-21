'use client';

/**
 * Poster card used by every film grid, rail and carousel.
 *
 * Interaction contract (per the viewport matrix):
 * - The poster is always a real `<Link>`, so navigation works without JS and is
 *   keyboard-operable with a visible focus ring.
 * - Quick actions live in an overlay above the link and `stopPropagation` on
 *   pointer-down, so tapping a heart never navigates.
 * - The overlay is revealed on hover for pointer devices (`@media (hover:hover)`
 *   is not required — `group-hover` plus `focus-within` covers keyboard too) and
 *   sits permanently visible on touch, where hover does not exist.
 */

import Link from 'next/link';
import { Bookmark, Heart, Plus } from 'lucide-react';
import type { Film, StarRating } from '@/types/cine';
import { PosterImage } from '@/components/ui/PosterImage';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import { formatCount } from '@/lib/utils/date-format';

export interface FilmCardProps {
  film: Film;
  /** The viewer's own rating, shown in place of the community average. */
  userRating?: StarRating | null;
  isLiked?: boolean;
  /** `undefined` hides the watchlist toggle entirely. */
  isInWatchlist?: boolean;
  onToggleLike?: (film: Film, nextLiked: boolean) => void;
  onToggleWatchlist?: (film: Film, nextInWatchlist: boolean) => void;
  onQuickLog?: (film: Film) => void;
  /** Hides the title/meta block — used by tight carousels. */
  showMeta?: boolean;
  /** Locks the grid to three columns of pure posters on small screens. */
  compact?: boolean;
  priority?: boolean;
  className?: string;
}

export function FilmCard({
  film,
  userRating = null,
  isLiked = false,
  isInWatchlist,
  onToggleLike,
  onToggleWatchlist,
  onQuickLog,
  showMeta = true,
  compact = false,
  priority = false,
  className = '',
}: FilmCardProps) {
  const hasQuickActions =
    onToggleLike !== undefined ||
    onToggleWatchlist !== undefined ||
    onQuickLog !== undefined;

  const ratingLabel =
    userRating && userRating > 0
      ? `Your rating ${userRating}`
      : `Community rating ${formatCommunityRating(film.metrics.communityRating)}`;

  return (
    <article className={`group/card relative flex flex-col ${className}`}>
      <Link
        href={`/films/${film.slug}`}
        aria-label={`${film.title} (${film.releaseYear}) — ${ratingLabel}`}
        className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg"
      >
        <PosterImage
          src={film.posterUrl}
          title={film.title}
          sizeHint="grid"
          priority={priority}
          decorative={false}
        >
          {/* Bottom scrim: keeps the rating chip legible over bright artwork. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent opacity-90"
          />

          <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-primary backdrop-blur-sm">
            {film.metrics.communityRating > 0 ? (
              <>
                <span className="text-brand-green" aria-hidden="true">
                  ★
                </span>
                {formatCommunityRating(film.metrics.communityRating)}
              </>
            ) : (
              <span className="text-text-muted">No ratings</span>
            )}
          </span>

          {isLiked ? (
            <span
              className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm"
              aria-hidden="true"
            >
              <Heart size={11} className="fill-brand-orange text-brand-orange" />
            </span>
          ) : null}
        </PosterImage>
      </Link>

      {hasQuickActions ? (
        <div
          className={`absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full border border-border-strong bg-surface-bg/90 p-0.5 backdrop-blur-sm transition-opacity duration-150 focus-within:opacity-100 ${
            compact
              ? 'opacity-100'
              : 'opacity-100 md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100'
          }`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {onToggleLike ? (
            <button
              type="button"
              onClick={() => onToggleLike(film, !isLiked)}
              aria-pressed={isLiked}
              aria-label={
                isLiked ? `Remove like from ${film.title}` : `Like ${film.title}`
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Heart
                size={14}
                aria-hidden="true"
                className={isLiked ? 'fill-brand-orange text-brand-orange' : ''}
              />
            </button>
          ) : null}

          {onToggleWatchlist && isInWatchlist !== undefined ? (
            <button
              type="button"
              onClick={() => onToggleWatchlist(film, !isInWatchlist)}
              aria-pressed={isInWatchlist}
              aria-label={
                isInWatchlist
                  ? `Remove ${film.title} from watchlist`
                  : `Add ${film.title} to watchlist`
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Bookmark
                size={14}
                aria-hidden="true"
                className={isInWatchlist ? 'fill-brand-cyan text-brand-cyan' : ''}
              />
            </button>
          ) : null}

          {onQuickLog ? (
            <button
              type="button"
              onClick={() => onQuickLog(film)}
              aria-label={`Log ${film.title}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-green transition-colors hover:bg-brand-green/15"
            >
              <Plus size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {showMeta ? (
        <div className="mt-2 flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/films/${film.slug}`}
            className="truncate text-xs font-semibold text-text-primary transition-colors hover:text-brand-green sm:text-[13px]"
          >
            {film.title}
          </Link>

          <div className="flex items-center gap-2">
            {userRating && userRating > 0 ? (
              <StarRatingDisplay rating={userRating} size="sm" />
            ) : film.metrics.communityRating > 0 ? (
              <StarRatingDisplay rating={film.metrics.communityRating} size="sm" />
            ) : null}
            <span className="tabular font-mono text-[10px] text-text-muted">
              {film.releaseYear}
            </span>
          </div>

          {compact ? null : (
            <span className="tabular truncate font-mono text-[10px] text-text-dim">
              {formatCount(film.metrics.logCount)} logs
            </span>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default FilmCard;
