'use client';

/**
 * Friend activity feed.
 *
 * Renders the persisted `ActivityEvent` rows as a chronological stream with a
 * per-event-type verb, poster thumbnail, rating chip and relative timestamp.
 * Each event is a link to the film it references (or the list/profile it
 * created), and the whole list is a single `feed` landmark for screen readers.
 */

import Link from 'next/link';
import {
  Bookmark,
  Heart,
  MessageSquare,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import type { ActivityEvent, ActivityType } from '@/types/cine';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { formatAccessibleTimestamp, formatRelativeActivity } from '@/lib/utils/date-format';

export interface ActivityStreamProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  error?: string | null;
  /** Caps the rendered rows; the parent passes the full page slice. */
  limit?: number;
  /** Copy for the empty state. */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

const VERB_BY_TYPE: Record<ActivityType, string> = {
  LOG_FILM: 'watched',
  REVIEW_FILM: 'reviewed',
  LIKE_REVIEW: 'liked a review of',
  CREATE_LIST: 'created a list',
  FOLLOW_USER: 'started following',
};

function EventIcon({ type }: { type: ActivityType }) {
  const common = { size: 12, 'aria-hidden': true as const };
  switch (type) {
    case 'REVIEW_FILM':
      return <MessageSquare {...common} className="text-brand-cyan" />;
    case 'LIKE_REVIEW':
      return <Heart {...common} className="fill-brand-orange text-brand-orange" />;
    case 'CREATE_LIST':
      return <Bookmark {...common} className="text-brand-green" />;
    case 'FOLLOW_USER':
      return <UserPlus {...common} className="text-text-muted" />;
    case 'LOG_FILM':
    default:
      return <Sparkles {...common} className="text-brand-green" />;
  }
}

function eventHref(event: ActivityEvent): string {
  switch (event.type) {
    case 'CREATE_LIST':
      return `/lists/${event.targetId}`;
    case 'FOLLOW_USER':
      return `/profile/${event.targetId}`;
    case 'REVIEW_FILM':
      return event.filmSlug ? `/films/${event.filmSlug}/reviews` : '/films';
    case 'LOG_FILM':
    case 'LIKE_REVIEW':
    default:
      return event.filmSlug ? `/films/${event.filmSlug}` : '/films';
  }
}

export function ActivityStream({
  events,
  isLoading = false,
  error = null,
  limit,
  emptyTitle = 'No activity yet',
  emptyDescription = 'Once you or the people you follow log a film, it will show up here.',
  className = '',
}: ActivityStreamProps) {
  if (isLoading) {
    return (
      <div className={`flex flex-col gap-2 ${className}`} role="status" aria-live="polite">
        <span className="sr-only">Loading activity</span>
        {Array.from({ length: 5 }, (_unused, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded border border-border-subtle bg-surface-panel p-3"
          >
            <span className="h-[54px] w-9 shrink-0 animate-pulse rounded-sm bg-surface-hover" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3 w-2/3 animate-pulse rounded bg-surface-hover" />
              <span className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded border border-brand-orange/40 bg-brand-orange/5 px-3 py-4 text-center"
      >
        <p className="text-[12px] font-semibold text-brand-orange">{error}</p>
        <p className="mt-1 text-[11px] text-text-muted">
          The activity stream is stored locally in IndexedDB.
        </p>
      </div>
    );
  }

  const rows = limit ? events.slice(0, limit) : events;

  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center"
        role="status"
      >
        <Sparkles size={20} aria-hidden="true" className="text-text-dim" />
        <p className="text-[13px] font-semibold text-text-secondary">{emptyTitle}</p>
        <p className="max-w-xs text-[11px] leading-relaxed text-text-muted">
          {emptyDescription}
        </p>
        <Link
          href="/films"
          className="mt-2 inline-flex min-h-10 items-center rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
        >
          Browse films
        </Link>
      </div>
    );
  }

  return (
    <ul className={`flex flex-col gap-2 ${className}`} aria-label="Friend activity">
      {rows.map((event) => {
        const film = event.metadata;
        const verb = VERB_BY_TYPE[event.type];

        return (
          <li key={event.id}>
            <article className="flex items-start gap-3 rounded border border-border-subtle bg-surface-panel p-2.5 transition-colors hover:border-border-strong sm:p-3">
              <Link
                href={`/profile/${event.user.username}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                aria-label={`View ${event.user.displayName}'s profile`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.user.avatarUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-border-subtle object-cover"
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-text-secondary">
                  <Link
                    href={`/profile/${event.user.username}`}
                    className="font-semibold text-text-primary transition-colors hover:text-brand-green"
                  >
                    {event.user.displayName}
                  </Link>
                  <span className="inline-flex items-center gap-1 text-text-muted">
                    <EventIcon type={event.type} />
                    {verb}
                  </span>
                  {film.filmTitle ? (
                    <Link
                      href={eventHref(event)}
                      className="truncate font-semibold text-brand-cyan transition-colors hover:text-text-primary"
                    >
                      {film.filmTitle}
                    </Link>
                  ) : film.listTitle ? (
                    <Link
                      href={eventHref(event)}
                      className="truncate font-semibold text-brand-cyan transition-colors hover:text-text-primary"
                    >
                      {film.listTitle}
                    </Link>
                  ) : null}
                </p>

                {typeof film.rating === 'number' ? (
                  <StarRatingDisplay rating={film.rating} size="sm" showNumeric />
                ) : null}

                {film.reviewSnippet ? (
                  <Link
                    href={eventHref(event)}
                    className="line-clamp-2 text-[11px] italic leading-snug text-text-muted transition-colors hover:text-text-secondary"
                  >
                    “{film.reviewSnippet}”
                  </Link>
                ) : null}

                <time
                  dateTime={event.createdAt}
                  title={formatAccessibleTimestamp(event.createdAt)}
                  className="font-mono text-[10px] uppercase tracking-wider text-text-dim"
                >
                  {formatRelativeActivity(event.createdAt)}
                </time>
              </div>

              {film.filmPoster ? (
                <Link
                  href={eventHref(event)}
                  className="poster-frame hidden w-[38px] shrink-0 sm:block"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={film.filmPoster}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </Link>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export default ActivityStream;
