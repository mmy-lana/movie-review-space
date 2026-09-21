'use client';

/**
 * Lists index island.
 *
 * Shows every public list in the library with its poster stack, owner and item
 * count, plus a section for the viewer's own lists. Lists are read through
 * `getAllLists`, which already filters private rows for non-owners.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bookmark, ListOrdered, Lock, Plus, Star } from 'lucide-react';
import type { FilmList } from '@/types/cine';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useViewer } from '@/lib/hooks/useViewer';
import { getAllLists } from '@/lib/db/queries';
import { formatCount, formatRelativeActivity } from '@/lib/utils/date-format';

export function ListsPage() {
  const seedSignal = useSeedSignal();
  const saveSignal = useQuickLogSaveSignal();
  const { userId, isReady } = useViewer();

  const [showPrivate, setShowPrivate] = useState(true);

  const load = useCallback(
    () => getAllLists({ includePrivate: true }),
    [],
  );

  const { data: lists, isLoading, error, reload } = useAsyncData<FilmList[]>(
    load,
    [],
    [seedSignal, saveSignal, showPrivate],
  );

  const ownLists = useMemo(
    () => (isReady ? lists.filter((list) => list.userId === userId) : []),
    [isReady, lists, userId],
  );

  const visibleLists = useMemo(
    () => (showPrivate ? lists : lists.filter((list) => !list.isPrivate)),
    [lists, showPrivate],
  );

  const privateCount = lists.filter((list) => list.isPrivate).length;

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <header className="mb-5 flex flex-col gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green">
            Curated collections
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Lists
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[11px] text-text-muted">
            {isLoading
              ? 'Loading…'
              : `${formatCount(visibleLists.length)} list${visibleLists.length === 1 ? '' : 's'}`}
            {ownLists.length > 0 ? ` · ${ownLists.length} yours` : ''}
          </p>

          {privateCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowPrivate((current) => !current)}
              aria-pressed={showPrivate}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded border px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                showPrivate
                  ? 'border-brand-orange/50 bg-brand-orange/10 text-brand-orange'
                  : 'border-border-subtle text-text-muted hover:border-border-strong hover:text-text-secondary'
              }`}
            >
              <Lock size={11} aria-hidden="true" />
              {showPrivate ? 'Private shown' : 'Private hidden'}
            </button>
          ) : null}

          {ownLists.length > 0 ? (
            <Link
              href={`/lists/${ownLists[0].id}`}
              className="ml-auto inline-flex min-h-11 items-center gap-2 rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              <Plus size={14} aria-hidden="true" />
              Edit your list
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded border border-brand-orange/40 bg-brand-orange/5 px-4 py-8 text-center"
        >
          <p className="text-[13px] font-semibold text-brand-orange">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2" role="status">
          <span className="sr-only">Loading lists</span>
          {Array.from({ length: 4 }, (_unused, index) => (
            <li
              key={index}
              className="flex flex-col gap-3 rounded border border-border-subtle bg-surface-panel p-4"
            >
              <span className="h-4 w-2/3 animate-pulse rounded bg-surface-hover" />
              <span className="flex gap-2">
                {Array.from({ length: 4 }, (_u, posterIndex) => (
                  <span
                    key={posterIndex}
                    className="h-[72px] w-12 animate-pulse rounded-sm bg-surface-hover"
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : visibleLists.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-14 text-center">
          <Bookmark size={22} aria-hidden="true" className="text-text-dim" />
          <p className="text-[13px] font-semibold text-text-secondary">No lists yet</p>
          <p className="max-w-sm text-[11px] leading-relaxed text-text-muted">
            Lists are ordered collections — rank a director&apos;s filmography, build a marathon
            programme, or group a mood.
          </p>
          <Link
            href="/films"
            className="mt-3 inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
          >
            Browse films
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          {visibleLists.map((list) => {
            const preview = list.items.slice(0, 4);
            const isOwn = list.userId === userId;

            return (
              <li key={list.id}>
                <article className="flex h-full flex-col gap-3 rounded border border-border-subtle bg-surface-panel p-3 transition-colors hover:border-border-strong sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-serif text-base font-bold tracking-tight text-text-primary">
                        <Link
                          href={`/lists/${list.id}`}
                          className="transition-colors hover:text-brand-green"
                        >
                          {list.title}
                        </Link>
                      </h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                        <span className="inline-flex items-center gap-1">
                          <ListOrdered size={10} aria-hidden="true" />
                          {formatCount(list.items.length)} films
                        </span>
                        <span>{list.isRanked ? 'Ranked' : 'Unranked'}</span>
                        {list.isPrivate ? (
                          <span className="inline-flex items-center gap-1 text-brand-orange">
                            <Lock size={10} aria-hidden="true" />
                            Private
                          </span>
                        ) : null}
                        <span>{formatRelativeActivity(list.createdAt)}</span>
                      </p>
                    </div>

                    {list.user ? (
                      <Link
                        href={`/profile/${list.user.username}`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                        aria-label={`View ${list.user.displayName}'s profile`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={list.user.avatarUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded-full border border-border-subtle object-cover"
                        />
                      </Link>
                    ) : null}
                  </div>

                  {preview.length > 0 ? (
                    <ul className="flex gap-1.5">
                      {preview.map((item) => (
                        <li key={item.id} className="w-12 shrink-0 sm:w-14">
                          <div className="poster-frame">
                            {item.film ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={item.film.posterUrl}
                                alt={`${item.film.title} poster`}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center bg-surface-hover">
                                <Star size={14} aria-hidden="true" className="text-text-dim" />
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] italic text-text-muted">No films added yet.</p>
                  )}

                  {list.description ? (
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-text-muted">
                      {list.description}
                    </p>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      {formatCount(list.likeCount)} likes
                    </span>
                    <Link
                      href={`/lists/${list.id}`}
                      className="inline-flex min-h-11 items-center rounded border border-border-subtle px-3 text-[10px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-brand-green"
                    >
                      {isOwn ? 'Edit list' : 'View list'}
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default ListsPage;
