'use client';

/**
 * Profile statistics panel.
 *
 * Renders the seven headline counters from `UserProfile.stats` plus an optional
 * ratings histogram. Every figure has a visible label and a `title` attribute so
 * the numbers stay legible without relying on column position.
 */

import type { PartialRatingHistogram, StarRating, UserStats } from '@/types/cine';
import { HistogramChart } from '@/components/ui/HistogramChart';
import {
  formatCompactCount,
  formatCount,
  formatWatchTime,
} from '@/lib/utils/date-format';

export interface ProfileStatsGridProps {
  stats: UserStats;
  /** Lifetime rating distribution for this member. */
  histogram?: PartialRatingHistogram | null;
  /** Renders the histogram column when a non-empty distribution is supplied. */
  showHistogram?: boolean;
  /** The viewer's own rating, highlighted in the histogram. */
  userRating?: StarRating | null;
  className?: string;
}

interface StatTile {
  key: string;
  label: string;
  value: string;
  hint: string;
}

export function ProfileStatsGrid({
  stats,
  histogram = null,
  showHistogram = false,
  userRating = null,
  className = '',
}: ProfileStatsGridProps) {
  const tiles: StatTile[] = [
    {
      key: 'films',
      label: 'Films',
      value: formatCount(stats.filmsWatched),
      hint: 'Total films marked as watched',
    },
    {
      key: 'year',
      label: 'This year',
      value: formatCount(stats.thisYearCount),
      hint: 'Films watched in the current calendar year',
    },
    {
      key: 'reviews',
      label: 'Reviews',
      value: formatCompactCount(stats.reviewsWritten),
      hint: 'Written reviews published',
    },
    {
      key: 'lists',
      label: 'Lists',
      value: formatCount(stats.listsCreated),
      hint: 'Curated lists created',
    },
    {
      key: 'following',
      label: 'Following',
      value: formatCompactCount(stats.followingCount),
      hint: 'Members this profile follows',
    },
    {
      key: 'followers',
      label: 'Followers',
      value: formatCompactCount(stats.followersCount),
      hint: 'Members following this profile',
    },
    {
      key: 'watchtime',
      label: 'Watch time',
      value: formatWatchTime(stats.totalWatchTimeMinutes),
      hint: 'Cumulative runtime of every logged film',
    },
  ];

  const hasHistogramData =
    histogram !== null &&
    Object.values(histogram).some((count) => typeof count === 'number' && count > 0);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            title={tile.hint}
            className="flex flex-col gap-0.5 rounded border border-border-subtle bg-surface-panel px-3 py-2.5"
          >
            <dt className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
              {tile.label}
            </dt>
            <dd className="tabular font-serif text-lg font-bold leading-tight text-text-primary sm:text-xl">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>

      {showHistogram ? (
        hasHistogramData && histogram ? (
          <section aria-label="Your rating distribution" className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
              Your rating distribution
            </h3>
            <HistogramChart
              histogram={histogram}
              userRating={userRating}
              heightPx={56}
            />
          </section>
        ) : (
          <section
            aria-label="Your rating distribution"
            className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-6 text-center"
          >
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
              Your rating distribution
            </h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
              Rate a few films and your personal distribution will build up here.
            </p>
          </section>
        )
      ) : null}
    </div>
  );
}

export default ProfileStatsGrid;
