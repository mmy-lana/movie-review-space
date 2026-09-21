'use client';

/**
 * Film detail island.
 *
 * The richest route in the app: backdrop hero, poster plate, the viewer's own
 * rating row (half-star input with optimistic rollback), the community histogram,
 * cast and crew rails, a spoiler-aware review thread, and a genre-matched
 * "more like this" rail.
 *
 * All viewer interactions write through `useFilmRatings` / `useWatchlist` /
 * `useDiaryStore`, so a rating taken here is the same row the diary and profile
 * pages read back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  Bookmark,
  CalendarDays,
  Clapperboard,
  Clock,
  Film as FilmIcon,
  Heart,
  MessageSquare,
  Plus,
  Star,
  Users,
} from 'lucide-react';
import type { Film, Review, StarRating } from '@/types/cine';
import { BackdropHero } from '@/components/ui/BackdropHero';
import { Badge } from '@/components/ui/Badge';
import { HistogramChart } from '@/components/ui/HistogramChart';
import { LikeButton } from '@/components/ui/LikeButton';
import { PosterImage } from '@/components/ui/PosterImage';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { StarRatingInput } from '@/components/ui/StarRatingInput';
import { FilmCard } from '@/components/compound/FilmCard';
import { ReviewThread } from '@/components/features/ReviewThread';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useFilmRatings } from '@/lib/hooks/useFilmRatings';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useOptionalQuickLog, useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useViewer } from '@/lib/hooks/useViewer';
import { getFilmBySlug, getReviewsForFilm, queryFilms } from '@/lib/db/queries';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import {
  formatCount,
  formatDecade,
  formatLongDate,
  formatRuntime,
  formatWatchedContext,
  toDecade,
} from '@/lib/utils/date-format';

interface FilmDetailData {
  film: Film | null;
  reviews: Review[];
  related: Film[];
}

const EMPTY_DETAIL: FilmDetailData = { film: null, reviews: [], related: [] };

export function FilmDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const seedSignal = useSeedSignal();
  const saveSignal = useQuickLogSaveSignal();
  const { userId, isReady } = useViewer();
  const ratings = useFilmRatings({ userId, enabled: isReady });
  const watchlist = useWatchlist();
  const quickLog = useOptionalQuickLog();

  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async (): Promise<FilmDetailData> => {
    const film = await getFilmBySlug(slug);
    if (!film) return EMPTY_DETAIL;

    const [reviews, related] = await Promise.all([
      getReviewsForFilm(film.id),
      queryFilms({
        genres: film.genres.slice(0, 2),
        decades: [],
        minRating: 0,
        maxRating: 5,
        sortBy: 'ratingHigh',
        sortDirection: 'desc',
        page: 1,
        limit: 12,
      }),
    ]);

    return {
      film,
      reviews,
      related: related.rows.filter((candidate) => candidate.id !== film.id).slice(0, 10),
    };
  }, [slug]);

  const { data, isLoading, error, reload } = useAsyncData<FilmDetailData>(
    load,
    EMPTY_DETAIL,
    [slug, seedSignal, saveSignal],
  );

  const film = data.film;
  const refreshRatings = ratings.refresh;

  useEffect(() => {
    if (saveSignal === 0) return;
    void refreshRatings();
  }, [refreshRatings, saveSignal]);

  useEffect(() => {
    if (!film) return;
    document.title = `${film.title} (${film.releaseYear}) · CineSlate`;
  }, [film]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2_600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const userRating = film ? ratings.getRating(film.id) : null;
  const isLiked = film ? ratings.isLiked(film.id) : false;
  const inWatchlist = film ? watchlist.has(film.id) : false;

  const topBilled = useMemo(
    () => (film ? [...film.cast].sort((a, b) => a.order - b.order).slice(0, 12) : []),
    [film],
  );

  const handleRate = useCallback(
    async (next: StarRating | 0) => {
      if (!film) return;
      const ok = await ratings.setRating(film, next);
      if (ok) setFlash(next === 0 ? 'Rating cleared' : `Rated ${next} of 5`);
      else if (ratings.error) setFlash(ratings.error);
    },
    [film, ratings],
  );

  const handleToggleLike = useCallback(async () => {
    if (!film) return;
    const ok = await ratings.toggleLike(film);
    if (ok) setFlash(isLiked ? 'Removed from likes' : 'Added to likes');
    else if (ratings.error) setFlash(ratings.error);
  }, [film, isLiked, ratings]);

  if (isLoading && !film) {
    return (
      <main id="main-content" className="flex-1">
        <div className="h-[300px] w-full animate-pulse bg-surface-panel sm:h-[380px]" />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8" role="status">
          <span className="sr-only">Loading film</span>
          <span className="h-6 w-1/2 animate-pulse rounded bg-surface-hover" />
          <span className="h-4 w-1/3 animate-pulse rounded bg-surface-hover" />
          <span className="h-24 w-full animate-pulse rounded bg-surface-hover" />
        </div>
      </main>
    );
  }

  if (error || !film) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded border border-brand-orange/40 bg-brand-orange/5 px-6 py-12 text-center"
        >
          <AlertTriangle size={24} aria-hidden="true" className="text-brand-orange" />
          <h1 className="font-serif text-xl font-bold text-brand-orange">
            {error ? 'This film could not be loaded' : 'That film is not in this library'}
          </h1>
          <p className="max-w-sm text-[12px] leading-relaxed text-text-secondary">
            {error ??
              `No film matches the slug “${slug}”. It may have been removed, or the link may be mistyped.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              Try again
            </button>
            <Link
              href="/films"
              className="inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
            >
              Browse the catalogue
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const latestEntry = ratings.latestEntry.get(film.id) ?? null;

  return (
    <main id="main-content" className="flex-1">
      <BackdropHero src={film.backdropUrl} height="md" gradient="bottom" priority />

      <div className="mx-auto w-full max-w-5xl px-3 sm:px-4">
        <div className="flex flex-col gap-4 sm:-mt-24 sm:flex-row sm:items-start sm:gap-6">
          <div className="z-10 w-[132px] shrink-0 self-start sm:w-[168px]">
            <PosterImage
              src={film.posterUrl}
              title={film.title}
              sizeHint="detail"
              priority
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 rounded border border-border-subtle bg-surface-panel p-4 shadow-card sm:mt-24 sm:p-5">
            <div>
              <h1 className="font-serif text-2xl font-bold leading-tight tracking-tight text-text-primary sm:text-3xl">
                {film.title}
              </h1>
              {film.originalTitle && film.originalTitle !== film.title ? (
                <p className="mt-0.5 text-[12px] italic text-text-muted">{film.originalTitle}</p>
              ) : null}
              {film.tagline ? (
                <p className="mt-1.5 text-[13px] italic text-text-secondary">“{film.tagline}”</p>
              ) : null}
            </div>

            <p className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={12} aria-hidden="true" />
                {formatLongDate(film.releaseDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={12} aria-hidden="true" />
                {formatRuntime(film.runtimeMinutes)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clapperboard size={12} aria-hidden="true" />
                {formatDecade(toDecade(film.releaseYear))}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <StarRatingDisplay rating={film.metrics.communityRating} size="md" showNumeric />
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                {formatCount(film.metrics.ratingCount)} ratings
              </span>
            </div>

            <ul className="flex flex-wrap gap-1.5">
              {film.genres.map((genre) => (
                <li key={genre}>
                  <Link href="/films" className="inline-flex">
                    <Badge tone="outline" size="sm">
                      {genre}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>

            <p className="text-[13px] leading-relaxed text-text-secondary">{film.synopsis}</p>

            {film.directors.length > 0 ? (
              <p className="text-[12px] text-text-secondary">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Directed by{' '}
                </span>
                {film.directors.map((director) => director.name).join(', ')}
              </p>
            ) : null}

            <ul className="flex flex-wrap gap-4 border-t border-border-subtle pt-3">
              <li className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                <span className="tabular block font-serif text-base font-bold normal-case text-text-primary">
                  {formatCount(film.metrics.logCount)}
                </span>
                Logs
              </li>
              <li className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                <span className="tabular block font-serif text-base font-bold normal-case text-text-primary">
                  {formatCount(film.metrics.reviewCount)}
                </span>
                Reviews
              </li>
              <li className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                <span className="tabular block font-serif text-base font-bold normal-case text-text-primary">
                  {formatCount(film.metrics.listCount)}
                </span>
                Lists
              </li>
              <li className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                <span className="tabular block font-serif text-base font-bold normal-case text-text-primary">
                  {formatCount(film.metrics.likeCount)}
                </span>
                Likes
              </li>
            </ul>
          </div>
        </div>

        {/* Viewer interaction bar */}
        <section
          aria-label="Your activity on this film"
          className="mt-5 flex flex-col gap-3 rounded border border-border-subtle bg-surface-panel p-4"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
                Your rating
              </span>
              <StarRatingInput
                value={userRating ?? 0}
                onChange={(next) => void handleRate(next)}
                label={`Rate ${film.title}`}
                size="lg"
                disabled={!isReady}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LikeButton
                isLiked={isLiked}
                onToggle={() => void handleToggleLike()}
                variant="pill"
                count={film.metrics.likeCount}
                label={isLiked ? 'Remove from your likes' : 'Add to your likes'}
                disabled={!isReady}
              />

              <button
                type="button"
                onClick={() => watchlist.toggle(film.id)}
                aria-pressed={inWatchlist}
                className={`inline-flex min-h-11 items-center gap-2 rounded border px-3.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  inWatchlist
                    ? 'border-brand-cyan/50 bg-brand-cyan/10 text-brand-cyan'
                    : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
                }`}
              >
                <Bookmark
                  size={15}
                  aria-hidden="true"
                  className={inWatchlist ? 'fill-brand-cyan' : ''}
                />
                {inWatchlist ? 'On watchlist' : 'Watchlist'}
              </button>

              {quickLog ? (
                <button
                  type="button"
                  onClick={() =>
                    quickLog.open({ film, entryId: latestEntry?.id ?? null })
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
                >
                  {latestEntry ? <Plus size={15} aria-hidden="true" /> : <Star size={15} aria-hidden="true" />}
                  {latestEntry ? 'Log again' : 'Log this film'}
                </button>
              ) : null}
            </div>
          </div>

          {latestEntry ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-3 text-[12px] text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Star size={12} aria-hidden="true" className="text-brand-green" />
                You rated this {latestEntry.rating} of 5
              </span>
              <span>{formatWatchedContext(latestEntry.watchedDate)}</span>
              {latestEntry.isRewatch ? (
                <Badge tone="cyan" size="xs">
                  Rewatch
                </Badge>
              ) : null}
              {latestEntry.isLiked ? (
                <span className="inline-flex items-center gap-1 text-brand-orange">
                  <Heart size={11} aria-hidden="true" className="fill-brand-orange" />
                  Liked
                </span>
              ) : null}
            </p>
          ) : (
            <p className="border-t border-border-subtle pt-3 text-[12px] text-text-muted">
              You have not logged this film yet. Rating it creates a diary entry automatically.
            </p>
          )}

          {flash ? (
            <p
              role="status"
              className="animate-fade-in rounded border border-brand-green/40 bg-brand-green/10 px-3 py-2 text-[11px] text-brand-green"
            >
              {flash}
            </p>
          ) : null}

          {ratings.error ? (
            <p role="alert" className="text-[11px] text-brand-orange">
              {ratings.error}
            </p>
          ) : null}
        </section>

        {/* Community histogram */}
        <section aria-labelledby="section-histogram" className="mt-8">
          <h2
            id="section-histogram"
            className="mb-3 border-b border-border-subtle pb-2 font-serif text-lg font-bold tracking-tight text-text-primary"
          >
            Community ratings
          </h2>
          <HistogramChart
            histogram={film.metrics.histogram}
            totalRatings={film.metrics.ratingCount}
            userRating={userRating}
            heightPx={96}
          />
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-text-dim">
            Average ★ {formatCommunityRating(film.metrics.communityRating)} across{' '}
            {formatCount(film.metrics.ratingCount)} ratings
          </p>
        </section>

        {/* Cast */}
        {topBilled.length > 0 ? (
          <section aria-labelledby="section-cast" className="mt-8">
            <h2
              id="section-cast"
              className="mb-3 flex items-center gap-2 border-b border-border-subtle pb-2 font-serif text-lg font-bold tracking-tight text-text-primary"
            >
              <Users size={16} aria-hidden="true" className="text-text-dim" />
              Cast
            </h2>
            <ul className="rail-scroll flex gap-3 pb-1">
              {topBilled.map((member) => (
                <li key={`${member.name}-${member.order}`} className="w-[116px] shrink-0">
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span className="flex h-[116px] w-[116px] items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-panel">
                      {member.avatarUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={member.avatarUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FilmIcon size={22} aria-hidden="true" className="text-text-dim" />
                      )}
                    </span>
                    <span className="w-full truncate text-[12px] font-semibold text-text-primary">
                      {member.name}
                    </span>
                    <span className="w-full truncate text-[10px] text-text-muted">
                      {member.character}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Crew */}
        {film.directors.length > 0 ? (
          <section aria-labelledby="section-crew" className="mt-8">
            <h2
              id="section-crew"
              className="mb-3 flex items-center gap-2 border-b border-border-subtle pb-2 font-serif text-lg font-bold tracking-tight text-text-primary"
            >
              <Clapperboard size={16} aria-hidden="true" className="text-text-dim" />
              Crew
            </h2>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              {film.directors.map((member) => (
                <li
                  key={`${member.role}-${member.name}`}
                  className="flex items-baseline justify-between gap-3 rounded border border-border-subtle bg-surface-panel px-3 py-2"
                >
                  <span className="text-[13px] font-semibold text-text-primary">
                    {member.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    {member.role}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Reviews */}
        <section aria-labelledby="section-reviews" className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-border-subtle pb-2">
            <h2
              id="section-reviews"
              className="flex items-center gap-2 font-serif text-lg font-bold tracking-tight text-text-primary"
            >
              <MessageSquare size={16} aria-hidden="true" className="text-text-dim" />
              Reviews
            </h2>
            {data.reviews.length > 2 ? (
              <Link
                href={`/films/${film.slug}/reviews`}
                className="inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-brand-green"
              >
                All {data.reviews.length} reviews
              </Link>
            ) : null}
          </div>

          <ReviewThread
            reviews={data.reviews}
            viewer={isReady ? { id: userId, username: '', displayName: '', avatarUrl: '' } : null}
            pageSize={2}
            showControls={data.reviews.length > 2}
            emptyTitle="No reviews for this film yet"
            emptyDescription="Log the film and write the first review — it appears here instantly."
          />
        </section>

        {/* More like this */}
        {data.related.length > 0 ? (
          <section aria-labelledby="section-related" className="mt-8 pb-6">
            <h2
              id="section-related"
              className="mb-3 border-b border-border-subtle pb-2 font-serif text-lg font-bold tracking-tight text-text-primary"
            >
              More like this
            </h2>
            <ul className="rail-scroll flex gap-3 pb-1">
              {data.related.map((candidate) => (
                <li key={candidate.id} className="w-[104px] shrink-0 sm:w-[124px]">
                  <FilmCard
                    film={candidate}
                    userRating={ratings.getRating(candidate.id)}
                    isLiked={ratings.isLiked(candidate.id)}
                    isInWatchlist={watchlist.isReady ? watchlist.has(candidate.id) : undefined}
                    onToggleLike={(target, next) => void ratings.toggleLike(target, next)}
                    onToggleWatchlist={(target) => watchlist.toggle(target.id)}
                    onQuickLog={
                      quickLog ? (target) => quickLog.open({ film: target }) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default FilmDetailPage;
