'use client';

/**
 * Full review list for a single film.
 *
 * Offers the sort/filter toolbar that the detail page hides, plus the rating
 * histogram so readers can jump to a specific rating band. Selecting a bar
 * filters the thread client-side, which is why the histogram renders real
 * buttons rather than decorative bars.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Star } from 'lucide-react';
import type { Film, PartialRatingHistogram, Review, StarRating } from '@/types/cine';
import { HistogramChart } from '@/components/ui/HistogramChart';
import { PosterImage } from '@/components/ui/PosterImage';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { ReviewThread } from '@/components/features/ReviewThread';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useViewer } from '@/lib/hooks/useViewer';
import { getFilmBySlug, getReviewsForFilm, getReviewRatingHistogram } from '@/lib/db/queries';
import { formatCommunityRating, formatRatingDisplay } from '@/lib/utils/rating-math';
import { formatCount } from '@/lib/utils/date-format';

interface ReviewsPageData {
  film: Film | null;
  reviews: Review[];
  /** Distribution of written reviews only — narrower than the rating histogram. */
  reviewHistogram: PartialRatingHistogram;
}

const EMPTY_DATA: ReviewsPageData = { film: null, reviews: [], reviewHistogram: {} };

export function FilmReviewsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const seedSignal = useSeedSignal();
  const saveSignal = useQuickLogSaveSignal();
  const { userId, isReady } = useViewer();

  const [ratingFilter, setRatingFilter] = useState<StarRating | null>(null);

  const load = useCallback(async (): Promise<ReviewsPageData> => {
    const film = await getFilmBySlug(slug);
    if (!film) return EMPTY_DATA;

    const [reviews, reviewHistogram] = await Promise.all([
      getReviewsForFilm(film.id),
      getReviewRatingHistogram({ filmId: film.id }),
    ]);

    return { film, reviews, reviewHistogram };
  }, [slug]);

  const { data, isLoading, error, reload } = useAsyncData<ReviewsPageData>(
    load,
    EMPTY_DATA,
    [slug, seedSignal, saveSignal],
  );

  const visibleReviews = useMemo(
    () =>
      ratingFilter === null
        ? data.reviews
        : data.reviews.filter((review) => review.rating === ratingFilter),
    [data.reviews, ratingFilter],
  );

  if (isLoading && !data.film) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8" role="status">
        <span className="sr-only">Loading reviews</span>
        <span className="block h-6 w-1/2 animate-pulse rounded bg-surface-hover" />
        <span className="mt-4 block h-32 w-full animate-pulse rounded bg-surface-hover" />
      </main>
    );
  }

  if (error || !data.film) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded border border-brand-orange/40 bg-brand-orange/5 px-6 py-12 text-center"
        >
          <AlertTriangle size={24} aria-hidden="true" className="text-brand-orange" />
          <h1 className="font-serif text-xl font-bold text-brand-orange">
            {error ? 'Reviews could not be loaded' : 'That film is not in this library'}
          </h1>
          <p className="max-w-sm text-[12px] text-text-secondary">{error ?? `No film for “${slug}”.`}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg"
            >
              Try again
            </button>
            <Link
              href="/films"
              className="inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
            >
              Browse films
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const film = data.film;

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <Link
        href={`/films/${film.slug}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-brand-green"
      >
        <ArrowLeft size={12} aria-hidden="true" />
        Back to {film.title}
      </Link>

      <header className="mb-5 flex items-start gap-3 border-b border-border-subtle pb-4">
        <div className="w-14 shrink-0 sm:w-16">
          <PosterImage
            src={film.posterUrl}
            title={film.title}
            sizeHint="row"
            decorative
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
            {film.title} reviews
          </h1>
          <p className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
            <span>{film.releaseYear}</span>
            <span className="inline-flex items-center gap-1">
              ★ {formatCommunityRating(film.metrics.communityRating)}
            </span>
            <span>{formatCount(film.metrics.ratingCount)} ratings</span>
            <span>{formatCount(data.reviews.length)} written</span>
          </p>
          <div className="mt-1.5">
            <StarRatingDisplay rating={film.metrics.communityRating} size="sm" />
          </div>
        </div>
      </header>

      <section aria-label="Rating distribution of written reviews" className="mb-6">
        <HistogramChart
          histogram={data.reviewHistogram}
          heightPx={72}
          onSelectRating={(rating) =>
            setRatingFilter((current) => (current === rating ? null : rating))
          }
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ratingFilter !== null ? (
            <>
              <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-green">
                <Star size={11} aria-hidden="true" className="fill-brand-green" />
                Showing {formatRatingDisplay(ratingFilter)}-star reviews only
              </p>
              <button
                type="button"
                onClick={() => setRatingFilter(null)}
                className="inline-flex min-h-11 items-center rounded border border-border-subtle px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-brand-orange/60 hover:text-brand-orange"
              >
                Clear
              </button>
            </>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Select a bar to filter the {formatCount(data.reviews.length)} written reviews by
              rating
            </p>
          )}
        </div>
      </section>

      <ReviewThread
        reviews={visibleReviews}
        viewer={isReady ? { id: userId, username: '', displayName: '', avatarUrl: '' } : null}
        pageSize={8}
        showControls={data.reviews.length > 1}
        emptyTitle={
          ratingFilter !== null ? 'No reviews carry that rating' : 'No reviews for this film yet'
        }
        emptyDescription={
          ratingFilter !== null
            ? 'Clear the rating filter to read the rest of the thread.'
            : 'Log this film and write the first review — it appears here instantly.'
        }
      />
    </main>
  );
}

export default FilmReviewsPage;
