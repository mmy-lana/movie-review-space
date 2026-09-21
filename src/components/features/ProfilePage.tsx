'use client';

/**
 * Profile island.
 *
 * A member's public face: identity header with stats, the editable "favourite
 * four" poster grid (owner only), and four tabs — watched films, diary, reviews
 * and lists — each derived from the same local queries the dedicated routes use,
 * so profile data can never drift from the page it summarises.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Bookmark,
  CalendarDays,
  Film as FilmIcon,
  Globe,
  MapPin,
  MessageSquare,
  Settings,
  Star,
  UserX,
} from 'lucide-react';
import type { DiaryEntry, Film, FilmList, Review, UserProfile } from '@/types/cine';
import {
  FavoriteFourSelector,
  toFavoriteFourSlots,
  type FavoriteFourSlots,
} from '@/components/compound/FavoriteFourSelector';
import { DiaryRow } from '@/components/compound/DiaryRow';
import { FilmCard } from '@/components/compound/FilmCard';
import { ReviewCard } from '@/components/compound/ReviewCard';
import { ProfileStatsGrid } from '@/components/features/ProfileStatsGrid';
import { useAsyncData } from '@/lib/hooks/useAsyncData';
import { useFilmRatings } from '@/lib/hooks/useFilmRatings';
import { useOptionalQuickLog, useQuickLogSaveSignal } from '@/lib/hooks/useQuickLog';
import { useSeedSignal } from '@/lib/hooks/useSeedSignal';
import { useViewer } from '@/lib/hooks/useViewer';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { getDb } from '@/lib/db/indexdb';
import {
  getDiaryByUser,
  getFavoriteFourFilms,
  getFilmsByIds,
  getListsByUser,
  getProfileByUsername,
  getReviewsByUser,
  getUserRatingHistogram,
} from '@/lib/db/queries';
import { formatCount, formatMonthYear, monthKey } from '@/lib/utils/date-format';

type ProfileTab = 'films' | 'diary' | 'reviews' | 'lists';

const TABS: ReadonlyArray<{ key: ProfileTab; label: string; icon: React.ReactNode }> = [
  { key: 'films', label: 'Films', icon: <FilmIcon size={13} aria-hidden="true" /> },
  { key: 'diary', label: 'Diary', icon: <CalendarDays size={13} aria-hidden="true" /> },
  { key: 'reviews', label: 'Reviews', icon: <MessageSquare size={13} aria-hidden="true" /> },
  { key: 'lists', label: 'Lists', icon: <Bookmark size={13} aria-hidden="true" /> },
];

interface ProfileData {
  profile: UserProfile | null;
  diary: DiaryEntry[];
  reviews: Review[];
  lists: FilmList[];
  favorites: (Film | null)[];
  histogram: Record<string, number>;
}

const EMPTY_PROFILE_DATA: ProfileData = {
  profile: null,
  diary: [],
  reviews: [],
  lists: [],
  favorites: [null, null, null, null],
  histogram: {},
};

export function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username ?? '';

  const seedSignal = useSeedSignal();
  const saveSignal = useQuickLogSaveSignal();
  const { user: viewer, userId, isReady } = useViewer();
  const ratings = useFilmRatings({ userId, enabled: isReady });
  const watchlist = useWatchlist();
  const quickLog = useOptionalQuickLog();

  const [tab, setTab] = useState<ProfileTab>('films');
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async (): Promise<ProfileData> => {
    const profile = await getProfileByUsername(username);
    if (!profile) return EMPTY_PROFILE_DATA;

    const [diary, reviews, lists, favorites, histogram] = await Promise.all([
      getDiaryByUser(profile.id),
      getReviewsByUser(profile.id),
      getListsByUser(profile.id, { includePrivate: true }),
      getFavoriteFourFilms(profile),
      getUserRatingHistogram(profile.id),
    ]);

    return { profile, diary, reviews, lists, favorites, histogram };
  }, [username]);

  const { data, isLoading, error, reload } = useAsyncData<ProfileData>(
    load,
    EMPTY_PROFILE_DATA,
    [username, seedSignal, saveSignal],
  );

  const profile = data.profile;
  const refreshRatings = ratings.refresh;

  useEffect(() => {
    if (saveSignal === 0) return;
    void refreshRatings();
  }, [refreshRatings, saveSignal]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2_600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const isOwner = isReady && viewer !== null && profile !== null && viewer.id === profile.id;

  const watchedFilmIds = useMemo(
    () => [...new Set(data.diary.filter((entry) => !entry.isDeleted).map((entry) => entry.filmId))],
    [data.diary],
  );

  const loadWatched = useCallback(
    () => getFilmsByIds(watchedFilmIds),
    [watchedFilmIds],
  );

  const { data: watchedFilms } = useAsyncData<Film[]>(loadWatched, [], [watchedFilmIds]);

  const diaryGroups = useMemo(() => {
    const buckets = new Map<string, DiaryEntry[]>();
    for (const entry of data.diary) {
      const key = monthKey(entry.watchedDate);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }
    return [...buckets.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, entries]) => ({ key, label: formatMonthYear(`${key}-01`), entries }));
  }, [data.diary]);

  /** Persists a new favourite four selection and refreshes the profile row. */
  const handleFavoritesChange = useCallback(
    async (next: FavoriteFourSlots) => {
      if (!profile) return;
      try {
        await getDb().profiles.update(profile.id, {
          favoriteFilmIds: [
            next[0] ?? null,
            next[1] ?? null,
            next[2] ?? null,
            next[3] ?? null,
          ],
          updatedAt: new Date().toISOString(),
        });
        setFlash('Favourite four updated');
        reload();
      } catch (cause: unknown) {
        setFlash(
          cause instanceof Error
            ? `Favourites could not be saved: ${cause.message}`
            : 'Favourites could not be saved.',
        );
      }
    },
    [profile, reload],
  );

  if (isLoading && !profile) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8" role="status">
        <span className="sr-only">Loading profile</span>
        <div className="flex items-center gap-4">
          <span className="h-20 w-20 animate-pulse rounded-full bg-surface-hover" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-5 w-1/3 animate-pulse rounded bg-surface-hover" />
            <span className="h-3 w-1/4 animate-pulse rounded bg-surface-hover" />
          </span>
        </div>
        <span className="mt-6 block h-24 w-full animate-pulse rounded bg-surface-hover" />
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded border border-brand-orange/40 bg-brand-orange/5 px-6 py-12 text-center"
        >
          <UserX size={24} aria-hidden="true" className="text-brand-orange" />
          <h1 className="font-serif text-xl font-bold text-brand-orange">
            {error ? 'This profile could not be loaded' : 'No such member'}
          </h1>
          <p className="max-w-sm text-[12px] leading-relaxed text-text-secondary">
            {error ?? `Nobody in this library uses the username “${username}”.`}
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
              href="/"
              className="inline-flex min-h-11 items-center rounded border border-border-strong px-4 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
            >
              Go home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-4 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-5">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.avatarUrl}
            alt={`${profile.displayName} avatar`}
            width={80}
            height={80}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-border-strong object-cover"
          />

          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl font-bold leading-tight tracking-tight text-text-primary sm:text-3xl">
              {profile.displayName}
            </h1>
            <p className="font-mono text-[11px] text-text-muted">@{profile.username}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">
              {profile.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} aria-hidden="true" />
                  {profile.location}
                </span>
              ) : null}
              <span>Joined {monthKey(profile.createdAt).slice(0, 4)}</span>
              <span>{formatCount(profile.stats.followersCount)} followers</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {isOwner ? (
              <Link
                href="#local-data"
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-border-subtle px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <Settings size={13} aria-hidden="true" />
                Local data
              </Link>
            ) : null}
            {profile.website ? (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-border-subtle px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-cyan hover:text-brand-cyan"
              >
                <Globe size={13} aria-hidden="true" />
                Website
              </a>
            ) : null}
          </div>
        </div>

        {profile.bio ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
            {profile.bio}
          </p>
        ) : null}

        {flash ? (
          <p
            role="status"
            className="animate-fade-in rounded border border-brand-green/40 bg-brand-green/10 px-3 py-2 text-[11px] text-brand-green"
          >
            {flash}
          </p>
        ) : null}
      </header>

      <section aria-label="Statistics" className="mt-5">
        <ProfileStatsGrid
          stats={profile.stats}
          histogram={data.histogram}
          showHistogram
          userRating={ratings.getRating(data.favorites[0]?.id ?? '')}
        />
      </section>

      <section aria-labelledby="section-favourites" className="mt-6">
        <h2
          id="section-favourites"
          className="mb-3 flex items-center gap-2 border-b border-border-subtle pb-2 font-serif text-lg font-bold tracking-tight text-text-primary"
        >
          <Star size={16} aria-hidden="true" className="text-brand-orange" />
          Favourite four
        </h2>
        <FavoriteFourSelector
          value={toFavoriteFourSlots(profile)}
          onChange={(next) => void handleFavoritesChange(next)}
          films={data.favorites}
          readOnly={!isOwner}
          showLabels={isOwner}
        />
      </section>

      <nav aria-label="Profile sections" className="mt-8 border-b border-border-subtle">
        <ul className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((entry) => {
            const count =
              entry.key === 'films'
                ? watchedFilmIds.length
                : entry.key === 'diary'
                  ? data.diary.length
                  : entry.key === 'reviews'
                    ? data.reviews.length
                    : data.lists.length;

            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => setTab(entry.key)}
                  aria-current={tab === entry.key ? 'true' : undefined}
                  className={`-mb-px inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    tab === entry.key
                      ? 'border-brand-green text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {entry.icon}
                  {entry.label}
                  <span className="tabular font-mono text-[10px] text-text-dim">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="pt-5">
        {tab === 'films' ? (
          watchedFilms.length === 0 ? (
            <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center text-[12px] text-text-muted">
              {isOwner
                ? 'You have not logged any films yet. Open a film and log it to fill this grid.'
                : 'This member has not logged any films yet.'}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5">
              {watchedFilms.map((film, index) => (
                <li key={film.id}>
                  <FilmCard
                    film={film}
                    userRating={isOwner ? ratings.getRating(film.id) : null}
                    isLiked={isOwner ? ratings.isLiked(film.id) : false}
                    isInWatchlist={
                      isOwner && watchlist.isReady ? watchlist.has(film.id) : undefined
                    }
                    onToggleLike={
                      isOwner ? (target, next) => void ratings.toggleLike(target, next) : undefined
                    }
                    onToggleWatchlist={
                      isOwner ? (target) => watchlist.toggle(target.id) : undefined
                    }
                    onQuickLog={
                      isOwner && quickLog
                        ? (target) => quickLog.open({ film: target })
                        : undefined
                    }
                    priority={index < 4}
                  />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'diary' ? (
          data.diary.length === 0 ? (
            <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center text-[12px] text-text-muted">
              No diary entries here yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {diaryGroups.slice(0, 6).map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h3 className="mb-2 flex items-baseline justify-between gap-3 border-b border-border-subtle px-1 pb-1">
                    <span className="font-serif text-sm font-bold text-text-primary">
                      {group.label}
                    </span>
                    <span className="tabular font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      {group.entries.length} {group.entries.length === 1 ? 'film' : 'films'}
                    </span>
                  </h3>
                  <ul className="rounded border border-border-subtle bg-surface-panel">
                    {group.entries.map((entry) => (
                      <DiaryRow
                        key={entry.id}
                        entry={entry}
                        onEdit={
                          isOwner && quickLog
                            ? () => quickLog.open({ film: entry.film ?? null, entryId: entry.id })
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {data.diary.length > 0 ? (
                <Link
                  href="/diary"
                  className="mx-auto inline-flex min-h-11 items-center rounded border border-border-strong px-5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-brand-green hover:text-text-primary"
                >
                  Open the full diary
                </Link>
              ) : null}
            </div>
          )
        ) : null}

        {tab === 'reviews' ? (
          data.reviews.length === 0 ? (
            <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center text-[12px] text-text-muted">
              No written reviews yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.reviews.map((review) => (
                <li key={review.id}>
                  <ReviewCard
                    review={review}
                    user={review.user ?? null}
                    film={review.film ?? null}
                    viewerId={userId}
                    showFilmHeader
                  />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'lists' ? (
          data.lists.length === 0 ? (
            <p className="rounded border border-dashed border-border-subtle bg-surface-panel px-4 py-10 text-center text-[12px] text-text-muted">
              No lists yet.
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              {data.lists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="flex min-h-[72px] flex-col justify-center gap-1 rounded border border-border-subtle bg-surface-panel p-3 transition-colors hover:border-brand-green/60"
                  >
                    <span className="truncate font-serif text-sm font-bold text-text-primary">
                      {list.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      {formatCount(list.items.length)} films · {list.isRanked ? 'Ranked' : 'Unranked'}
                      {list.isPrivate ? ' · Private' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {isOwner ? (
        <section
          id="local-data"
          aria-labelledby="section-local-data"
          className="mt-10 rounded border border-border-subtle bg-surface-panel p-4"
        >
          <h2
            id="section-local-data"
            className="font-serif text-base font-bold tracking-tight text-text-primary"
          >
            Storage &amp; local data
          </h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">
            Everything on this profile lives in this browser&apos;s IndexedDB under the database
            name <code className="font-mono text-[11px] text-brand-cyan">CineSocialBoxdDB</code>.
            Clearing site data for this origin removes it permanently — there is no server copy
            and no sync.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Watched', value: watchedFilmIds.length },
              { label: 'Diary logs', value: data.diary.length },
              { label: 'Written reviews', value: data.reviews.length },
              { label: 'Lists', value: data.lists.length },
            ].map((row) => (
              <div key={row.label} className="rounded border border-border-subtle px-3 py-2">
                <dt className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
                  {row.label}
                </dt>
                <dd className="tabular font-serif text-base font-bold text-text-primary">
                  {formatCount(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}

export default ProfilePage;
