'use client';

/**
 * Film catalogue grid with faceted filtering.
 *
 * Composes the `useFilmFilter` query hook with the presentation layer: a search
 * field, sort control, genre/decade/rating facets (inline above `md`, inside a
 * bottom sheet below it), the responsive poster grid, and the loading / empty /
 * error states each facet combination can produce.
 *
 * Cards receive live viewer interactions, so liking or quick-logging from the
 * grid updates in place without a reload.
 */

import { useEffect, useMemo, useState } from 'react';
import { Filter, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Film, FilmSortKey, SortDirection } from '@/types/cine';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FilmCard } from '@/components/compound/FilmCard';
import { useFilmFilter, type UseFilmFilterResult } from '@/lib/hooks/useFilmFilter';
import { useFilmRatings } from '@/lib/hooks/useFilmRatings';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useOptionalQuickLog, useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useViewer } from '@/lib/hooks/useViewer';
import { formatDecade } from '@/lib/utils/date-format';

export interface FilmGridWithFilterProps {
  /** Seed criteria applied on first render. */
  initialCriteria?: Partial<Parameters<typeof useFilmFilter>[0]>;
  /** Grid density; controls the column counts at each breakpoint. */
  columns?: 3 | 4 | 5;
  /** Hides the toolbar for embedded grids (filmography rails, list pages). */
  showToolbar?: boolean;
  /** Copy for the empty state when no film matches the active facets. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Called after a successful quick-log save so hosts can refresh. */
  onLogged?: () => void;
  className?: string;
}

const SORT_CHOICES: ReadonlyArray<{
  key: FilmSortKey;
  direction: SortDirection;
  label: string;
}> = [
  { key: 'popularity', direction: 'desc', label: 'Popular' },
  { key: 'ratingHigh', direction: 'desc', label: 'Highest rated' },
  { key: 'releaseDate', direction: 'desc', label: 'Newest' },
  { key: 'releaseDate', direction: 'asc', label: 'Oldest' },
  { key: 'runtime', direction: 'desc', label: 'Longest' },
];

const RATING_FLOORS = [0, 3, 3.5, 4, 4.5] as const;

function columnsClass(columns: 3 | 4 | 5): string {
  switch (columns) {
    case 5:
      return 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5';
    case 3:
      return 'grid-cols-2 sm:grid-cols-3';
    case 4:
    default:
      return 'grid-cols-3 sm:grid-cols-4';
  }
}

function FacetControls({
  filter,
  idPrefix,
}: {
  filter: UseFilmFilterResult;
  idPrefix: string;
}) {
  const { criteria, facets } = filter;

  if (facets.genres.length === 0 && facets.decades.length === 0) {
    return (
      <p className="text-[11px] text-text-muted">
        Facets appear once the local catalogue has been seeded.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
          Genre
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {facets.genres.map((genre) => {
            const isActive = criteria.genres.includes(genre);
            return (
              <button
                key={`${idPrefix}-genre-${genre}`}
                type="button"
                onClick={() => filter.toggleGenre(genre)}
                aria-pressed={isActive}
                className={`min-h-11 rounded-full border px-3 text-[11px] transition-colors ${
                  isActive
                    ? 'border-brand-green bg-brand-green/15 text-brand-green'
                    : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
          Decade
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {facets.decades.map((decade) => {
            const isActive = criteria.decades.includes(decade);
            return (
              <button
                key={`${idPrefix}-decade-${decade}`}
                type="button"
                onClick={() => filter.toggleDecade(decade)}
                aria-pressed={isActive}
                className={`tabular min-h-11 rounded-full border px-3 font-mono text-[11px] transition-colors ${
                  isActive
                    ? 'border-brand-cyan bg-brand-cyan/15 text-brand-cyan'
                    : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
                }`}
              >
                {formatDecade(decade)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
          Community rating
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {RATING_FLOORS.map((minRating) => {
            const isActive = criteria.minRating === minRating;
            return (
              <button
                key={`${idPrefix}-rating-${minRating}`}
                type="button"
                onClick={() => filter.setRatingRange({ min: minRating, max: 5 })}
                aria-pressed={isActive}
                className={`tabular min-h-11 rounded-full border px-3 font-mono text-[11px] transition-colors ${
                  isActive
                    ? 'border-brand-orange bg-brand-orange/15 text-brand-orange'
                    : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
                }`}
              >
                {minRating === 0 ? 'Any' : `★ ${minRating}+`}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function FilmGridWithFilter({
  initialCriteria,
  columns = 4,
  showToolbar = true,
  emptyTitle = 'No films match those filters',
  emptyDescription = 'Clear a facet or widen the rating range to see more of the catalogue.',
  onLogged,
  className = '',
}: FilmGridWithFilterProps) {
  const filter = useFilmFilter(initialCriteria);
  const { userId, isReady } = useViewer();
  const ratings = useFilmRatings({ userId, enabled: isReady });
  const watchlist = useWatchlist();
  const quickLog = useOptionalQuickLog();
  const saveSignal = useQuickLogSaveSignal();

  const [isFacetSheetOpen, setIsFacetSheetOpen] = useState(false);

  const refreshRatings = ratings.refresh;

  // A save made anywhere in the app refreshes this grid's interaction state.
  useEffect(() => {
    if (saveSignal === 0) return;
    void refreshRatings();
    onLogged?.();
  }, [onLogged, refreshRatings, saveSignal]);

  const handleToggleLike = (film: Film, nextLiked: boolean) => {
    void ratings.toggleLike(film, nextLiked);
  };

  const activeSortIndex = useMemo(
    () =>
      SORT_CHOICES.findIndex(
        (choice) =>
          choice.key === filter.criteria.sortBy &&
          choice.direction === filter.criteria.sortDirection,
      ),
    [filter.criteria.sortBy, filter.criteria.sortDirection],
  );

  return (
    <section className={`flex flex-col gap-4 ${className}`} aria-label="Film catalogue">
      {showToolbar ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex min-w-[200px] flex-1 items-center gap-2 rounded border border-border-subtle bg-surface-input px-3 focus-within:border-border-focus">
              <Search size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
              <span className="sr-only">Search films</span>
              <input
                type="search"
                value={filter.criteria.query ?? ''}
                onChange={(event) => filter.setQuery(event.target.value)}
                placeholder="Search title, cast or director…"
                className="min-h-11 w-full bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
              />
              {(filter.criteria.query ?? '').length > 0 ? (
                <button
                  type="button"
                  onClick={() => filter.setQuery('')}
                  aria-label="Clear search"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </label>

            <label className="flex items-center gap-2">
              <span className="sr-only">Sort films</span>
              <select
                value={activeSortIndex === -1 ? 0 : activeSortIndex}
                onChange={(event) => {
                  const choice = SORT_CHOICES[Number(event.target.value)];
                  filter.setSort(choice.key, choice.direction);
                }}
                className="min-h-11 rounded border border-border-subtle bg-surface-input px-2.5 text-[12px] text-text-secondary focus:border-border-focus focus:outline-none"
              >
                {SORT_CHOICES.map((choice, index) => (
                  <option key={`${choice.key}-${choice.direction}`} value={index}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setIsFacetSheetOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded border border-border-subtle bg-surface-panel px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong md:hidden"
            >
              <Filter size={14} aria-hidden="true" />
              Filters
              {filter.activeFilterCount > 0 ? (
                <span className="tabular rounded-full bg-brand-green px-1.5 font-mono text-[10px] text-surface-bg">
                  {filter.activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          {filter.isFiltered ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                {filter.isLoading
                  ? 'Filtering…'
                  : `${filter.total} film${filter.total === 1 ? '' : 's'} match`}
              </p>
              <button
                type="button"
                onClick={filter.resetFilters}
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-border-subtle px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-brand-orange/60 hover:text-brand-orange"
              >
                <RotateCcw size={12} aria-hidden="true" />
                Reset
              </button>
            </div>
          ) : null}

          <div className="hidden md:block">
            <FacetControls filter={filter} idPrefix="inline" />
          </div>
        </div>
      ) : null}

      {filter.error ? (
        <div
          role="alert"
          className="rounded border border-brand-orange/40 bg-brand-orange/5 px-4 py-6 text-center"
        >
          <p className="text-[12px] font-semibold text-brand-orange">{filter.error}</p>
          <p className="mt-1 text-[11px] text-text-muted">
            The catalogue is stored locally, so a reload usually clears this.
          </p>
        </div>
      ) : filter.isLoading ? (
        <div className={`grid gap-3 sm:gap-4 ${columnsClass(columns)}`} role="status">
          <span className="sr-only">Loading films</span>
          {Array.from({ length: 12 }, (_unused, index) => (
            <div key={index} className="flex flex-col gap-2">
              <span className="poster-frame block animate-pulse bg-surface-hover" />
              <span className="h-3 w-3/4 animate-pulse rounded bg-surface-hover" />
              <span className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
            </div>
          ))}
        </div>
      ) : filter.films.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-12 text-center"
        >
          <SlidersHorizontal size={20} aria-hidden="true" className="text-text-dim" />
          <p className="text-[13px] font-semibold text-text-secondary">{emptyTitle}</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-text-muted">
            {emptyDescription}
          </p>
          {filter.isFiltered ? (
            <button
              type="button"
              onClick={filter.resetFilters}
              className="mt-2 inline-flex min-h-11 items-center rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className={`grid gap-3 sm:gap-4 ${columnsClass(columns)}`}>
            {filter.films.map((film, index) => (
              <li key={film.id}>
                <FilmCard
                  film={film}
                  userRating={ratings.getRating(film.id)}
                  isLiked={ratings.isLiked(film.id)}
                  isInWatchlist={watchlist.isReady ? watchlist.has(film.id) : undefined}
                  onToggleLike={handleToggleLike}
                  onToggleWatchlist={(target) => watchlist.toggle(target.id)}
                  onQuickLog={
                    quickLog ? (target) => quickLog.open({ film: target }) : undefined
                  }
                  priority={index < 4}
                />
              </li>
            ))}
          </ul>

          {ratings.error ? (
            <p role="alert" className="text-[11px] text-brand-orange">
              {ratings.error}
            </p>
          ) : null}

          {filter.hasMore ? (
            <button
              type="button"
              onClick={filter.loadMore}
              disabled={filter.isLoadingMore}
              className="mx-auto inline-flex min-h-11 items-center rounded border border-border-strong px-6 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {filter.isLoadingMore
                ? 'Loading…'
                : `Load more (${filter.total - filter.films.length} remaining)`}
            </button>
          ) : (
            <p className="text-center font-mono text-[10px] uppercase tracking-wider text-text-dim">
              End of catalogue · {filter.total} film{filter.total === 1 ? '' : 's'}
            </p>
          )}
        </>
      )}

      <BottomSheet
        isOpen={isFacetSheetOpen}
        onClose={() => setIsFacetSheetOpen(false)}
        title="Filter films"
        description="Narrow the catalogue by genre, decade and community rating."
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={filter.resetFilters}
              className="min-h-11 rounded border border-border-subtle px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setIsFacetSheetOpen(false)}
              className="ml-auto min-h-11 rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              Show {filter.total} film{filter.total === 1 ? '' : 's'}
            </button>
          </div>
        }
      >
        <FacetControls filter={filter} idPrefix="sheet" />
      </BottomSheet>
    </section>
  );
}

export default FilmGridWithFilter;
