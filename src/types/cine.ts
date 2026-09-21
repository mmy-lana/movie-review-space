export type StarRating = 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0;

export interface CrewMember {
  id: string;
  name: string;
  role: 'Director' | 'Writer' | 'Producer' | 'Cinematographer' | 'Editor' | 'Composer';
  avatarUrl?: string;
}

export interface CastMember {
  id: string;
  name: string;
  character: string;
  avatarUrl?: string;
  order: number;
}

export interface Film {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  releaseYear: number;
  releaseDate: string;
  runtimeMinutes: number;
  tagline: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string;
  genres: string[];
  directors: CrewMember[];
  cast: CastMember[];
  metrics: {
    communityRating: number;
    ratingCount: number;
    logCount: number;
    reviewCount: number;
    listCount: number;
    likeCount: number;
    histogram: Partial<Record<StarRating, number>>;
  };
  tmdbId?: number;
  imdbId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  website?: string;
  location?: string;
  favoriteFilmIds: [string | null, string | null, string | null, string | null];
  stats: {
    filmsWatched: number;
    thisYearCount: number;
    listsCreated: number;
    reviewsWritten: number;
    followingCount: number;
    followersCount: number;
    totalWatchTimeMinutes: number;
  };
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
  reviewBody: string;
  watchedDate: string;
  isRewatch: boolean;
  likeCount: number;
  commentCount: number;
  isDeleted?: boolean;
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
  watchedDate: string;
  rating: StarRating;
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

export interface ActivityEvent {
  id: string;
  userId: string;
  user: UserProfile;
  type: 'LOG_FILM' | 'REVIEW_FILM' | 'LIKE_REVIEW' | 'CREATE_LIST' | 'FOLLOW_USER';
  targetId: string;
  metadata: {
    filmTitle?: string;
    filmYear?: number;
    filmPoster?: string;
    rating?: StarRating;
    isLiked?: boolean;
    listTitle?: string;
    reviewSnippet?: string;
  };
  createdAt: string;
}

export interface FilmFilterCriteria {
  query?: string;
  genres: string[];
  decades: number[];
  minRating: number;
  maxRating: number;
  sortBy: 'popularity' | 'releaseDate' | 'ratingHigh' | 'ratingLow' | 'runtime';
  sortDirection: 'asc' | 'desc';
  page: number;
  limit: number;
}
