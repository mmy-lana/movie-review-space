'use client';

/**
 * List editor.
 *
 * Two modes behind one component:
 * - `variant="edit"` renders the owner's editor: drag-to-reorder rows (mouse,
 *   touch and keyboard via dnd-kit sensors), inline notes, removal, a film
 *   picker modal and the list's ranked/private switches.
 * - `variant="view"` renders the same rows read-only, for visitors.
 *
 * Reordering is optimistic: the row lands where it was dropped and the fractional
 * index write happens behind it, rolling back on failure. Keyboard users get the
 * same reordering through dnd-kit's `KeyboardSensor` paired with
 * `sortableKeyboardCoordinates`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Check,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Trophy,
  Unlock,
} from 'lucide-react';
import type { Film, ListItem } from '@/types/cine';
import { Modal } from '@/components/ui/Modal';
import { PosterImage } from '@/components/ui/PosterImage';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { searchFilms } from '@/lib/db/queries';
import { formatCommunityRating } from '@/lib/utils/rating-math';
import { formatCount } from '@/lib/utils/date-format';
import { MAX_ITEM_NOTE_LENGTH, useListEditor } from '@/lib/hooks/useListEditor';

const WATCHLIST_STORAGE_KEY = 'cineslate:watchlist:v1';
const WATCHLIST_CHANGE_EVENT = 'cineslate:watchlist-change';

export interface ListEditorProps {
  listId: string;
  /** `edit` shows owner controls; `view` is read-only for visitors. */
  variant?: 'edit' | 'view';
  className?: string;
}

interface SortableRowProps {
  item: ListItem;
  index: number;
  isRanked: boolean;
  readOnly: boolean;
  onNoteChange?: (itemId: string, note: string) => void;
  onRemove?: (itemId: string) => void;
  onAddToWatchlist?: (film: Film) => void;
}

function SortableRow({
  item,
  index,
  isRanked,
  readOnly,
  onNoteChange,
  onRemove,
  onAddToWatchlist,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: readOnly,
  });

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.customNote ?? '');

  useEffect(() => {
    setNoteDraft(item.customNote ?? '');
  }, [item.customNote]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  const film = item.film;
  const filmTitle = film?.title ?? 'Unknown film';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded border bg-surface-panel p-2.5 transition-shadow sm:gap-3 sm:p-3 ${
        isDragging ? 'border-brand-green shadow-popover' : 'border-border-subtle'
      }`}
    >
      {!readOnly ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${filmTitle}. Press space, then use the arrow keys to move it.`}
          className="mt-1 inline-flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-text-dim transition-colors hover:bg-surface-hover hover:text-text-secondary active:cursor-grabbing"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      ) : null}

      {isRanked ? (
        <span
          aria-hidden="true"
          className="tabular mt-1 w-6 shrink-0 text-right font-mono text-sm font-bold text-text-muted"
        >
          {index + 1}
        </span>
      ) : null}

      <div className="w-10 shrink-0 sm:w-12">
        <PosterImage
          src={film?.posterUrl ?? ''}
          title={filmTitle}
          sizeHint="row"
          decorative
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="truncate text-[13px] font-semibold text-text-primary">{filmTitle}</h3>
          {film ? (
            <span className="tabular font-mono text-[10px] text-text-muted">
              {film.releaseYear} · ★ {formatCommunityRating(film.metrics.communityRating)}
            </span>
          ) : null}
        </div>

        {film?.directors[0] ? (
          <p className="truncate text-[11px] text-text-muted">
            Directed by {film.directors[0].name}
          </p>
        ) : null}

        {isEditingNote && !readOnly ? (
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1">
              <span className="sr-only">Note for {filmTitle}</span>
              <textarea
                value={noteDraft}
                onChange={(event) =>
                  setNoteDraft(event.target.value.slice(0, MAX_ITEM_NOTE_LENGTH))
                }
                rows={2}
                autoFocus
                placeholder="Why is this here?"
                className="w-full resize-y rounded border border-border-subtle bg-surface-input px-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-dim focus:border-border-focus focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onNoteChange?.(item.id, noteDraft);
                  setIsEditingNote(false);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded bg-brand-green px-2.5 text-[10px] font-bold uppercase tracking-wider text-surface-bg"
              >
                <Check size={12} aria-hidden="true" />
                Save note
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(item.customNote ?? '');
                  setIsEditingNote(false);
                }}
                className="inline-flex min-h-9 items-center rounded border border-border-subtle px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary"
              >
                Cancel
              </button>
              <span className="tabular ml-auto font-mono text-[10px] text-text-dim">
                {noteDraft.length}/{MAX_ITEM_NOTE_LENGTH}
              </span>
            </div>
          </div>
        ) : item.customNote ? (
          <p className="text-[11px] italic leading-snug text-text-secondary">
            “{item.customNote}”
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={() => setIsEditingNote(true)}
              aria-label={`${item.customNote ? 'Edit' : 'Add'} note for ${filmTitle}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onRemove?.(item.id)}
              aria-label={`Remove ${filmTitle} from the list`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-brand-orange"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => film && onAddToWatchlist?.(film)}
            disabled={!film}
            className="min-h-11 rounded border border-border-subtle px-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-brand-green hover:text-brand-green disabled:cursor-not-allowed disabled:opacity-50"
          >
            Watchlist
          </button>
        )}
      </div>
    </li>
  );
}

interface FilmPickerProps {
  isOpen: boolean;
  onClose: () => void;
  excludeIds: string[];
  onPick: (film: Film) => void;
}

function FilmPickerModal({ isOpen, onClose, excludeIds, onPick }: FilmPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Film[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedTerm = useDebouncedValue(term, 180);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setTerm('');
    setResults([]);
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const query = debouncedTerm.trim();
    if (query.length === 0) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    searchFilms(query, 24)
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? `Films could not be searched: ${cause.message}`
            : 'Films could not be searched.',
        );
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, isOpen]);

  const available = useMemo(
    () => results.filter((film) => !excludeIds.includes(film.id)),
    [excludeIds, results],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add a film"
      description="Search the local catalogue and add a film to this list."
      size="lg"
      initialFocusRef={inputRef}
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 rounded border border-border-subtle bg-surface-input px-3 focus-within:border-border-focus">
          <Search size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="sr-only">Search films to add</span>
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search title, director or cast…"
            className="min-h-11 w-full bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
          />
        </label>

        {isLoading ? (
          <p className="py-6 text-center font-mono text-[11px] text-text-muted" role="status">
            Searching…
          </p>
        ) : error ? (
          <p className="py-6 text-center text-[12px] text-brand-orange" role="alert">
            {error}
          </p>
        ) : term.trim().length === 0 ? (
          <p className="py-6 text-center text-[11px] text-text-muted">
            Start typing to search the catalogue.
          </p>
        ) : available.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-text-secondary" role="status">
            {results.length > 0
              ? 'Every matching film is already on this list.'
              : `No films match “${term.trim()}”.`}
          </p>
        ) : (
          <ul className="grid max-h-[46dvh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {available.map((film) => (
              <li key={film.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(film);
                    onClose();
                  }}
                  className="flex w-full flex-col gap-1.5 rounded border border-border-subtle p-1.5 text-left transition-colors hover:border-brand-green/60 hover:bg-surface-hover/40"
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
                    {film.releaseYear}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export function ListEditor({ listId, variant = 'edit', className = '' }: ListEditorProps) {
  const readOnly = variant === 'view';
  const editor = useListEditor({ listId });

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { list, items } = editor;
  const statusMessage = editor.statusMessage;
  const clearStatus = editor.clearStatus;

  useEffect(() => {
    if (!list) return;
    setTitleDraft(list.title);
    setDescriptionDraft(list.description);
  }, [list]);

  // Auto-dismiss the transient status toast.
  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => clearStatus(), 2_600);
    return () => window.clearTimeout(timer);
  }, [clearStatus, statusMessage]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = items.findIndex((item) => item.id === active.id);
      const toIndex = items.findIndex((item) => item.id === over.id);
      if (fromIndex === -1 || toIndex === -1) return;
      void editor.reorder(fromIndex, toIndex);
    },
    [editor, items],
  );

  const handleAddToWatchlist = useCallback((film: Film) => {
    try {
      const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const current = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
      if (current.includes(film.id)) return;
      window.localStorage.setItem(
        WATCHLIST_STORAGE_KEY,
        JSON.stringify([...current, film.id]),
      );
      window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGE_EVENT));
    } catch {
      // Storage failures are non-fatal for this convenience action.
    }
  }, []);

  if (editor.isLoading) {
    return (
      <div className={`flex flex-col gap-3 ${className}`} role="status" aria-live="polite">
        <span className="sr-only">Loading list</span>
        {Array.from({ length: 4 }, (_unused, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded border border-border-subtle bg-surface-panel p-3"
          >
            <span className="h-[54px] w-9 animate-pulse rounded-sm bg-surface-hover" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
              <span className="h-2.5 w-1/4 animate-pulse rounded bg-surface-hover" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (editor.error && !list) {
    return (
      <div
        role="alert"
        className="rounded border border-brand-orange/40 bg-brand-orange/5 px-4 py-8 text-center"
      >
        <AlertTriangle size={20} aria-hidden="true" className="mx-auto text-brand-orange" />
        <p className="mt-2 text-[13px] font-semibold text-brand-orange">{editor.error}</p>
        <button
          type="button"
          onClick={() => void editor.refresh()}
          className="mt-3 inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!list) return null;

  const isEmpty = items.length === 0;

  return (
    <section className={`flex flex-col gap-4 ${className}`} aria-label={`${list.title} list`}>
      <header className="flex flex-col gap-3 border-b border-border-subtle pb-4">
        {isEditingTitle && !readOnly ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
                List title
              </span>
              <input
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value.slice(0, 120))}
                className="min-h-11 rounded border border-border-subtle bg-surface-input px-3 font-serif text-lg font-bold text-text-primary focus:border-border-focus focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
                Description
              </span>
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value.slice(0, 600))}
                rows={3}
                className="resize-y rounded border border-border-subtle bg-surface-input px-3 py-2 text-[13px] leading-relaxed text-text-secondary focus:border-border-focus focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void editor.updateMeta({
                    title: titleDraft,
                    description: descriptionDraft,
                  });
                  setIsEditingTitle(false);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg"
              >
                <Check size={13} aria-hidden="true" />
                Save details
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(list.title);
                  setDescriptionDraft(list.description);
                  setIsEditingTitle(false);
                }}
                className="inline-flex min-h-11 items-center rounded border border-border-subtle px-4 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
                {list.title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-text-secondary">
                {list.description || 'No description yet.'}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                <span>
                  {items.length} film{items.length === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1">
                  {list.isRanked ? (
                    <>
                      <Trophy size={11} aria-hidden="true" /> Ranked
                    </>
                  ) : (
                    'Unranked'
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  {list.isPrivate ? (
                    <>
                      <Lock size={11} aria-hidden="true" /> Private
                    </>
                  ) : (
                    <>
                      <Unlock size={11} aria-hidden="true" /> Public
                    </>
                  )}
                </span>
                <span>{formatCount(list.likeCount)} likes</span>
              </p>
            </div>

            {!readOnly ? (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded border border-border-subtle px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Pencil size={13} aria-hidden="true" />
                Edit details
              </button>
            ) : null}
          </div>
        )}

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              <Plus size={14} aria-hidden="true" />
              Add film
            </button>

            <button
              type="button"
              onClick={() => void editor.setFlags({ isRanked: !list.isRanked })}
              aria-pressed={list.isRanked}
              className={`inline-flex min-h-11 items-center gap-2 rounded border px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                list.isRanked
                  ? 'border-brand-cyan/50 bg-brand-cyan/10 text-brand-cyan'
                  : 'border-border-subtle text-text-muted hover:border-border-strong hover:text-text-secondary'
              }`}
            >
              <Trophy size={13} aria-hidden="true" />
              Ranked
            </button>

            <button
              type="button"
              onClick={() => void editor.setFlags({ isPrivate: !list.isPrivate })}
              aria-pressed={list.isPrivate}
              className={`inline-flex min-h-11 items-center gap-2 rounded border px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                list.isPrivate
                  ? 'border-brand-orange/50 bg-brand-orange/10 text-brand-orange'
                  : 'border-border-subtle text-text-muted hover:border-border-strong hover:text-text-secondary'
              }`}
            >
              {list.isPrivate ? (
                <Lock size={13} aria-hidden="true" />
              ) : (
                <Unlock size={13} aria-hidden="true" />
              )}
              Private
            </button>

            {items.length > 1 ? (
              <button
                type="button"
                onClick={() => void editor.renumber()}
                className="inline-flex min-h-11 items-center rounded border border-border-subtle px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary"
              >
                Rebuild order
              </button>
            ) : null}

            {editor.isSaving ? (
              <span
                role="status"
                className="font-mono text-[10px] uppercase tracking-wider text-text-dim"
              >
                Saving…
              </span>
            ) : null}
          </div>
        ) : null}

        {editor.error && list ? (
          <p
            role="alert"
            className="rounded border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-[11px] text-brand-orange"
          >
            {editor.error}
          </p>
        ) : null}

        {statusMessage ? (
          <p
            role="status"
            className="animate-fade-in rounded border border-brand-green/40 bg-brand-green/10 px-3 py-2 text-[11px] text-brand-green"
          >
            {statusMessage}
          </p>
        ) : null}
      </header>

      {isEmpty ? (
        <div
          role="status"
          className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-12 text-center"
        >
          <Star size={20} aria-hidden="true" className="text-text-dim" />
          <p className="text-[13px] font-semibold text-text-secondary">
            This list is waiting for its first film
          </p>
          <p className="max-w-xs text-[11px] leading-relaxed text-text-muted">
            {readOnly
              ? 'The owner has not added anything yet.'
              : 'Add films from the local catalogue and rank them by dragging.'}
          </p>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded bg-brand-green px-4 text-[11px] font-bold uppercase tracking-wider text-surface-bg transition-opacity hover:opacity-90"
            >
              <Plus size={14} aria-hidden="true" />
              Add the first film
            </button>
          ) : null}
        </div>
      ) : readOnly ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              isRanked={list.isRanked}
              readOnly
              onAddToWatchlist={handleAddToWatchlist}
            />
          ))}
        </ul>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {items.map((item, index) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={index}
                  isRanked={list.isRanked}
                  readOnly={false}
                  onNoteChange={editor.updateNote}
                  onRemove={editor.removeItem}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {!readOnly ? (
        <FilmPickerModal
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          excludeIds={list.items.map((item) => item.filmId)}
          onPick={(film) => void editor.addFilm(film)}
        />
      ) : null}
    </section>
  );
}

export default ListEditor;
