import Dexie, { Table } from 'dexie';
import { Film, Review, DiaryEntry, FilmList, UserProfile } from '@/types/cine';

export class CineSocialDatabase extends Dexie {
  films!: Table<Film, string>;
  reviews!: Table<Review, string>;
  diary!: Table<DiaryEntry, string>;
  lists!: Table<FilmList, string>;
  profiles!: Table<UserProfile, string>;

  constructor() {
    super('CineSocialBoxdDB');

    this.version(1).stores({
      films: 'id, slug, releaseYear, metrics.communityRating, *genres',
      reviews: 'id, filmId, userId, [userId+filmId], rating, watchedDate, isLiked, isDeleted, createdAt',
      diary: 'id, userId, filmId, [userId+filmId], watchedDate, rating, isRewatch, isDeleted',
      lists: 'id, userId, title, isRanked, isPrivate, isDeleted, createdAt',
      profiles: 'id, username',
    });

    this.version(2).stores({}).upgrade(() => {});
  }
}

let dbInstance: CineSocialDatabase | null = null;

export function getDb(): CineSocialDatabase {
  if (typeof window === 'undefined') {
    throw new Error('CineSocialDatabase can only be accessed on client islands.');
  }
  if (!dbInstance) {
    dbInstance = new CineSocialDatabase();
  }
  return dbInstance;
}
