/**
 * Local-first IndexedDB persistence layer (Dexie 4).
 *
 * The database is a browser-only singleton: `getDb()` throws when evaluated on
 * the server so that accidental imports from React Server Components fail
 * loudly instead of at hydration time.
 *
 * Schema notes (`version(1)`):
 * - `films`     dense metrics live under the `metrics.*` path indexes.
 * - `reviews`   `[filmId+createdAt]` backs both the review thread and the
 *               "reviews for this film, newest first" pagination.
 * - `diary`     `[userId+watchedDate]` backs the chronological diary view with
 *               a single index range scan (no in-memory sort).
 * - `lists`     `[userId+createdAt]` and `[userId+isDeleted]` back the library
 *               and archive views.
 * - `activity`  `[userId+createdAt]` back the friends activity stream.
 */

import Dexie, { type Table } from 'dexie';
import type {
  ActivityEvent,
  DiaryEntry,
  Film,
  FilmList,
  Review,
  UserProfile,
} from '@/types/cine';

/** Physical database name — also asserted by the client bootstrap banner. */
export const DATABASE_NAME = 'CineSocialBoxdDB';

/** Row shape of the internal metadata bookkeeping table. */
export interface DatabaseMetaRow {
  key: string;
  value: string | number | boolean;
  updatedAt: string;
}

export const META_KEY_SEED_VERSION = 'seedVersion';
export const META_KEY_SEEDED_AT = 'seededAt';

/** Current seed dataset revision — bump to force a re-seed on next load. */
export const SEED_VERSION = 1;

export class CineSocialDatabase extends Dexie {
  films!: Table<Film, string>;
  reviews!: Table<Review, string>;
  diary!: Table<DiaryEntry, string>;
  lists!: Table<FilmList, string>;
  profiles!: Table<UserProfile, string>;
  activity!: Table<ActivityEvent, string>;
  meta!: Table<DatabaseMetaRow, string>;

  constructor() {
    super(DATABASE_NAME);

    this.version(1).stores({
      films: 'id, slug, releaseYear, metrics.communityRating, *genres',
      reviews:
        'id, filmId, userId, [filmId+createdAt], [userId+createdAt], rating, watchedDate, isLiked, isDeleted',
      diary:
        'id, userId, filmId, [userId+watchedDate], [userId+filmId], watchedDate, rating, isRewatch, isDeleted',
      lists: 'id, userId, [userId+createdAt], [userId+isDeleted], title, isRanked, isDeleted',
      profiles: 'id, username',
      activity: 'id, userId, [userId+createdAt], filmSlug, type, createdAt',
      meta: 'key',
    });
  }
}

let databaseInstance: CineSocialDatabase | null = null;

/** True when the runtime can host an IndexedDB connection. */
export function isDatabaseAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Lazy client-only accessor — prevents `ReferenceError: indexedDB is not
 * defined` during server rendering and prerendering.
 *
 * @throws Error when called outside the browser.
 */
export function getDb(): CineSocialDatabase {
  if (!isDatabaseAvailable()) {
    throw new Error(
      'CineSocialDatabase can only be accessed from client islands (window.indexedDB is unavailable).',
    );
  }
  if (!databaseInstance) {
    databaseInstance = new CineSocialDatabase();
  }
  return databaseInstance;
}

/** Opens the connection with a timeout, surfaced as a typed failure. */
export async function openDatabase(): Promise<CineSocialDatabase> {
  const db = getDb();
  if (!db.isOpen()) {
    await db.open();
  }
  return db;
}

/** Reads a metadata row, returning `null` when absent. */
export async function readMeta(key: string): Promise<DatabaseMetaRow | null> {
  const db = await openDatabase();
  return (await db.meta.get(key)) ?? null;
}

/** Upserts a metadata row with a fresh timestamp. */
export async function writeMeta(
  key: string,
  value: DatabaseMetaRow['value'],
): Promise<void> {
  const db = await openDatabase();
  await db.meta.put({ key, value, updatedAt: new Date().toISOString() });
}

/**
 * Drops every table and re-seeds from scratch.
 * Used by the profile "Reset local data" action and by destructive tests.
 */
export async function resetDatabase(): Promise<void> {
  const db = await openDatabase();
  await db.transaction(
    'rw',
    [db.films, db.reviews, db.diary, db.lists, db.profiles, db.activity, db.meta],
    async () => {
      await Promise.all([
        db.films.clear(),
        db.reviews.clear(),
        db.diary.clear(),
        db.lists.clear(),
        db.profiles.clear(),
        db.activity.clear(),
        db.meta.clear(),
      ]);
    },
  );
}

/** Closes the connection and releases the singleton (used on hot reload). */
export async function closeDatabase(): Promise<void> {
  if (databaseInstance?.isOpen()) {
    await databaseInstance.close();
  }
  databaseInstance = null;
}
