'use client';

/**
 * Quick-log form.
 *
 * One component serves three entry paths:
 * - free-form ("log a film"), which lazy-loads a catalogue picker;
 * - film-preselected, opened from a poster, a rail, or the search overlay;
 * - edit mode, opened from a diary row with the existing entry loaded.
 *
 * Responsive shell: a `BottomSheet` below `md` (thumb-reachable, swipe-dismissable)
 * and a centred `Modal` above it. Dismissal is locked while a write is in flight
 * so a half-committed log can never be abandoned.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Film as FilmIcon, Search, Star, X } from 'lucide-react';
import type { DiaryEntry, Film, StarRating } from '@/types/cine';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Modal } from '@/components/ui/Modal';
import { PosterImage } from '@/components/ui/PosterImage';
import { StarRatingDisplay } from '@/components/ui/StarRatingDisplay';
import { StarRatingInput } from '@/components/ui/StarRatingInput';
import { useMediaQuery } from '@/lib/hooks/useFocusTrap';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { searchFilms } from '@/lib/db/queries';
import { toIsoDate } from '@/lib/utils/date-format';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import type { DiaryDraft, UseDiaryStoreResult } from '@/lib/hooks/useDiaryStore';

export interface QuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Film pre-selected by the invoking surface, or `null` for free-form. */
  film: Film | null;
  /** Diary entry id when editing an existing log. */
  entryId: string | null;
  /** The diary store that performs the write. */
  diary: UseDiaryStoreResult;
  /** The signed-in viewer id. */
  viewerId: string;
  /** Called after a successful save. */
  onSaved: (result: { entryId: string }) => void;
  /** Reports the write state so the provider can lock dismissal. */
  onBusyChange: (busy: boolean) => void;
}

interface FormState {
  watchedDate: string;
  rating: StarRating | 0;
  isLiked: boolean;
  isRewatch: boolean;
  writeReview: boolean;
  reviewBody: string;
  containsSpoilers: boolean;
}

const MAX_REVIEW_LENGTH = 8_000;

function createInitialForm(): FormState {
  return {
    watchedDate: toIsoDate(),
    rating: 0,
    isLiked: false,
    isRewatch: false,
    writeReview: false,
    reviewBody: '',
    containsSpoilers: false,
  };
}

export function QuickLogModal({
  isOpen,
  onClose,
  film,
  entryId,
  diary,
  viewerId,
  onSaved,
  onBusyChange,
}: QuickLogModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)', false);

  const [selectedFilm, setSelectedFilm] = useState<Film | null>(film);
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerTerm, setPickerTerm] = useState('');
  const [pickerResults, setPickerResults] = useState<Film[]>([]);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const ratingGroupRef = useRef<HTMLDivElement | null>(null);
  const debouncedPickerTerm = useDebouncedValue(pickerTerm, 180);

  const existingEntry = useMemo<DiaryEntry | null>(
    () => (entryId ? diary.entries.find((entry) => entry.id === entryId) ?? null : null),
    [diary.entries, entryId],
  );

  // Whether this film has been logged before — drives the rewatch affordance.
  const previousLogCount = useMemo(() => {
    if (!selectedFilm) return 0;
    return diary.entries.filter(
      (entry) => entry.filmId === selectedFilm.id && entry.id !== existingEntry?.id,
    ).length;
  }, [diary.entries, existingEntry?.id, selectedFilm]);

  // Hydrate the form whenever the surface opens.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPickerTerm('');
    setPickerResults([]);
    setPickerError(null);

    if (existingEntry) {
      setSelectedFilm(existingEntry.film ?? film ?? null);
      setForm({
        watchedDate: existingEntry.watchedDate,
        rating: existingEntry.rating,
        isLiked: existingEntry.isLiked,
        isRewatch: existingEntry.isRewatch,
        writeReview: false,
        reviewBody: '',
        containsSpoilers: false,
      });
      return;
    }

    setSelectedFilm(film ?? null);
    setForm(createInitialForm());
  }, [existingEntry, film, isOpen]);

  // Debounced catalogue picker for the free-form path.
  useEffect(() => {
    if (!isOpen || selectedFilm !== null) return;
    const term = debouncedPickerTerm.trim();
    if (term.length === 0) {
      setPickerResults([]);
      setIsPickerLoading(false);
      return;
    }

    let cancelled = false;
    setIsPickerLoading(true);
    setPickerError(null);

    searchFilms(term, 12)
      .then((rows) => {
        if (!cancelled) setPickerResults(rows);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setPickerError(
          cause instanceof Error
            ? `Films could not be searched: ${cause.message}`
            : 'Films could not be searched.',
        );
        setPickerResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsPickerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedPickerTerm, isOpen, selectedFilm]);

  useEffect(() => {
    onBusyChange(isSaving);
  }, [isSaving, onBusyChange]);

  const handleSave = useCallback(async () => {
    if (!selectedFilm) {
      setError('Pick a film before saving this log.');
      return;
    }
    if (form.rating === 0) {
      setError('Choose a rating between 0.5 and 5 stars.');
      ratingGroupRef.current?.focus?.();
      return;
    }

    setIsSaving(true);
    setError(null);

    const draft: DiaryDraft = {
      filmId: selectedFilm.id,
      watchedDate: form.watchedDate,
      rating: form.rating as StarRating,
      isLiked: form.isLiked,
      isRewatch: form.isRewatch,
      writeReview: form.writeReview,
      reviewBody: form.reviewBody,
      containsSpoilers: form.containsSpoilers,
    };

    const result = await diary.saveEntry(draft, existingEntry?.id);
    setIsSaving(false);

    if (result.ok) {
      onSaved({ entryId: result.entry.id });
      onClose();
      return;
    }

    setError(result.error);
  }, [diary, existingEntry?.id, form, onClose, onSaved, selectedFilm]);

  const handleRemove = useCallback(async () => {
    if (!existingEntry) return;
    setIsSaving(true);
    setError(null);
    const result = await diary.deleteEntry(existingEntry.id);
    setIsSaving(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error ?? 'The log could not be removed.');
  }, [diary, existingEntry, onClose]);

  const title = existingEntry
    ? 'Edit log'
    : selectedFilm
      ? `Log ${selectedFilm.title}`
      : 'Log a film';

  const description = selectedFilm
    ? `${selectedFilm.releaseYear} · ★ ${formatCommunityRating(
        selectedFilm.metrics.communityRating,
      )} community average`
    : 'Search the catalogue to start a new diary entry.';

  const body = (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-[12px] leading-snug text-brand-orange"
        >
          {error}
        </p>
      ) : null}

      {selectedFilm ? (
        <div className="flex items-center gap-3 rounded border border-border-subtle bg-surface-panel p-2.5">
          <PosterImage
            src={selectedFilm.posterUrl}
            title={selectedFilm.title}
            sizeHint="row"
            decorative
            className="!w-10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-text-primary">
              {selectedFilm.title}
            </p>
            <p className="tabular mt-0.5 truncate font-mono text-[10px] text-text-muted">
              {selectedFilm.releaseYear} · {selectedFilm.directors[0]?.name ?? 'Unknown director'}
            </p>
          </div>
          {existingEntry ? null : (
            <button
              type="button"
              onClick={() => {
                setSelectedFilm(null);
                setPickerTerm('');
              }}
              aria-label="Change selected film"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="relative flex items-center gap-2 rounded border border-border-subtle bg-surface-input px-3 focus-within:border-border-focus">
            <Search size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
            <span className="sr-only">Search the film catalogue</span>
            <input
              type="search"
              value={pickerTerm}
              onChange={(event) => setPickerTerm(event.target.value)}
              placeholder="Search title, year or director…"
              className="min-h-11 w-full bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
            />
          </label>

          {isPickerLoading ? (
            <p className="py-4 text-center font-mono text-[11px] text-text-muted" role="status">
              Searching…
            </p>
          ) : pickerError ? (
            <p className="py-4 text-center text-[12px] text-brand-orange" role="alert">
              {pickerError}
            </p>
          ) : pickerTerm.trim().length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-4 text-center text-[11px] text-text-muted">
              <FilmIcon size={13} aria-hidden="true" />
              Start typing to find a film.
            </p>
          ) : pickerResults.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-text-secondary" role="status">
              No films match “{pickerTerm.trim()}”.
            </p>
          ) : (
            <ul className="grid max-h-[38dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {pickerResults.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedFilm(candidate)}
                    className="flex w-full flex-col gap-1.5 rounded border border-border-subtle p-1.5 text-left transition-colors hover:border-brand-green/60 hover:bg-surface-hover/40"
                  >
                    <PosterImage
                      src={candidate.posterUrl}
                      title={candidate.title}
                      sizeHint="grid"
                      decorative
                    />
                    <span className="truncate text-[11px] font-semibold text-text-primary">
                      {candidate.title}
                    </span>
                    <span className="tabular font-mono text-[10px] text-text-muted">
                      {candidate.releaseYear}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
          Your rating
        </legend>
        <div ref={ratingGroupRef} tabIndex={-1}>
          <StarRatingInput
            value={form.rating}
            onChange={(rating) => setForm((current) => ({ ...current, rating }))}
            label={selectedFilm ? `Rate ${selectedFilm.title}` : 'Rate the selected film'}
            disabled={isSaving}
            size="lg"
          />
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
            Watched on
          </span>
          <span className="relative flex items-center gap-2 rounded border border-border-subtle bg-surface-input px-3 focus-within:border-border-focus">
            <CalendarDays size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
            <input
              type="date"
              value={form.watchedDate}
              max={toIsoDate()}
              onChange={(event) =>
                setForm((current) => ({ ...current, watchedDate: event.target.value }))
              }
              disabled={isSaving}
              className="min-h-11 w-full bg-transparent text-sm text-text-primary focus:outline-none"
            />
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
            Flags
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, isLiked: !current.isLiked }))}
              aria-pressed={form.isLiked}
              disabled={isSaving}
              className={`inline-flex min-h-11 items-center gap-2 rounded border px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                form.isLiked
                  ? 'border-brand-orange/50 bg-brand-orange/10 text-brand-orange'
                  : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
              }`}
            >
              <Star size={13} aria-hidden="true" className={form.isLiked ? 'fill-brand-orange' : ''} />
              Liked
            </button>

            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, isRewatch: !current.isRewatch }))}
              aria-pressed={form.isRewatch}
              disabled={isSaving}
              className={`inline-flex min-h-11 items-center gap-2 rounded border px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                form.isRewatch
                  ? 'border-brand-cyan/50 bg-brand-cyan/10 text-brand-cyan'
                  : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
              }`}
            >
              <span aria-hidden="true">↺</span>
              Rewatch
            </button>
          </div>
          {previousLogCount > 0 && !form.isRewatch ? (
            <p className="text-[10px] text-text-dim">
              You have logged this film {previousLogCount} time
              {previousLogCount === 1 ? '' : 's'} before — consider marking it a rewatch.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-panel p-3">
        <button
          type="button"
          onClick={() =>
            setForm((current) => ({ ...current, writeReview: !current.writeReview }))
          }
          aria-pressed={form.writeReview}
          disabled={isSaving}
          className="flex min-h-11 items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-[12px] font-semibold text-text-primary">
              {existingEntry?.reviewId ? 'Update the written review' : 'Write a review'}
            </span>
            <span className="mt-0.5 block text-[11px] text-text-muted">
              Markdown is supported: headings, lists, quotes, links, bold and italic.
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              form.writeReview ? 'bg-brand-green' : 'bg-surface-hover'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface-bg transition-transform ${
                form.writeReview ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>

        {form.writeReview ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">Review body</span>
              <textarea
                value={form.reviewBody}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reviewBody: event.target.value.slice(0, MAX_REVIEW_LENGTH),
                  }))
                }
                rows={6}
                disabled={isSaving}
                placeholder="What stayed with you?"
                className="min-h-[120px] w-full resize-y rounded border border-border-subtle bg-surface-input px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-dim focus:border-border-focus focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    containsSpoilers: !current.containsSpoilers,
                  }))
                }
                aria-pressed={form.containsSpoilers}
                disabled={isSaving}
                className={`inline-flex min-h-9 items-center gap-2 rounded border px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  form.containsSpoilers
                    ? 'border-brand-orange/50 bg-brand-orange/10 text-brand-orange'
                    : 'border-border-subtle bg-surface-input text-text-secondary hover:border-border-strong'
                }`}
              >
                <span aria-hidden="true">⚠</span>
                Contains spoilers
              </button>
              <span className="tabular font-mono text-[10px] text-text-dim">
                {form.reviewBody.length}/{MAX_REVIEW_LENGTH}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {existingEntry ? (
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <StarRatingDisplay rating={existingEntry.rating} size="sm" showNumeric />
          <span>
            Edited log from {existingEntry.watchedDate} · viewer {viewerId.slice(0, 8)}
          </span>
        </div>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex items-center gap-2">
      {existingEntry ? (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isSaving}
          className="min-h-11 rounded border border-border-subtle px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-brand-orange/60 hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-50"
        >
          Remove
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        disabled={isSaving}
        className="ml-auto min-h-11 rounded border border-border-subtle px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || selectedFilm === null}
        className="min-h-11 rounded bg-brand-green px-5 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : existingEntry ? 'Save changes' : 'Save log'}
      </button>
    </div>
  );

  if (isDesktop) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        description={description}
        size="md"
        preventDismiss={isSaving}
        footer={footer}
      >
        {body}
      </Modal>
    );
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      preventDismiss={isSaving}
      footer={footer}
    >
      {body}
    </BottomSheet>
  );
}

export default QuickLogModal;
