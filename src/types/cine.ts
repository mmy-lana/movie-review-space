/**
 * CINE-SOCIAL-BOXD — Pure domain type contracts.
 *
 * Every interface in this module is dependency-free so it can be imported from
 * React Server Components, Client Islands, Dexie table declarations and plain
 * Node scripts without pulling browser globals into the module graph.
 */

/** The ten discrete Letterboxd rating intervals (0.5 → 5.0). */
export type StarRating = 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0;

/** Canonical ordered list of rating steps — the single source of truth. */
export const STAR_RATING_STEPS: readonly StarRating[] = [
  0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0,
] as const;

/** Lowest selectable rating value. */
export const MIN_STAR_RATING = 0.5;
/** Highest selectable rating value. */
export const MAX_STAR_RATING = 5.0;
/** Discrete interval between adjacent ratings. */
export const STAR_RATING_INCREMENT = 0.5;

export type CrewRole =
  | 'Director'
  | 'Writer'
  | 'Producer'
  | 'Cinematographer'
  | 'Editor'
  | 'Composer';

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  avatarUrl?: string;
}

export interface CastMember {
  id: string;
  name: string;
  character: string;
  avatarUrl?: string;
  order: number;
}

/** Dense rating distribution — all ten buckets materialised. */
export type RatingHistogram = Record<StarRating, number>;

/** Sparse histogram as it arrives from the API (`Partial` per the spec). */
export type PartialRatingHistogram = Partial<Record<StarRating, number>>;

export interface FilmMetrics {
  /** 0.00 – 5.00 weighted community average. */
  communityRating: number;
  ratingCount: number;
  logCount: number;
  reviewCount: number;
  listCount: number;
  likeCount: number;
  histogram: PartialRatingHistogram;
}

export interface Film {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  releaseYear: number;
  /** ISO 8601 calendar date (`YYYY-MM-DD`). */
  releaseDate: string;
  runtimeMinutes: number;
  tagline: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string;
  genres: string[];
  directors: CrewMember[];
  cast: CastMember[];
  metrics: FilmMetrics;
  tmdbId?: number;
  imdbId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStats {
  filmsWatched: number;
  thisYearCount: number;
  listsCreated: number;
  reviewsWritten: number;
  followingCount: number;
  followersCount: number;
  totalWatchTimeMinutes: number;
}

/** Exactly four slots; `null` marks an unfilled "Add film" placeholder. */
export type FavoriteFour = [string | null, string | null, string | null, string | null];

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  website?: string;
  location?: string;
  favoriteFilmIds: FavoriteFour;
  stats: UserStats;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  filmId: string;
  userId: string;
  rating: StarRating;
  isLiked: boolean;
  containsSpoilers: boolean;
  /** Markdown source, rendered through the XSS-safe parser. */
  reviewBody: string;
  /** ISO 8601 calendar date (`YYYY-MM-DD`). */
  watchedDate: string;
  isRewatch: boolean;
  likeCount: number;
  commentCount: number;
  isDeleted?: boolean;
  /** Hydrated relation, populated by query helpers (never persisted). */
  user?: UserProfile;
  film?: Film;
  createdAt: string;
  updatedAt: string;
}

export interface DiaryEntry {
  id: string;
  userId: string;
  filmId: string;
  reviewId?: string;
  /** ISO 8601 calendar date (`YYYY-MM-DD`). */
  watchedDate: string;
  /**
   * The viewer's rating for this watch. `0` is the "unrated" sentinel used by a
   * row created purely to record a like; such a row must never enter the rating
   * histogram, the community distribution or the viewer's rating maps.
   */
  rating: StarRating | 0;
  isLiked: boolean;
  isRewatch: boolean;
  isDeleted?: boolean;
  film?: Film;
  createdAt: string;
  updatedAt?: string;
}

export interface ListItem {
  id: string;
  listId: string;
  filmId: string;
  /** Fractional index (e.g. 1000, 1500) enabling O(1) single-row reordering. */
  orderIndex: number;
  customNote?: string;
  film?: Film;
  addedAt: string;
}

export interface FilmList {
  id: string;
  userId: string;
  title: string;
  description: string;
  isRanked: boolean;
  isPrivate: boolean;
  itemCount: number;
  likeCount: number;
  tags: string[];
  items: ListItem[];
  isDeleted?: boolean;
  user?: UserProfile;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | 'LOG_FILM'
  | 'REVIEW_FILM'
  | 'LIKE_REVIEW'
  | 'CREATE_LIST'
  | 'FOLLOW_USER';

export interface ActivityMetadata {
  filmTitle?: string;
  filmYear?: number;
  filmPoster?: string;
  rating?: StarRating;
  isLiked?: boolean;
  listTitle?: string;
  reviewSnippet?: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  user: UserProfile;
  type: ActivityType;
  /** Review ID, Film ID, List ID, or User ID depending on `type`. */
  targetId: string;
  /** Slug of the referenced film — indexed for fast per-film activity lookups. */
  filmSlug?: string;
  metadata: ActivityMetadata;
  createdAt: string;
}

export type FilmSortKey =
  | 'popularity'
  | 'releaseDate'
  | 'ratingHigh'
  | 'ratingLow'
  | 'runtime';

export type SortDirection = 'asc' | 'desc';

/** Ordering options offered by the review thread toolbar. */
export type ReviewSortKey = 'recent' | 'rating' | 'likes';

export interface FilmFilterCriteria {
  query?: string;
  genres: string[];
  /** Decade start years, e.g. `[1970, 2020]`. */
  decades: number[];
  minRating: number;
  maxRating: number;
  sortBy: FilmSortKey;
  sortDirection: SortDirection;
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
