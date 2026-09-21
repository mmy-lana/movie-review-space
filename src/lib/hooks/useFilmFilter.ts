'use client';

/**
 * Faceted film catalogue filter state.
 *
 * Holds the full `FilmFilterCriteria`, debounces the free-text query so typing
 * does not thrash IndexedDB, re-runs `queryFilms` whenever the criteria change,
 * and exposes the result plus a pagination control for "load more".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Film, FilmFilterCriteria, FilmSortKey, SortDirection } from '@/types/cine';
import { queryFilms } from '@/lib/db/queries';
import { getAllFilms } from '@/lib/db/queries';
import { toDecade } from '@/lib/utils/date-format';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

/** Page size used by the catalogue grid. */
export const FILM_PAGE_SIZE = 24;

export const DEFAULT_FILM_FILTERS: FilmFilterCriteria = {
  query: '',
  genres: [],
  decades: [],
  minRating: 0,
  maxRating: 5,
  sortBy: 'popularity',
  sortDirection: 'desc',
  page: 1,
  limit: FILM_PAGE_SIZE,
};

export interface FilmFacets {
  genres: string[];
  decades: number[];
}

export interface UseFilmFilterResult {
  /** Active criteria (query is the raw, un-debounced value). */
  criteria: FilmFilterCriteria;
  /** Films for the current page, accumulated across pages. */
  films: Film[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  facets: FilmFacets;
  /** True when any criterion deviates from the defaults. */
  isFiltered: boolean;
  setQuery: (query: string) => void;
  toggleGenre: (genre: string) => void;
  toggleDecade: (decade: number) => void;
  setRatingRange: (range: { min?: number; max?: number }) => void;
  setSort: (sortBy: FilmSortKey, sortDirection?: SortDirection) => void;
  resetFilters: () => void;
  loadMore: () => void;
  /** Total active filter count, used for the mobile filter badge. */
  activeFilterCount: number;
}

export function useFilmFilter(
  initial: Partial<FilmFilterCriteria> = {},
): UseFilmFilterResult {
  const [criteria, setCriteria] = useState<FilmFilterCriteria>({
    ...DEFAULT_FILM_FILTERS,
    ...initial,
  });
  const [films, setFilms] = useState<Film[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<FilmFacets>({ genres: [], decades: [] });

  const debouncedQuery = useDebouncedValue(criteria.query ?? '', 200);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Facets come from the whole catalogue, not the filtered slice.
  useEffect(() => {
    let cancelled = false;
    getAllFilms()
      .then((rows) => {
        if (cancelled) return;
        const genres = new Set<string>();
        const decades = new Set<number>();
        for (const film of rows) {
          for (const genre of film.genres) genres.add(genre);
          decades.add(toDecade(film.releaseYear));
        }
        setFacets({
          genres: [...genres].sort((a, b) => a.localeCompare(b)),
          decades: [...decades].sort((a, b) => a - b),
        });
      })
      .catch(() => {
        // Facets are progressive enhancement: a failure leaves them empty and
        // the grid still renders every film.
        if (!cancelled) setFacets({ genres: [], decades: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveCriteria = useMemo<FilmFilterCriteria>(
    () => ({ ...criteria, query: debouncedQuery, page: 1 }),
    [criteria, debouncedQuery],
  );

  // Re-query whenever the effective criteria change (page resets to 1).
  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    queryFilms(effectiveCriteria)
      .then((result) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setFilms(result.rows);
        setTotal(result.total);
        setHasMore(result.hasMore);
      })
      .catch((cause: unknown) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setError(
          cause instanceof Error
            ? `Films could not be loaded: ${cause.message}`
            : 'Films could not be loaded.',
        );
        setFilms([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setIsLoading(false);
      });
  }, [effectiveCriteria]);

  const setQuery = useCallback((query: string) => {
    setCriteria((current) => ({ ...current, query, page: 1 }));
  }, []);

  const toggleGenre = useCallback((genre: string) => {
    setCriteria((current) => {
      const exists = current.genres.includes(genre);
      return {
        ...current,
        page: 1,
        genres: exists
          ? current.genres.filter((value) => value !== genre)
          : [...current.genres, genre],
      };
    });
  }, []);

  const toggleDecade = useCallback((decade: number) => {
    setCriteria((current) => {
      const exists = current.decades.includes(decade);
      return {
        ...current,
        page: 1,
        decades: exists
          ? current.decades.filter((value) => value !== decade)
          : [...current.decades, decade],
      };
    });
  }, []);

  const setRatingRange = useCallback((range: { min?: number; max?: number }) => {
    setCriteria((current) => ({
      ...current,
      page: 1,
      minRating: range.min ?? current.minRating,
      maxRating: range.max ?? current.maxRating,
    }));
  }, []);

  const setSort = useCallback((sortBy: FilmSortKey, sortDirection?: SortDirection) => {
    setCriteria((current) => ({
      ...current,
      page: 1,
      sortBy,
      sortDirection: sortDirection ?? current.sortDirection,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setCriteria({ ...DEFAULT_FILM_FILTERS, query: '' });
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    setIsLoadingMore(true);
    setError(null);

    const nextPage = Math.floor(films.length / criteria.limit) + 1;

    try {
      const result = await queryFilms({
        ...effectiveCriteria,
        page: nextPage,
      });
      if (!isMountedRef.current) return;
      setFilms((current) => {
        const seen = new Set(current.map((film) => film.id));
        return [...current, ...result.rows.filter((film) => !seen.has(film.id))];
      });
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (cause: unknown) {
      if (!isMountedRef.current) return;
      setError(
        cause instanceof Error
          ? `More films could not be loaded: ${cause.message}`
          : 'More films could not be loaded.',
      );
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [criteria.limit, effectiveCriteria, films.length, hasMore, isLoading, isLoadingMore]);

  const activeFilterCount =
    criteria.genres.length +
    criteria.decades.length +
    (criteria.minRating > 0 ? 1 : 0) +
    (criteria.maxRating < 5 ? 1 : 0);

  const isFiltered =
    (criteria.query ?? '').length > 0 ||
    activeFilterCount > 0 ||
    criteria.sortBy !== DEFAULT_FILM_FILTERS.sortBy;

  return {
    criteria,
    films,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    facets,
    isFiltered,
    setQuery,
    toggleGenre,
    toggleDecade,
    setRatingRange,
    setSort,
    resetFilters,
    loadMore,
    activeFilterCount,
  };
}

export default useFilmFilter;
