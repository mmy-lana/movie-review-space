'use client';

/**
 * Films browse island.
 *
 * The catalogue route is a thin wrapper around `FilmGridWithFilter`, so this
 * island only owns what is page-level: the heading, the eyebrow counts and the
 * result summary. All facet, sort and paging behaviour belongs to the grid.
 */

import { useCallback } from 'react';
import { Film as FilmIcon, Layers } from 'lucide-react';
import { FilmGridWithFilter } from '@/components/features/FilmGridWithFilter';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { getDatabaseCounts, getAvailableGenres } from '@/lib/db/queries';
import { formatCount } from '@/lib/utils/date-format';

interface BrowseSummary {
  films: number;
  reviews: number;
  lists: number;
  genres: string[];
}

const EMPTY_SUMMARY: BrowseSummary = { films: 0, reviews: 0, lists: 0, genres: [] };

export function FilmsBrowsePage() {
  const seedSignal = useSeedSignal();

  const load = useCallback(async (): Promise<BrowseSummary> => {
    const [counts, genres] = await Promise.all([getDatabaseCounts(), getAvailableGenres()]);
    return { films: counts.films, reviews: counts.reviews, lists: counts.lists, genres };
  }, []);

  const { data, isLoading, error } = useAsyncData<BrowseSummary>(
    load,
    EMPTY_SUMMARY,
    [seedSignal],
  );

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <header className="mb-5 flex flex-col gap-2 border-b border-border-subtle pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green">
          Catalogue
        </p>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Browse films
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <FilmIcon size={12} aria-hidden="true" />
            {isLoading ? 'Counting…' : `${formatCount(data.films)} films`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers size={12} aria-hidden="true" />
            {isLoading ? 'Counting…' : `${formatCount(data.genres.length)} genres`}
          </span>
          <span>{isLoading ? '' : `${formatCount(data.reviews)} reviews`}</span>
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded border border-brand-orange/40 bg-brand-orange/5 px-4 py-3 text-[12px] text-brand-orange"
        >
          {error}
        </p>
      ) : null}

      <FilmGridWithFilter columns={4} />
    </main>
  );
}

export default FilmsBrowsePage;
