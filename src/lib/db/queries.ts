/**
 * Typed query helpers over the Dexie schema.
 *
 * Every read the UI performs goes through this module so that relation
 * hydration (film → review, user → list) and soft-delete filtering stay
 * consistent across pages and hooks.
 *
 * Read helpers return `[]` / `null` for missing rows and never throw for
 * "not found" — only genuine IndexedDB failures propagate.
 */

import type {
  ActivityEvent,
  DiaryEntry,
  Film,
  FilmFilterCriteria,
  FilmList,
  ListItem,
  PaginatedResult,
  PartialRatingHistogram,
  RatingHistogram,
  Review,
  StarRating,
  UserProfile,
} from '@/types/cine';
import {
  computeCommunityRating,
  toDenseHistogram,
} from '@/lib/utils/rating-math';
import { toDecade } from '@/lib/utils/date-format';
import { openDatabase } from './indexdb';
import Dexie from 'dexie';

/* -------------------------------------------------------------------------- */
/* Films                                                                       */
/* -------------------------------------------------------------------------- */

/** All films, alphabetical by title. */
export async function getAllFilms(): Promise<Film[]> {
  const db = await openDatabase();
  const films = await db.films.toArray();
  return films.sort((a, b) => a.title.localeCompare(b.title));
}

/** Most-logged films first — the "popular this week" ordering. */
export async function getPopularFilms(limit = 12): Promise<Film[]> {
  const db = await openDatabase();
  const films = await db.films.toArray();
  return films
    .sort(
      (a, b) =>
        b.metrics.logCount - a.metrics.logCount ||
        b.metrics.communityRating - a.metrics.communityRating ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}

/** Highest community rating first. */
export async function getTopRatedFilms(limit = 12): Promise<Film[]> {
  const db = await openDatabase();
  const films = await db.films.toArray();
  return films
    .sort(
      (a, b) =>
        b.metrics.communityRating - a.metrics.communityRating ||
        b.metrics.ratingCount - a.metrics.ratingCount,
    )
    .slice(0, limit);
}

/** Single film by id. */
export async function getFilmById(filmId: string): Promise<Film | null> {
  const db = await openDatabase();
  return (await db.films.get(filmId)) ?? null;
}

/** Single film by URL slug. */
export async function getFilmBySlug(slug: string): Promise<Film | null> {
  const db = await openDatabase();
  return (await db.films.where('slug').equals(slug).first()) ?? null;
}

/** Films referenced by a set of ids, preserving the requested order. */
export async function getFilmsByIds(filmIds: readonly string[]): Promise<Film[]> {
  if (filmIds.length === 0) return [];
  const db = await openDatabase();
  const rows = await db.films.bulkGet([...filmIds]);
  const byId = new Map<string, Film>();
  for (const row of rows) {
    if (row) byId.set(row.id, row);
  }
  return filmIds
    .map((id) => byId.get(id))
    .filter((film): film is Film => film !== undefined);
}

/**
 * Hydrates the four favourite slots, preserving `null` for empty slots.
 * Always returns exactly four entries.
 */
export async function getFavoriteFourFilms(
  profile: Pick<UserProfile, 'favoriteFilmIds'>,
): Promise<(Film | null)[]> {
  const ids = profile.favoriteFilmIds;
  const loaded = await getFilmsByIds(ids.filter((id): id is string => id !== null));
  const byId = new Map(loaded.map((film) => [film.id, film]));
  return ids.map((id) => (id === null ? null : byId.get(id) ?? null));
}

/** Distinct decades present in the catalog, ascending. */
export async function getAvailableDecades(): Promise<number[]> {
  const films = await getAllFilms();
  const decades = new Set<number>();
  for (const film of films) decades.add(toDecade(film.releaseYear));
  return [...decades].sort((a, b) => a - b);
}

/** Distinct genres present in the catalog, alphabetical. */
export async function getAvailableGenres(): Promise<string[]> {
  const films = await getAllFilms();
  const genres = new Set<string>();
  for (const film of films) {
    for (const genre of film.genres) genres.add(genre);
  }
  return [...genres].sort((a, b) => a.localeCompare(b));
}

/**
 * Faceted catalog search. Runs in memory over the (small, fully cached) film
 * table, which keeps compound genre/decade/rating predicates readable while
 * still being instant at this dataset size.
 */
export async function queryFilms(
  criteria: Partial<FilmFilterCriteria>,
): Promise<PaginatedResult<Film>> {
  const films = await getAllFilms();

  const query = criteria.query?.trim().toLowerCase() ?? '';
  const genres = criteria.genres ?? [];
  const decades = criteria.decades ?? [];
  const minRating = criteria.minRating ?? 0;
  const maxRating = criteria.maxRating ?? 5;
  const sortBy = criteria.sortBy ?? 'popularity';
  const sortDirection = criteria.sortDirection ?? 'desc';
  const page = Math.max(1, criteria.page ?? 1);
  const limit = Math.max(1, criteria.limit ?? 24);

  const filtered = films.filter((film) => {
    if (genres.length > 0 && !genres.some((genre) => film.genres.includes(genre))) {
      return false;
    }
    if (decades.length > 0 && !decades.includes(toDecade(film.releaseYear))) {
      return false;
    }
    if (film.metrics.communityRating < minRating) return false;
    if (film.metrics.communityRating > maxRating) return false;
    if (query.length > 0) {
      const haystack = [
        film.title,
        film.originalTitle ?? '',
        film.synopsis,
        film.tagline,
        ...film.genres,
        ...film.directors.map((director) => director.name),
        ...film.cast.map((member) => member.name),
        String(film.releaseYear),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const direction = sortDirection === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'releaseDate':
        return direction * a.releaseDate.localeCompare(b.releaseDate);
      case 'ratingHigh':
        return (
          b.metrics.communityRating - a.metrics.communityRating ||
          b.metrics.ratingCount - a.metrics.ratingCount
        );
      case 'ratingLow':
        return (
          a.metrics.communityRating - b.metrics.communityRating ||
          b.metrics.ratingCount - a.metrics.ratingCount
        );
      case 'runtime':
        return direction * (a.runtimeMinutes - b.runtimeMinutes);
      case 'popularity':
      default:
        return (
          direction * (b.metrics.logCount - a.metrics.logCount) ||
          a.title.localeCompare(b.title)
        );
    }
  });

  const start = (page - 1) * limit;
  const rows = sorted.slice(start, start + limit);

  return {
    rows,
    total: sorted.length,
    page,
    limit,
    hasMore: start + rows.length < sorted.length,
  };
}

/** Full-text film search used by the Cmd+K overlay and favourite picker. */
export async function searchFilms(term: string, limit = 8): Promise<Film[]> {
  if (term.trim().length === 0) return [];
  const result = await queryFilms({
    query: term,
    sortBy: 'popularity',
    page: 1,
    limit,
  });
  return result.rows;
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

/** Reviews for a film, newest watch date first, with author and film wired. */
export async function getReviewsForFilm(
  filmId: string,
  options: { includeDeleted?: boolean; limit?: number } = {},
): Promise<Review[]> {
  const db = await openDatabase();
  const [film, reviews, profiles] = await Promise.all([
    db.films.get(filmId),
    db.reviews.where('filmId').equals(filmId).toArray(),
    db.profiles.toArray(),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const rows = reviews
    .filter((review) => (options.includeDeleted ? true : !review.isDeleted))
    .map((review) => ({
      ...review,
      film: film ?? undefined,
      user: profileById.get(review.userId),
    }))
    .sort(
      (a, b) =>
        b.watchedDate.localeCompare(a.watchedDate) ||
        b.createdAt.localeCompare(a.createdAt),
    );

  return options.limit ? rows.slice(0, options.limit) : rows;
}

/** A user's reviews across every film, newest first. */
export async function getReviewsByUser(
  userId: string,
  options: { includeDeleted?: boolean; limit?: number } = {},
): Promise<Review[]> {
  const db = await openDatabase();
  const [reviews, profiles, films] = await Promise.all([
    db.reviews.where('userId').equals(userId).toArray(),
    db.profiles.toArray(),
    db.films.toArray(),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const filmById = new Map(films.map((film) => [film.id, film]));

  const rows = reviews
    .filter((review) => (options.includeDeleted ? true : !review.isDeleted))
    .map((review) => ({
      ...review,
      user: profileById.get(review.userId),
      film: filmById.get(review.filmId),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return options.limit ? rows.slice(0, options.limit) : rows;
}

/** Activity-stream review lookup: reviews written by a set of users. */
export async function getReviewsForUsers(
  userIds: readonly string[],
  limit = 20,
): Promise<Review[]> {
  if (userIds.length === 0) return [];
  const db = await openDatabase();
  const [reviews, profiles, films] = await Promise.all([
    db.reviews.where('userId').anyOf([...userIds]).toArray(),
    db.profiles.toArray(),
    db.films.toArray(),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const filmById = new Map(films.map((film) => [film.id, film]));

  return reviews
    .filter((review) => !review.isDeleted)
    .map((review) => ({
      ...review,
      user: profileById.get(review.userId),
      film: filmById.get(review.filmId),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Single review with relations. */
export async function getReviewById(reviewId: string): Promise<Review | null> {
  const db = await openDatabase();
  const review = await db.reviews.get(reviewId);
  if (!review || review.isDeleted) return null;
  const [user, film] = await Promise.all([
    db.profiles.get(review.userId),
    db.films.get(review.filmId),
  ]);
  return { ...review, user: user ?? undefined, film: film ?? undefined };
}

/**
 * Rating histogram built from the reviews stored locally.
 * Buckets are keyed by the ten discrete star steps.
 */
export async function getReviewRatingHistogram(
  filter: { userId?: string; filmId?: string } = {},
): Promise<PartialRatingHistogram> {
  const db = await openDatabase();
  const reviews = filter.userId
    ? await db.reviews.where('userId').equals(filter.userId).toArray()
    : filter.filmId
      ? await db.reviews.where('filmId').equals(filter.filmId).toArray()
      : await db.reviews.toArray();

  const histogram: PartialRatingHistogram = {};
  for (const review of reviews) {
    if (review.isDeleted) continue;
    histogram[review.rating] = (histogram[review.rating] ?? 0) + 1;
  }
  return histogram;
}

/* -------------------------------------------------------------------------- */
/* Diary                                                                       */
/* -------------------------------------------------------------------------- */

/** A user's diary, newest watch date first, with films hydrated. */
export async function getDiaryByUser(
  userId: string,
  options: { includeDeleted?: boolean; limit?: number } = {},
): Promise<DiaryEntry[]> {
  const db = await openDatabase();
  const [entries, films] = await Promise.all([
    db.diary.where('userId').equals(userId).toArray(),
    db.films.toArray(),
  ]);
  const filmById = new Map(films.map((film) => [film.id, film]));

  const rows = entries
    .filter((entry) => (options.includeDeleted ? true : !entry.isDeleted))
    .map((entry) => ({ ...entry, film: filmById.get(entry.filmId) }))
    .sort(
      (a, b) =>
        b.watchedDate.localeCompare(a.watchedDate) ||
        b.createdAt.localeCompare(a.createdAt),
    );

  return options.limit ? rows.slice(0, options.limit) : rows;
}

/** Most recent diary entry for a film by a user (drives "watched" badges). */
export async function getLatestDiaryEntry(
  userId: string,
  filmId: string,
): Promise<DiaryEntry | null> {
  const db = await openDatabase();
  const entries = await db.diary
    .where('[userId+filmId]')
    .equals([userId, filmId])
    .toArray();
  const active = entries.filter((entry) => !entry.isDeleted);
  if (active.length === 0) return null;
  return active.sort((a, b) => b.watchedDate.localeCompare(a.watchedDate))[0]!;
}

/** Whether a user has already logged a film (routes the "rewatch" toggle). */
export async function hasUserLoggedFilm(userId: string, filmId: string): Promise<boolean> {
  const db = await openDatabase();
  const count = await db.diary
    .where('[userId+filmId]')
    .equals([userId, filmId])
    .filter((entry) => !entry.isDeleted)
    .count();
  return count > 0;
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

interface HydratedListOptions {
  includePrivate?: boolean;
  includeDeleted?: boolean;
}

/** Every list, newest first, with items sorted and films hydrated. */
export async function getAllLists(
  options: HydratedListOptions = {},
): Promise<FilmList[]> {
  const db = await openDatabase();
  const [lists, profiles, films] = await Promise.all([
    db.lists.toArray(),
    db.profiles.toArray(),
    db.films.toArray(),
  ]);
  return hydrateLists(lists, profiles, films, options);
}

/** Lists authored by one user. */
export async function getListsByUser(
  userId: string,
  options: HydratedListOptions = {},
): Promise<FilmList[]> {
  const db = await openDatabase();
  const [lists, profiles, films] = await Promise.all([
    db.lists.where('userId').equals(userId).toArray(),
    db.profiles.toArray(),
    db.films.toArray(),
  ]);
  return hydrateLists(lists, profiles, films, options);
}

/** A single list with ordered items and hydrated films. */
export async function getListById(
  listId: string,
  options: HydratedListOptions = {},
): Promise<FilmList | null> {
  const db = await openDatabase();
  const list = await db.lists.get(listId);
  if (!list) return null;
  if (list.isDeleted && !options.includeDeleted) return null;
  if (list.isPrivate && !options.includePrivate) return null;

  const [profile, films] = await Promise.all([
    db.profiles.get(list.userId),
    db.films.toArray(),
  ]);
  const filmById = new Map(films.map((film) => [film.id, film]));

  return {
    ...list,
    user: profile ?? undefined,
    items: sortListItems(list.items, list.isRanked).map((item) => ({
      ...item,
      film: filmById.get(item.filmId),
    })),
  };
}

/**
 * Orders list items by their fractional `orderIndex`. Ranked lists render the
 * resulting position as an integer; unranked lists use the same ladder purely
 * to preserve manual arrangement without positional labels.
 */
export function sortListItems(items: readonly ListItem[], _isRanked: boolean): ListItem[] {
  return [...items].sort(
    (a, b) => a.orderIndex - b.orderIndex || a.addedAt.localeCompare(b.addedAt),
  );
}

function hydrateLists(
  lists: readonly FilmList[],
  profiles: readonly UserProfile[],
  films: readonly Film[],
  options: HydratedListOptions,
): FilmList[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const filmById = new Map(films.map((film) => [film.id, film]));

  return lists
    .filter((list) => (options.includeDeleted ? true : !list.isDeleted))
    .filter((list) => (options.includePrivate ? true : !list.isPrivate))
    .map((list) => ({
      ...list,
      user: profileById.get(list.userId),
      itemCount: list.items.length,
      items: sortListItems(list.items, list.isRanked).map((item) => ({
        ...item,
        film: filmById.get(item.filmId),
      })),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

/** Single profile by id. */
export async function getProfileById(userId: string): Promise<UserProfile | null> {
  const db = await openDatabase();
  return (await db.profiles.get(userId)) ?? null;
}

/** Single profile by username (the profile route key). */
export async function getProfileByUsername(
  username: string,
): Promise<UserProfile | null> {
  const db = await openDatabase();
  return (await db.profiles.where('username').equals(username).first()) ?? null;
}

/** Every profile, alphabetical by display name. */
export async function getAllProfiles(): Promise<UserProfile[]> {
  const db = await openDatabase();
  const profiles = await db.profiles.toArray();
  return profiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Profile search for the Cmd+K overlay. */
export async function searchProfiles(term: string, limit = 5): Promise<UserProfile[]> {
  const query = term.trim().toLowerCase();
  if (query.length === 0) return [];
  const profiles = await getAllProfiles();
  return profiles
    .filter(
      (profile) =>
        profile.username.toLowerCase().includes(query) ||
        profile.displayName.toLowerCase().includes(query),
    )
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

/** Full activity stream, newest first. */
export async function getActivityStream(limit = 30): Promise<ActivityEvent[]> {
  const db = await openDatabase();
  const events = await db.activity.toArray();
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Activity authored by a set of users (the friends feed). */
export async function getActivityForUsers(
  userIds: readonly string[],
  limit = 30,
): Promise<ActivityEvent[]> {
  if (userIds.length === 0) return [];
  const db = await openDatabase();
  const events = await db.activity.where('userId').anyOf([...userIds]).toArray();
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Activity referencing a film, newest first. */
export async function getActivityForFilm(
  filmSlug: string,
  limit = 10,
): Promise<ActivityEvent[]> {
  const db = await openDatabase();
  const events = await db.activity.where('filmSlug').equals(filmSlug).toArray();
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Aggregate metrics                                                           */
/* -------------------------------------------------------------------------- */

export interface RatingRefreshOptions {
  histogram: PartialRatingHistogram | RatingHistogram;
  ratingCount: number;
  logCount?: number;
  reviewCount?: number;
}

/**
 * Recomputes `metrics.communityRating` from a histogram so the stored average
 * can never drift from its own distribution.
 */
export async function refreshFilmMetrics(
  filmId: string,
  options: RatingRefreshOptions,
): Promise<void> {
  const db = await openDatabase();
  const film = await db.films.get(filmId);
  if (!film) return;

  const dense = toDenseHistogram(options.histogram);
  const communityRating = computeCommunityRating(dense);
  const updatedAt = new Date().toISOString();

  await db.films.update(filmId, {
    'metrics.communityRating': communityRating,
    'metrics.histogram': dense,
    'metrics.ratingCount': Math.max(0, options.ratingCount),
    ...(options.logCount !== undefined
      ? { 'metrics.logCount': Math.max(0, options.logCount) }
      : {}),
    ...(options.reviewCount !== undefined
      ? { 'metrics.reviewCount': Math.max(0, options.reviewCount) }
      : {}),
    updatedAt,
  });
}

/** Count of every persisted entity — surfaced in the footer/debug panel. */
export async function getDatabaseCounts(): Promise<{
  films: number;
  reviews: number;
  diary: number;
  lists: number;
  profiles: number;
  activity: number;
}> {
  const db = await openDatabase();
  const [films, reviews, diary, lists, profiles, activity] = await Promise.all([
    db.films.count(),
    db.reviews.count(),
    db.diary.count(),
    db.lists.count(),
    db.profiles.count(),
    db.activity.count(),
  ]);
  return { films, reviews, diary, lists, profiles, activity };
}

/** Ratings a user has given, as a dense histogram (profile rating matrix). */
export async function getUserRatingHistogram(userId: string): Promise<RatingHistogram> {
  return toDenseHistogram(await getReviewRatingHistogram({ userId }));
}

/** The viewer's own rating for a film, if any (drives histogram highlighting). */
export async function getUserRatingForFilm(
  userId: string,
  filmId: string,
): Promise<StarRating | null> {
  const db = await openDatabase();
  const reviews = await db.reviews
    .where('[filmId+createdAt]')
    .between([filmId, Dexie.minKey], [filmId, Dexie.maxKey])
    .filter((review) => review.userId === userId && !review.isDeleted)
    .toArray();

  if (reviews.length === 0) return null;
  return reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!.rating;
}
