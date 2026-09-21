'use client';

/**
 * Command-palette style search overlay (Cmd/Ctrl+K).
 *
 * Searches the local film catalogue and member profiles through IndexedDB,
 * debounced at 180 ms. Results are a single flat list so one set of keyboard
 * bindings applies everywhere: `ArrowUp`/`ArrowDown` move the active row,
 * `Enter` opens it, `Escape` closes and returns focus to the invoking element.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CornerDownLeft, Film as FilmIcon, Search, User, X } from 'lucide-react';
import type { Film, UserProfile } from '@/types/cine';
import { searchFilms, searchProfiles } from '@/lib/db/queries';
import { useFocusTrap, useScrollLock } from '@/lib/hooks/useFocusTrap';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { formatCommunityRating } from '@/lib/utils/rating-math';

export interface SearchBarOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when a film result is chosen (enables quick-log from search). */
  onSelectFilm?: (film: Film) => void;
  /** Renders the mobile hint row instead of the desktop shortcut hint. */
  compactHints?: boolean;
}

interface FlatResult {
  key: string;
  kind: 'film' | 'profile';
  href: string;
  film?: Film;
  profile?: UserProfile;
}

const EXIT_DURATION_MS = 150;

export function SearchBarOverlay({
  isOpen,
  onClose,
  onSelectFilm,
  compactHints = false,
}: SearchBarOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const reactId = useId();
  const listboxId = `search-listbox-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [term, setTerm] = useState('');
  const [films, setFilms] = useState<Film[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedTerm = useDebouncedValue(term, 180);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setTerm('');
      setActiveIndex(0);
      return;
    }
    if (!isVisible) return;
    const timer = window.setTimeout(() => setIsVisible(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, isVisible]);

  useScrollLock(isOpen);
  useFocusTrap({
    active: isOpen,
    containerRef: panelRef,
    initialFocusRef: inputRef,
    onEscape: onClose,
  });

  // Debounced IndexedDB query.
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = debouncedTerm.trim();
    if (trimmed.length === 0) {
      setFilms([]);
      setProfiles([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    Promise.all([searchFilms(trimmed, 8), searchProfiles(trimmed, 5)])
      .then(([filmRows, profileRows]) => {
        if (cancelled) return;
        setFilms(filmRows);
        setProfiles(profileRows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSearchError(
          error instanceof Error ? `Search failed: ${error.message}` : 'Search failed.',
        );
        setFilms([]);
        setProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, isOpen]);

  const results = useMemo<FlatResult[]>(
    () => [
      ...films.map((film) => ({
        key: `film-${film.id}`,
        kind: 'film' as const,
        href: `/films/${film.slug}`,
        film,
      })),
      ...profiles.map((profile) => ({
        key: `profile-${profile.id}`,
        kind: 'profile' as const,
        href: `/profile/${profile.username}`,
        profile,
      })),
    ],
    [films, profiles],
  );

  useEffect(() => {
    setActiveIndex((current) => (current >= results.length ? 0 : current));
  }, [results.length]);

  // Keep the active row inside the scroll viewport during keyboard navigation.
  useEffect(() => {
    if (!isOpen) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-result-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          results.length === 0 ? 0 : (current - 1 + results.length) % results.length,
        );
        return;
      }
      if (event.key === 'Enter') {
        const active = results[activeIndex];
        if (!active) return;
        event.preventDefault();
        onClose();
        if (active.kind === 'film' && active.film) onSelectFilm?.(active.film);
        // Navigation is performed by the anchor's native behaviour on click.
        const node = listRef.current?.querySelector<HTMLElement>(
          `[data-result-index="${activeIndex}"] a`,
        );
        node?.click();
      }
    },
    [activeIndex, onClose, onSelectFilm, results],
  );

  if (!isMounted || !isVisible) return null;

  const trimmedTerm = term.trim();
  const showEmptyState = trimmedTerm.length > 0 && !isSearching && results.length === 0;
  const showIdleState = trimmedTerm.length === 0;

  return createPortal(
    <div
      className={`fixed inset-0 z-[110] flex items-start justify-center px-0 pt-0 sm:px-6 sm:pt-[10vh] ${
        isOpen ? 'animate-fade-in' : 'animate-fade-out'
      }`}
      style={{ animationDuration: `${EXIT_DURATION_MS}ms` }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search films and members"
        onKeyDown={handleKeyDown}
        className={`relative z-10 flex max-h-[100dvh] w-full flex-col overflow-hidden border-border-strong bg-surface-elevated shadow-popover sm:max-h-[70dvh] sm:max-w-2xl sm:rounded-lg sm:border ${
          isOpen ? 'animate-zoom-in-95' : 'animate-fade-out'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 sm:px-4">
          <Search size={17} aria-hidden="true" className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              results.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search films, directors, members…"
            className="min-h-11 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {isSearching ? (
            <p className="py-10 text-center font-mono text-[11px] text-text-muted" role="status">
              Searching…
            </p>
          ) : searchError ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center" role="alert">
              <p className="text-[13px] font-semibold text-brand-orange">{searchError}</p>
              <p className="text-[11px] text-text-muted">
                Local search runs against IndexedDB. Check that storage is available in this
                browser profile.
              </p>
            </div>
          ) : showIdleState ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
              <p className="text-[13px] font-semibold text-text-secondary">
                Start typing to search
              </p>
              <p className="max-w-sm text-[11px] leading-relaxed text-text-muted">
                Films match on title, original title, year, director and cast. Members match on
                display name and username.
              </p>
            </div>
          ) : showEmptyState ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
              <p className="text-[13px] font-semibold text-text-secondary">
                No results for “{trimmedTerm}”
              </p>
              <p className="text-[11px] text-text-muted">
                Try a shorter query, or check the spelling of a director or member name.
              </p>
              <button
                type="button"
                onClick={() => setTerm('')}
                className="mt-2 min-h-9 rounded border border-border-strong px-3 text-[11px] uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul ref={listRef} id={listboxId} role="listbox" aria-label="Search results">
              {results.map((result, index) => {
                const isActive = index === activeIndex;
                return (
                  <li
                    key={result.key}
                    id={`${listboxId}-option-${index}`}
                    data-result-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`border-b border-border-subtle last:border-b-0 ${
                      isActive ? 'bg-surface-hover' : ''
                    }`}
                  >
                    <Link
                      href={result.href}
                      onClick={onClose}
                      className="flex min-h-14 items-center gap-3 px-3 py-2 sm:px-4"
                    >
                      {result.kind === 'film' && result.film ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={result.film.posterUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-[54px] w-9 shrink-0 rounded-sm border border-border-subtle object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <FilmIcon
                                size={11}
                                aria-hidden="true"
                                className="shrink-0 text-text-dim"
                              />
                              <span className="truncate text-[13px] font-semibold text-text-primary">
                                {result.film.title}
                              </span>
                            </span>
                            <span className="tabular mt-0.5 block truncate font-mono text-[10px] text-text-muted">
                              {result.film.releaseYear} · ★{' '}
                              {formatCommunityRating(result.film.metrics.communityRating)} ·{' '}
                              {result.film.directors[0]?.name ?? 'Unknown director'}
                            </span>
                          </span>
                        </>
                      ) : result.profile ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={result.profile.avatarUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-10 w-10 shrink-0 rounded-full border border-border-subtle object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <User
                                size={11}
                                aria-hidden="true"
                                className="shrink-0 text-text-dim"
                              />
                              <span className="truncate text-[13px] font-semibold text-text-primary">
                                {result.profile.displayName}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-text-muted">
                              @{result.profile.username} · {result.profile.location ?? 'No location'}
                            </span>
                          </span>
                        </>
                      ) : null}

                      {isActive ? (
                        <CornerDownLeft
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-text-muted"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-panel px-3 py-2 font-mono text-[10px] text-text-dim sm:px-4">
          {compactHints ? (
            <span>Tap a result to open · Escape closes</span>
          ) : (
            <span className="flex items-center gap-3">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>Esc close</span>
            </span>
          )}
          <span>
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default SearchBarOverlay;
