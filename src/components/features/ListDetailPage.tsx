'use client';

/**
 * List detail island.
 *
 * Decides which mode the shared `ListEditor` runs in: the owner gets the editing
 * surface, everyone else gets the read-only view. Ownership is resolved from the
 * viewer hook rather than from the URL, so a visitor cannot reach edit controls by
 * typing a different path.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Lock } from 'lucide-react';
import type { FilmList } from '@/types/cine';
import { ListEditor } from '@/components/features/ListEditor';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useViewer } from '@/lib/hooks/useViewer';
import { getListById } from '@/lib/db/queries';

export function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = params?.id ?? '';

  const seedSignal = useSeedSignal();
  const { userId, isReady } = useViewer();

  const load = useCallback(
    () => getListById(listId, { includePrivate: true }),
    [listId],
  );

  const { data: list, isLoading, error, reload } = useAsyncData<FilmList | null>(
    load,
    null,
    [listId, seedSignal],
  );

  if (isLoading) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8" role="status">
        <span className="sr-only">Loading list</span>
        <span className="block h-7 w-1/2 animate-pulse rounded bg-surface-hover" />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 4 }, (_unused, index) => (
            <span key={index} className="block h-20 w-full animate-pulse rounded bg-surface-hover" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !list) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded border border-brand-orange/40 bg-brand-orange/5 px-6 py-12 text-center"
        >
          <AlertTriangle size={24} aria-hidden="true" className="text-brand-orange" />
          <h1 className="font-serif text-xl font-bold text-brand-orange">
            {error ? 'This list could not be loaded' : 'That list does not exist'}
          </h1>
          <p className="max-w-sm text-[12px] leading-relaxed text-text-secondary">
            {error ??
              `No list matches the id “${listId}”. It may have been deleted from this browser.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-11 items-center rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg"
            >
              Try again
            </button>
            <Link
              href="/lists"
              className="inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
            >
              All lists
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isOwner = isReady && list.userId === userId;

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <Link
        href="/lists"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-brand-green"
      >
        <ArrowLeft size={12} aria-hidden="true" />
        All lists
      </Link>

      {!isOwner && list.isPrivate ? (
        <p
          role="status"
          className="mb-4 inline-flex items-center gap-2 rounded border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-[11px] text-brand-orange"
        >
          <Lock size={12} aria-hidden="true" />
          This list is marked private — showing it read-only.
        </p>
      ) : null}

      <ListEditor listId={list.id} variant={isOwner ? 'edit' : 'view'} />
    </main>
  );
}

export default ListDetailPage;
