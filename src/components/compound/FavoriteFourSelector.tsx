'use client';

/**
 * Profile "Favorite Four" showcase and picker.
 *
 * The grid always renders exactly four slots. Empty slots expose an "Add film"
 * control that opens a searchable modal backed by the local film catalogue;
 * filled slots show a remove control on hover and on keyboard focus.
 *
 * The four films are persisted by the parent (via `onChange`) so this component
 * stays presentational and testable.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, X } from 'lucide-react';
import type { Film, UserProfile } from '@/types/cine';
import { Modal } from '@/components/ui/Modal';
import { PosterImage } from '@/components/ui/PosterImage';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import { getAllFilms } from '@/lib/db/queries';

/** Exactly four slots; `null` marks an unfilled slot. */
export type FavoriteFourSlots = [string | null, string | null, string | null, string | null];

export interface FavoriteFourSelectorProps {
  /** Film ids per slot, in display order. */
  value: FavoriteFourSlots;
  /** Receives the next four-slot array. */
  onChange: (next: FavoriteFourSlots) => void;
  /** Hydrated films matching `value`; missing entries render as empty slots. */
  films?: (Film | null)[];
  /** Catalogue used by the picker. Defaults to a local IndexedDB query. */
  filmsForPicker?: Film[];
  /** Disables the picker (read-only profile views). */
  readOnly?: boolean;
  /** Slot labels are shown above the grid when true. */
  showLabels?: boolean;
  className?: string;
}

const SLOT_COUNT = 4;

export function FavoriteFourSelector({
  value,
  onChange,
  films,
  filmsForPicker,
  readOnly = false,
  showLabels = false,
  className = '',
}: FavoriteFourSelectorProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState(0);
  const [query, setQuery] = useState('');
  const [catalogue, setCatalogue] = useState<Film[]>(filmsForPicker ?? []);
  const [isLoadingCatalogue, setIsLoadingCatalogue] = useState(filmsForPicker === undefined);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const reactId = useId();
  const captionId = `favorite-four-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  const resolvedFilms = useMemo(() => {
    if (films && films.length === SLOT_COUNT) return films;
    const byId = new Map((filmsForPicker ?? []).map((film) => [film.id, film]));
    return value.map((id) => (id === null ? null : byId.get(id) ?? null));
  }, [films, filmsForPicker, value]);

  // Lazily pull the catalogue the first time the picker is opened.
  useEffect(() => {
    if (filmsForPicker !== undefined) {
      setCatalogue(filmsForPicker);
      setIsLoadingCatalogue(false);
      return;
    }
    if (!isPickerOpen || catalogue.length > 0) return;

    let cancelled = false;
    setIsLoadingCatalogue(true);
    setCatalogueError(null);

    getAllFilms()
      .then((rows) => {
        if (!cancelled) setCatalogue(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCatalogueError(
          error instanceof Error
            ? `Film catalogue unavailable: ${error.message}`
            : 'Film catalogue unavailable.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCatalogue(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogue.length, filmsForPicker, isPickerOpen]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const base = term.length === 0
      ? catalogue
      : catalogue.filter((film) =>
          `${film.title} ${film.originalTitle ?? ''} ${film.releaseYear} ${film.directors
            .map((director) => director.name)
            .join(' ')}`
            .toLowerCase()
            .includes(term),
        );
    return base.slice(0, 40);
  }, [catalogue, query]);

  const openPicker = useCallback((slotIndex: number) => {
    if (readOnly) return;
    setActiveSlot(slotIndex);
    setQuery('');
    setIsPickerOpen(true);
  }, [readOnly]);

  const handleSelect = useCallback(
    (film: Film) => {
      const next = [...value] as FavoriteFourSlots;
      // Picking a film already placed elsewhere swaps the slots rather than
      // creating a duplicate entry.
      const existingIndex = next.indexOf(film.id);
      if (existingIndex !== -1) next[existingIndex] = next[activeSlot] ?? null;
      next[activeSlot] = film.id;
      onChange(next);
      setIsPickerOpen(false);
    },
    [activeSlot, onChange, value],
  );

  const handleClear = useCallback(
    (slotIndex: number) => {
      const next = [...value] as FavoriteFourSlots;
      next[slotIndex] = null;
      onChange(next);
    },
    [onChange, value],
  );

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: SLOT_COUNT }, (_unused, slotIndex) => {
          const film = resolvedFilms[slotIndex] ?? null;
          const slotLabel = showLabels ? `Favourite ${slotIndex + 1}` : null;

          return (
            <div key={slotIndex} className="relative flex flex-col gap-1.5">
              {slotLabel ? (
                <span className="font-mono text-[9px] uppercase tracking-widest text-text-dim">
                  {slotLabel}
                </span>
              ) : null}

              {film ? (
                <div className="group/slot relative">
                  <Link
                    href={`/films/${film.slug}`}
                    aria-label={`${film.title}, favourite number ${slotIndex + 1}`}
                    className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg"
                  >
                    <PosterImage
                      src={film.posterUrl}
                      title={film.title}
                      sizeHint="grid"
                      decorative
                    />
                  </Link>

                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => handleClear(slotIndex)}
                      aria-label={`Remove ${film.title} from favourites`}
                      className="absolute -right-1.5 -top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-surface-elevated text-text-muted opacity-0 transition-opacity hover:text-brand-orange focus-visible:opacity-100 group-hover/slot:opacity-100"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openPicker(slotIndex)}
                  disabled={readOnly}
                  aria-label={`Add a film to favourite slot ${slotIndex + 1}`}
                  className="poster-frame flex w-full flex-col items-center justify-center gap-1.5 border border-dashed border-border-strong bg-surface-panel/60 text-text-dim transition-colors hover:border-brand-green/60 hover:text-brand-green disabled:cursor-not-allowed disabled:hover:border-border-strong disabled:hover:text-text-dim"
                >
                  <Plus size={20} aria-hidden="true" />
                  <span className="px-1 text-center font-mono text-[9px] uppercase leading-tight tracking-wider">
                    Add film
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p id={captionId} className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
        {value.filter((id) => id !== null).length} of 4 slots filled
      </p>

      <Modal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title={`Choose favourite number ${activeSlot + 1}`}
        description="Search the local catalogue by title, year or director."
        size="md"
        initialFocusRef={searchInputRef}
      >
        <div className="flex flex-col gap-3">
          <label className="relative flex items-center gap-2 rounded border border-border-subtle bg-surface-input px-3 focus-within:border-border-focus">
            <Search size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
            <span className="sr-only">Search films</span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, year or director…"
              className="min-h-11 w-full bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
            />
          </label>

          {isLoadingCatalogue ? (
            <p className="py-6 text-center font-mono text-[11px] text-text-muted" role="status">
              Loading catalogue…
            </p>
          ) : catalogueError ? (
            <p className="py-6 text-center text-[12px] text-brand-orange" role="alert">
              {catalogueError}
            </p>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center" role="status">
              <p className="text-[13px] font-semibold text-text-secondary">No films found</p>
              <p className="text-[11px] text-text-muted">
                Try a different title, or clear the search to browse everything.
              </p>
              {query.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-2 min-h-9 rounded border border-border-strong px-3 text-[11px] uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {results.map((film) => {
                const alreadyPlaced = value.includes(film.id);
                return (
                  <li key={film.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(film)}
                      className={`flex w-full flex-col gap-1.5 rounded border p-1.5 text-left transition-colors ${
                        alreadyPlaced
                          ? 'border-brand-green/50 bg-brand-green/5'
                          : 'border-border-subtle hover:border-brand-green/60 hover:bg-surface-hover/40'
                      }`}
                    >
                      <PosterImage
                        src={film.posterUrl}
                        title={film.title}
                        sizeHint="grid"
                        decorative
                      />
                      <span className="truncate text-[11px] font-semibold text-text-primary">
                        {film.title}
                      </span>
                      <span className="tabular font-mono text-[10px] text-text-muted">
                        {film.releaseYear} · ★ {formatCommunityRating(film.metrics.communityRating)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** Convenience helper for callers building slots from a profile row. */
export function toFavoriteFourSlots(
  profile: Pick<UserProfile, 'favoriteFilmIds'> | null | undefined,
): FavoriteFourSlots {
  if (!profile) return [null, null, null, null];
  const [first, second, third, fourth] = profile.favoriteFilmIds;
  return [first, second, third, fourth];
}

export default FavoriteFourSelector;
