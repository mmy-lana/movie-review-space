'use client';

/**
 * Diary island.
 *
 * The viewer's watch history, grouped by month and year, with the three filter
 * views Letterboxd users expect: everything, reviews only, and rewatches only.
 * Rows reuse `DiaryRow` and open the global quick-log surface in edit mode, so
 * the diary and the log form can never disagree about a row's contents.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Film as FilmIcon, MessageSquare, RotateCw, TrendingUp } from 'lucide-react';
import type { DiaryEntry, Film } from '@/types/cine';
import { DiaryRow } from '@/components/compound/DiaryRow';
import { useDiaryStore } from '@/lib/hooks/useDiaryStore';
import { useOptionalQuickLog, useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useViewer } from '@/lib/hooks/useViewer';
import { getFilmsByIds } from '@/lib/db/queries';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { formatCount, formatMonthYear, monthKey } from '@/lib/utils/date-format';

type DiaryView = 'all' | 'reviews' | 'rewatches';

const VIEW_OPTIONS: ReadonlyArray<{ key: DiaryView; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'rewatches', label: 'Rewatches' },
];

export function DiaryPage() {
  const { user, userId, isReady } = useViewer();
  const seedSignal = useSeedSignal();
  const saveSignal = useQuickLogSaveSignal();
  const quickLog = useOptionalQuickLog();
  const diary = useDiaryStore({ userId, viewer: user, enabled: isReady });

  const [view, setView] = useState<DiaryView>('all');

  const refreshDiary = diary.refresh;

  // A log saved from the global surface must appear here immediately.
  useEffect(() => {
    if (saveSignal === 0) return;
    void refreshDiary();
  }, [refreshDiary, saveSignal]);

  // A save from the global surface must refresh this list.
  const loadFilms = useCallback(async (): Promise<Film[]> => {
    const ids = [...new Set(diary.entries.map((entry) => entry.filmId))];
    return getFilmsByIds(ids);
  }, [diary.entries]);

  const { data: films, isLoading: isLoadingFilms } = useAsyncData<Film[]>(
    loadFilms,
    [],
    [diary.entries, seedSignal],
  );

  const filmById = useMemo(
    () => new Map(films.map((film) => [film.id, film])),
    [films],
  );

  /** Entries with their film relation folded in — `DiaryRow` reads `entry.film`. */
  const hydratedEntries = useMemo(
    () =>
      diary.entries.map((entry) => ({
        ...entry,
        film: filmById.get(entry.filmId) ?? entry.film,
      })),
    [diary.entries, filmById],
  );

  const visibleEntries = useMemo(() => {
    switch (view) {
      case 'reviews':
        return hydratedEntries.filter((entry) => Boolean(entry.reviewId));
      case 'rewatches':
        return hydratedEntries.filter((entry) => entry.isRewatch);
      case 'all':
      default:
        return hydratedEntries;
    }
  }, [hydratedEntries, view]);

  /** Groups entries into `{ monthKey, label, entries }` blocks, newest first. */
  const grouped = useMemo(() => {
    const buckets = new Map<string, DiaryEntry[]>();
    for (const entry of visibleEntries) {
      const key = monthKey(entry.watchedDate);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }

    return [...buckets.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, entries]) => ({
        key,
        label: formatMonthYear(`${key}-01`),
        entries,
      }));
  }, [visibleEntries]);

  const totalRuntime = useMemo(
    () =>
      visibleEntries.reduce((minutes, entry) => {
        const film = filmById.get(entry.filmId);
        return minutes + (film?.runtimeMinutes ?? 0);
      }, 0),
    [filmById, visibleEntries],
  );

  const handleEdit = useCallback(
    (entry: DiaryEntry) => {
      const film = filmById.get(entry.filmId) ?? null;
      quickLog?.open({ film, entryId: entry.id });
    },
    [filmById, quickLog],
  );

  const handleRemove = useCallback(
    (entry: DiaryEntry) => {
      void diary.deleteEntry(entry.id);
    },
    [diary],
  );

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <header className="mb-5 flex flex-col gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green">
            {user ? `@${user.username}` : 'Your history'}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Diary
          </h1>
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={12} aria-hidden="true" />
            {diary.isLoading ? 'Loading…' : `${formatCount(visibleEntries.length)} entries`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FilmIcon size={12} aria-hidden="true" />
            {`${formatCount(Math.round(totalRuntime / 60))} hours watched`}
          </span>
          {diary.isReady && diary.entries.some((entry) => entry.isRewatch) ? (
            <span className="inline-flex items-center gap-1.5">
              <RotateCw size={12} aria-hidden="true" />
              {`${formatCount(diary.entries.filter((entry) => entry.isRewatch).length)} rewatches`}
            </span>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter diary entries"
            className="flex items-center gap-1 rounded border border-border-subtle bg-surface-panel p-1"
          >
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setView(option.key)}
                aria-pressed={view === option.key}
                className={`min-h-11 rounded px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  view === option.key
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {quickLog ? (
            <button
              type="button"
              onClick={() => quickLog.open({ film: null })}
              className="ml-auto inline-flex min-h-11 items-center rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              Log a film
            </button>
          ) : null}
        </div>

        {diary.lastMutationError ? (
          <p
            role="alert"
            className="rounded border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-[11px] text-brand-orange"
          >
            {diary.lastMutationError}
          </p>
        ) : null}
      </header>

      {diary.error ? (
        <div
          role="alert"
          className="rounded border border-brand-orange/40 bg-brand-orange/5 px-4 py-8 text-center"
        >
          <p className="text-[13px] font-semibold text-brand-orange">{diary.error}</p>
          <button
            type="button"
            onClick={() => void diary.refresh()}
            className="mt-3 inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : diary.isLoading || (isLoadingFilms && diary.entries.length > 0) ? (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <span className="sr-only">Loading diary</span>
          {Array.from({ length: 6 }, (_unused, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded border border-border-subtle bg-surface-panel p-3"
            >
              <span className="h-4 w-14 animate-pulse rounded bg-surface-hover" />
              <span className="h-[54px] w-9 animate-pulse rounded-sm bg-surface-hover" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
                <span className="h-2.5 w-1/4 animate-pulse rounded bg-surface-hover" />
              </span>
            </div>
          ))}
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-14 text-center">
          <CalendarDays size={22} aria-hidden="true" className="text-text-dim" />
          <p className="text-[13px] font-semibold text-text-secondary">
            {view === 'all'
              ? 'Your diary is empty'
              : view === 'reviews'
                ? 'No diary entries carry a written review'
                : 'No rewatches logged yet'}
          </p>
          <p className="max-w-sm text-[11px] leading-relaxed text-text-muted">
            {view === 'all'
              ? 'Log a film and it lands here with its rating, watch date and any review you write.'
              : 'Switch back to “Everything” to see the full history.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {quickLog ? (
              <button
                type="button"
                onClick={() => quickLog.open({ film: null })}
                className="inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
              >
                Log your first film
              </button>
            ) : null}
            <Link
              href="/films"
              className="inline-flex min-h-11 items-center gap-1.5 rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
            >
              <TrendingUp size={13} aria-hidden="true" />
              Find films
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map((group) => (
            <section key={group.key} aria-labelledby={`diary-month-${group.key}`}>
              <h2
                id={`diary-month-${group.key}`}
                className="sticky top-14 z-10 -mx-1 mb-2 flex items-baseline justify-between gap-3 border-b border-border-subtle bg-surface-bg/95 px-1 py-1.5 backdrop-blur-sm"
              >
                <span className="font-serif text-base font-bold tracking-tight text-text-primary">
                  {group.label}
                </span>
                <span className="tabular font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  {group.entries.length} {group.entries.length === 1 ? 'film' : 'films'}
                </span>
              </h2>

              <ul className="rounded border border-border-subtle bg-surface-panel">
                {group.entries.map((entry) => (
                  <DiaryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={quickLog ? handleEdit : undefined}
                    onDelete={handleRemove}
                    isBusy={diary.isSaving}
                  />
                ))}
              </ul>
            </section>
          ))}

          <div className="flex flex-col items-center gap-1.5 pb-4">
            <MessageSquare size={16} aria-hidden="true" className="text-text-dim" />
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
              {formatCount(diary.entries.length)} logs · {formatCount(Math.round(totalRuntime / 60))}{' '}
              hours of film
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

export default DiaryPage;
