'use client';

/**
 * Home page island.
 *
 * Loads the four datasets the landing view needs in one parallel pass —
 * catalogue slices, the friend activity stream, the newest reviews and the
 * member directory — and renders them as: a spotlight hero, a friends rail, a
 * two-column activity + reviews feed, and popular / top-rated poster rails.
 *
 * Every section owns its own empty state, so a partially seeded database still
 * produces a coherent page instead of a stack of blank frames.
 */

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Flame, MessageSquare, Sparkles, TrendingUp, Users } from 'lucide-react';
import type { ActivityEvent, Film, Review, UserProfile } from '@/types/cine';
import { BackdropHero } from '@/components/ui/BackdropHero';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { PosterImage } from '@/components/ui/PosterImage';
import { FilmCard } from '@/components/compound/FilmCard';
import { ReviewCard } from '@/components/compound/ReviewCard';
import { ActivityStream } from '@/components/features/ActivityStream';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useFilmRatings } from '@/lib/hooks/useFilmRatings';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useOptionalQuickLog } from '@/lib/hooks/useQuickLog';
import { useViewer } from '@/lib/hooks/useViewer';
import {
  getActivityStream,
  getAllProfiles,
  getDatabaseCounts,
  getPopularFilms,
  getReviewsForUsers,
  getTopRatedFilms,
} from '@/lib/db/queries';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import { formatCount, formatRuntime, yearsSince } from '@/lib/utils/date-format';

interface HomeData {
  popular: Film[];
  topRated: Film[];
  activity: ActivityEvent[];
  reviews: Review[];
  profiles: UserProfile[];
  counts: {
    films: number;
    reviews: number;
    diary: number;
    lists: number;
    profiles: number;
    activity: number;
  };
}

const EMPTY_HOME_DATA: HomeData = {
  popular: [],
  topRated: [],
  activity: [],
  reviews: [],
  profiles: [],
  counts: { films: 0, reviews: 0, diary: 0, lists: 0, profiles: 0, activity: 0 },
};

function SectionHeading({
  icon,
  title,
  subtitle,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 border-b border-border-subtle pb-2">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-text-dim">
          {icon}
        </span>
        <div>
          <h2 className="font-serif text-base font-bold tracking-tight text-text-primary sm:text-lg">
            {title}
          </h2>
          {subtitle ? <p className="text-[11px] text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-brand-green"
        >
          {linkLabel}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function RailSkeleton() {
  return (
    <ul className="rail-scroll flex gap-3 pb-1" role="status">
      <span className="sr-only">Loading films</span>
      {Array.from({ length: 7 }, (_unused, index) => (
        <li key={index} className="w-[104px] shrink-0 sm:w-[124px]">
          <span className="poster-frame block animate-pulse bg-surface-hover" />
          <span className="mt-2 block h-3 w-3/4 animate-pulse rounded bg-surface-hover" />
        </li>
      ))}
    </ul>
  );
}

export function HomePage() {
  const seedSignal = useSeedSignal();
  const saveSignal = useQuickLogSaveSignal();
  const { userId, isReady } = useViewer();
  const ratings = useFilmRatings({ userId, enabled: isReady });
  const watchlist = useWatchlist();
  const quickLog = useOptionalQuickLog();

  const load = useCallback(async (): Promise<HomeData> => {
    const [popular, topRated, activity, profiles, counts] = await Promise.all([
      getPopularFilms(10),
      getTopRatedFilms(10),
      getActivityStream(14),
      getAllProfiles(),
      getDatabaseCounts(),
    ]);

    const authorIds = [...new Set(activity.map((event) => event.userId))];
    const reviews = await getReviewsForUsers(authorIds.slice(0, 6), 6);

    return { popular, topRated, activity, reviews, profiles, counts };
  }, []);

  const { data, isLoading, error, reload } = useAsyncData<HomeData>(
    load,
    EMPTY_HOME_DATA,
    [seedSignal, saveSignal],
  );

  const spotlight = data.topRated[0] ?? data.popular[0] ?? null;

  const recentReviewAuthors = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const review of data.reviews) {
      if (review.user) map.set(review.userId, review.user);
    }
    return [...map.values()].slice(0, 6);
  }, [data.reviews]);

  const isEmptyDatabase =
    !isLoading && !error && data.counts.films === 0 && data.popular.length === 0;

  if (error) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-3 py-10 sm:px-4">
        <div
          role="alert"
          className="mx-auto max-w-lg rounded border border-brand-orange/40 bg-brand-orange/5 px-5 py-8 text-center"
        >
          <h1 className="font-serif text-lg font-bold text-brand-orange">
            The local library could not be read
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (isEmptyDatabase) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
        <div className="flex flex-col items-center gap-3 rounded border border-dashed border-border-subtle bg-surface-panel px-6 py-14 text-center">
          <Sparkles size={26} aria-hidden="true" className="text-brand-green" />
          <h1 className="font-serif text-xl font-bold text-text-primary">
            Your local library is empty
          </h1>
          <p className="max-w-md text-[12px] leading-relaxed text-text-secondary">
            CineSlate stores every film, rating and review in this browser. The starter library
            seeds itself on first load — reload the page to run it again.
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
          >
            Check again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="flex-1">
      {spotlight ? (
        <BackdropHero src={spotlight.backdropUrl} height="md" gradient="vignette" priority>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 max-w-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green">
                Spotlight
              </p>
              <h1 className="mt-1 font-serif text-2xl font-bold leading-tight tracking-tight text-text-primary sm:text-3xl">
                {spotlight.title}
              </h1>
              <p className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-secondary">
                <span>{spotlight.releaseYear}</span>
                <span>{formatRuntime(spotlight.runtimeMinutes)}</span>
                <span className="inline-flex items-center gap-1">
                  ★ {formatCommunityRating(spotlight.metrics.communityRating)}
                </span>
                <span>{formatCount(spotlight.metrics.logCount)} logs</span>
                <span>{yearsSince(`${spotlight.releaseYear}-01-01`)} years old</span>
              </p>
              <div className="mt-2">
                <StarRatingDisplay rating={spotlight.metrics.communityRating} size="md" />
              </div>
              <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-text-secondary">
                {spotlight.synopsis}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={`/films/${spotlight.slug}`}
                className="inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
              >
                View film
              </Link>
              {quickLog ? (
                <button
                  type="button"
                  onClick={() => quickLog.open({ film: spotlight })}
                  className="inline-flex min-h-11 items-center rounded border border-text-secondary/40 bg-surface-bg/60 px-5 text-[11px] font-bold uppercase tracking-wider text-text-primary backdrop-blur-sm transition-colors hover:border-brand-green hover:text-brand-green"
                >
                  Log this film
                </button>
              ) : null}
            </div>
          </div>
        </BackdropHero>
      ) : null}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-3 py-8 sm:px-4">
        <section aria-labelledby="section-friends">
          <SectionHeading
            icon={<Users size={16} />}
            title="Friends in your corner"
            subtitle={`${data.profiles.length} members in this library`}
          />
          {data.profiles.length === 0 ? (
            <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-6 text-center text-[12px] text-text-muted">
              No member profiles are stored yet.
            </p>
          ) : (
            <ul className="rail-scroll flex gap-3 pb-1">
              {data.profiles.map((profile) => (
                <li key={profile.id} className="w-[108px] shrink-0 sm:w-[124px]">
                  <Link
                    href={`/profile/${profile.username}`}
                    className="flex flex-col items-center gap-1.5 rounded p-1.5 text-center transition-colors hover:bg-surface-hover/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full border-2 border-border-subtle object-cover"
                    />
                    <span className="w-full truncate text-[12px] font-semibold text-text-primary">
                      {profile.displayName}
                    </span>
                    <span className="tabular w-full font-mono text-[10px] text-text-muted">
                      {formatCount(profile.stats.filmsWatched)} films
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/*
          `grid-cols-1` rather than an implicit single column: an implicit column
          is `auto`-sized, so a metre-wide poster rail inside a column would size
          the column by its max-content and push the whole page sideways. Declaring
          the mobile column as `minmax(0, 1fr)` caps it at the container width, so
          the rail scrolls internally instead of widening the document.
        */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <section aria-labelledby="section-popular">
            <SectionHeading
              icon={<Flame size={16} />}
              title="Popular this week"
              subtitle={`${formatCount(data.counts.films)} films in the local catalogue`}
              href="/films"
              linkLabel="Browse all"
            />
            {isLoading ? (
              <RailSkeleton />
            ) : data.popular.length === 0 ? (
              <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-6 text-center text-[12px] text-text-muted">
                Nothing has been logged often enough to rank yet.
              </p>
            ) : (
              <ul className="rail-scroll flex gap-3 pb-1">
                {data.popular.map((film, index) => (
                  <li key={film.id} className="w-[104px] shrink-0 sm:w-[124px]">
                    <FilmCard
                      film={film}
                      userRating={ratings.getRating(film.id)}
                      isLiked={ratings.isLiked(film.id)}
                      isInWatchlist={watchlist.isReady ? watchlist.has(film.id) : undefined}
                      onToggleLike={(target, next) => void ratings.toggleLike(target, next)}
                      onToggleWatchlist={(target) => watchlist.toggle(target.id)}
                      onQuickLog={quickLog ? (target) => quickLog.open({ film: target }) : undefined}
                      showMeta={false}
                      priority={index < 3}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="section-activity">
            <SectionHeading
              icon={<Clock size={16} />}
              title="Recent activity"
              subtitle="Across every member in this browser"
            />
            <ActivityStream
              events={data.activity}
              isLoading={isLoading}
              limit={8}
              emptyTitle="Nothing has happened yet"
              emptyDescription="Log or review a film and it will appear in this stream instantly."
            />
          </section>
        </div>

        <section aria-labelledby="section-highly-rated">
          <SectionHeading
            icon={<TrendingUp size={16} />}
            title="Highly rated right now"
            subtitle="Ranked by community average"
            href="/films"
            linkLabel="All films"
          />
          {isLoading ? (
            <RailSkeleton />
          ) : data.topRated.length === 0 ? (
            <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-6 text-center text-[12px] text-text-muted">
              Community averages appear once films have been rated.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5">
              {data.topRated.slice(0, 10).map((film, index) => (
                <li key={film.id}>
                  <FilmCard
                    film={film}
                    userRating={ratings.getRating(film.id)}
                    isLiked={ratings.isLiked(film.id)}
                    isInWatchlist={watchlist.isReady ? watchlist.has(film.id) : undefined}
                    onToggleLike={(target, next) => void ratings.toggleLike(target, next)}
                    onToggleWatchlist={(target) => watchlist.toggle(target.id)}
                    onQuickLog={quickLog ? (target) => quickLog.open({ film: target }) : undefined}
                    priority={index < 4}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="section-reviews">
          <SectionHeading
            icon={<MessageSquare size={16} />}
            title="Fresh reviews"
            subtitle={`${formatCount(data.counts.reviews)} written reviews in this library`}
          />
          {isLoading ? (
            <div className="flex flex-col gap-3" role="status">
              <span className="sr-only">Loading reviews</span>
              {Array.from({ length: 2 }, (_unused, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded border border-border-subtle bg-surface-panel p-4"
                >
                  <span className="h-3 w-40 animate-pulse rounded bg-surface-hover" />
                  <span className="h-3 w-full animate-pulse rounded bg-surface-hover" />
                  <span className="h-3 w-4/5 animate-pulse rounded bg-surface-hover" />
                </div>
              ))}
            </div>
          ) : data.reviews.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center">
              <MessageSquare size={20} aria-hidden="true" className="text-text-dim" />
              <p className="text-[13px] font-semibold text-text-secondary">
                No reviews have been written yet
              </p>
              <p className="max-w-xs text-[11px] text-text-muted">
                Open any film and use the log button to write the first one.
              </p>
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {data.reviews.map((review) => (
                  <li key={review.id}>
                    <ReviewCard
                      review={review}
                      user={review.user ?? null}
                      film={review.film ?? null}
                      viewerId={userId}
                      showFilmHeader
                    />
                  </li>
                ))}
              </ul>
              {recentReviewAuthors.length > 0 ? (
                <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  From {recentReviewAuthors.map((author) => author.displayName).join(', ')}
                </p>
              ) : null}
            </>
          )}
        </section>

        <section aria-labelledby="section-library" className="pb-4">
          <SectionHeading
            icon={<Sparkles size={16} />}
            title="This library at a glance"
          />
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[
              { label: 'Films', value: data.counts.films },
              { label: 'Reviews', value: data.counts.reviews },
              { label: 'Diary logs', value: data.counts.diary },
              { label: 'Lists', value: data.counts.lists },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded border border-border-subtle bg-surface-panel px-3 py-2.5"
              >
                <dt className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
                  {stat.label}
                </dt>
                <dd className="tabular font-serif text-lg font-bold text-text-primary">
                  {formatCount(stat.value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}

export default HomePage;
