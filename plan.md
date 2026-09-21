# Architectural Specification & Execution Blueprint: Movie Review & Rating Social Space

**Project Code:** `CINE-SOCIAL-BOXD`  
**Framework:** Next.js 15.1.x (App Router, React 19.0.x, Server Components + Client Islands)  
**Dependencies:**
- `next`: `15.1.4`
- `react`: `19.0.0`
- `react-dom`: `19.0.0`
- `dexie`: `^4.0.11`
- `dexie-react-hooks`: `^1.1.7`
- `@dnd-kit/core`: `^6.3.1`
- `@dnd-kit/sortable`: `^10.0.0`
- `@dnd-kit/utilities`: `^3.2.2`
- `tailwindcss`: `^4.0.0`
- `lucide-react`: `^0.473.0`
**Styling Engine:** Tailwind CSS v4 with semantic `@theme` tokens (no arbitrary hex values in component markup)  
**Design Aesthetic:** Letterboxd Dark Charcoal (Obsidian Canvas `surface-bg`, Gunmetal `surface-panel`, Slate `border-subtle`, Letterboxd Accents: `brand-green`, `brand-orange`, `brand-cyan`, Silver `text-secondary`)  
**Storage Architecture:** Local-First Lazy-Initialized IndexedDB Engine (`dexie@^4.0.11`) isolated to client islands with optimistic rollback sync.

---

## 1. Data Schema & Pure TypeScript Interfaces

```typescript
// types/cine.ts

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
  releaseDate: string; // ISO 8601 YYYY-MM-DD
  runtimeMinutes: number;
  tagline: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string;
  genres: string[];
  directors: CrewMember[];
  cast: CastMember[];
  metrics: {
    communityRating: number; // 0.00 - 5.00
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
  favoriteFilmIds: [string | null, string | null, string | null, string | null]; // Nullable empty slots
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
  reviewBody: string; // Markdown supported
  watchedDate: string; // ISO YYYY-MM-DD
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
  watchedDate: string; // ISO YYYY-MM-DD
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
  orderIndex: number; // Fractional index (e.g. 1000.0, 1500.0) for O(1) reordering
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
  targetId: string; // Review ID, Film ID, List ID, or User ID
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
  decades: number[]; // e.g. [1970, 2020]
  minRating: number;
  maxRating: number;
  sortBy: 'popularity' | 'releaseDate' | 'ratingHigh' | 'ratingLow' | 'runtime';
  sortDirection: 'asc' | 'desc';
  page: number;
  limit: number;
}
```

---

## 2. Design Foundation & Letterboxd Charcoal Aesthetic

### 2.1 Tailwind CSS v4 Configuration & Token Map

```css
@theme {
  /* Surface colors: Distinct Letterboxd charcoal gradation */
  --color-surface-bg: #14181c;          /* Base app canvas */
  --color-surface-panel: #1e242a;       /* Elevated cards, lists, posters wrapper */
  --color-surface-elevated: #242c34;    /* Modals, popovers, dropdowns */
  --color-surface-hover: #2c3440;       /* Interactive hover states */
  --color-surface-input: #1b2127;       /* Form field backgrounds */

  /* Letterboxd Brand Signatures */
  --color-brand-green: #00e054;         /* Primary CTA, Star rating active */
  --color-brand-orange: #ff8000;        /* Like heart, highlight accent */
  --color-brand-cyan: #40bcf4;          /* Secondary interactive, links */
  --color-brand-blue: #209ce4;          /* Secondary link accent */

  /* Neutral Typography Scales */
  --color-text-primary: #ffffff;        /* Headings and primary values */
  --color-text-secondary: #9ab0c2;      /* Meta labels, director credits, years */
  --color-text-muted: #677886;          /* Inactive icons, timestamps, subtext */
  --color-text-dim: #445566;            /* Structural dividing marks */

  /* Structural Border & Divider Tokens */
  --color-border-subtle: #242c34;
  --color-border-strong: #303844;
  --color-border-focus: #00e054;

  /* Typography */
  --font-family-sans: "Graphik", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  --font-family-serif: "Tiempos Headline", Georgia, Cambria, "Times New Roman", serif;
  --font-family-mono: "JetBrains Mono", Menlo, Consolas, Monaco, monospace;

  /* Elevation Shadows tuned for dark matter */
  --shadow-card: 0 4px 12px rgba(0, 0, 0, 0.45);
  --shadow-poster: 0 8px 24px rgba(0, 0, 0, 0.65);
  --shadow-popover: 0 16px 40px rgba(0, 0, 0, 0.85);

  /* Aspect Ratios */
  --aspect-poster: 2 / 3;
  --aspect-backdrop: 16 / 9;
}
```

### 2.2 Global Surface Classes & Contrast Baseline
- **Root Background:** `bg-[#14181c] text-[#9ab0c2] antialiased selection:bg-[#00e054] selection:text-[#14181c]`
- **Poster Treatment:** 
  ```css
  .poster-frame {
    aspect-ratio: 2/3;
    border-radius: 4px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 4px 16px rgba(0,0,0,0.6);
    transition: transform 150ms cubic-bezier(0.2, 0, 0.2, 1), box-shadow 150ms cubic-bezier(0.2, 0, 0.2, 1);
  }
  @media (hover: hover) {
    .poster-frame:hover {
      box-shadow: 0 0 0 2px #00e054, 0 8px 24px rgba(0, 0, 0, 0.8);
      transform: translateY(-2px);
    }
  }
  ```

---

## 3. Component Architecture

```
src/
├── app/
│   ├── layout.tsx                     # Shell, Navigation, Quick-Log Drawer Provider
│   ├── page.tsx                       # Activity Feed, Popular this week, Friend Logs
│   ├── films/
│   │   ├── page.tsx                   # Filterable Film Grid (Decades, Genres, Ratings)
│   │   └── [slug]/
│   │       ├── page.tsx               # Film Hero, Histogram, Cast, Review Threads
│   │       └── reviews/page.tsx       # Paginated Review list with Sorting
│   ├── diary/
│   │   └── page.tsx                   # Personal Monthly Watched Diary View
│   ├── lists/
│   │   ├── page.tsx                   # Curated Lists Feed
│   │   └── [id]/page.tsx              # Dynamic Ordered Film List
│   └── profile/
│       └── [username]/page.tsx        # Profile, Top 4, Stats, Rating Matrix
├── components/
│   ├── ui/                            # Atomic Base Primitives
│   │   ├── StarRatingDisplay.tsx      # SVG-based Half-Star Visualizer (0.5 to 5.0)
│   │   ├── StarRatingInput.tsx        # 10-step Touch/Hover Precision Control
│   │   ├── LikeButton.tsx             # Letterboxd Orange Heart micro-interaction
│   │   ├── PosterImage.tsx            # Next.js Image wrapper with fallback & 2:3 ratio
│   │   ├── BackdropHero.tsx           # Vignette blurred film backdrop
│   │   ├── Badge.tsx                  # Genre, Rewatch, Spoiler tags
│   │   ├── Modal.tsx                  # Focus-trapped Accessible Dialog
│   │   ├── BottomSheet.tsx            # Mobile Slide-up Action Panel (< 768px)
│   │   ├── HistogramChart.tsx         # Letterboxd 10-bar rating distribution
│   │   └── DropdownMenu.tsx           # Accessible menu container
│   ├── compound/                      # Domain Molecules
│   │   ├── FilmCard.tsx               # Poster + Quick actions on touch/hover
│   │   ├── ReviewCard.tsx             # Full review card with spoiler hide/show
│   │   ├── DiaryRow.tsx               # Compact chronological log row (Day, Poster, Title, Rating)
│   │   ├── FavoriteFourSelector.tsx   # Profile 4-film signature showcase picker
│   │   ├── QuickLogModal.tsx          # Fast review/rating entry form
│   │   └── SearchBarOverlay.tsx       # Cmd+K Instant Film & User Search
│   ├── features/                      # Domain Organisms & Controllers
│   │   ├── FilmGridWithFilter.tsx     # Faceted filtering engine with URL state sync
│   │   ├── ReviewThread.tsx           # Review comments and engagement toolbar
│   │   ├── ListEditor.tsx             # Drag and Drop List Reorder & Annotation
│   │   ├── ProfileStatsGrid.tsx       # Watched Hours, Year stats, Genre radar
│   │   └── ActivityStream.tsx         # Chronological Friend Activity feed
│   └── layout/
│       ├── HeaderNavbar.tsx           # Sticky nav with logo, search, log CTA
│       ├── MobileBottomNav.tsx        # High-accessibility touch target bar (Mobile only)
│       └── Footer.tsx                 # Minimal metadata and TMDB attribution
├── lib/
│   ├── db/
│   │   └── indexdb.ts                 # Dexie.js Schema and Local Persistence Layer
│   ├── hooks/
│   │   ├── useFilmRatings.ts          # Aggregate and compute rating math
│   │   ├── useQuickLog.ts             # Global Log Drawer orchestration
│   │   ├── useFilmFilter.ts           # URL SearchParams synced filter state
│   │   └── useSwipeGesture.ts         # Touch gesture handler for mobile drawers
│   └── utils/
│       ├── rating-math.ts             # 10-point scale normalization algorithms
│       ├── date-format.ts             # Letterboxd diary style date formatters
│       └── markdown-sanitizer.ts      # XSS safe Markdown review parser
```

---

## 4. Core Feature Logic & Step-by-Step Algorithms

### 4.1 Ten-Point Star Rating System (0.5 to 5.0)

Letterboxd maps ratings strictly to 5 physical star icons with 10 discrete intervals (step size `0.5`).

#### 4.1.1 Precision Pointer Coordinate Calculation
```typescript
// lib/utils/rating-math.ts

/**
 * Derives a 0.5 - 5.0 rating from bounding rect offset.
 * Handles both touch and mouse positions without relying on hover-only states.
 */
export function calculateStarFromPointer(
  clientX: number,
  containerRect: DOMRect,
  totalStars: number = 5
): StarRating {
  const rawX = clientX - containerRect.left;
  const clampedX = Math.max(0, Math.min(rawX, containerRect.width));
  const ratio = clampedX / containerRect.width;
  
  // 10 possible discrete values: 0.5, 1.0, ..., 5.0
  const discreteStep = Math.ceil(ratio * (totalStars * 2)) / 2;
  const normalized = Math.max(0.5, Math.min(5.0, discreteStep));
  
  return normalized as StarRating;
}
```

#### 4.1.2 Star Visual Component Matrix
Each star at index $i \in \{1, 2, 3, 4, 5\}$ requires three states: Empty (`star <= rating - 1`), Half (`star - 0.5 === rating`), and Full (`star <= rating`).

```typescript
// components/ui/StarRatingDisplay.tsx
'use client';

import React from 'react';
import { StarRating } from '@/types/cine';

interface StarRatingDisplayProps {
  rating: StarRating | number;
  sizeRem?: number;
  showNumeric?: boolean;
  className?: string;
}

export const StarRatingDisplay: React.FC<StarRatingDisplayProps> = ({
  rating,
  sizeRem = 0.875,
  showNumeric = false,
  className = '',
}) => {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className={`inline-flex items-center gap-1 ${className}`} aria-label={`Rating: ${rating} out of 5 stars`}>
      <div className="flex items-center text-brand-green">
        {stars.map((starIndex) => {
          const isFull = rating >= starIndex;
          const isHalf = !isFull && rating >= starIndex - 0.5;

          return (
            <svg
              key={starIndex}
              style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem` }}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
            >
              {isFull ? (
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  fill="currentColor"
                />
              ) : isHalf ? (
                <g>
                  <defs>
                    <linearGradient id={`half-fill-${starIndex}`}>
                      <stop offset="50%" stopColor="var(--color-brand-green)" />
                      <stop offset="50%" stopColor="var(--color-surface-hover)" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    fill={`url(#half-fill-${starIndex})`}
                  />
                </g>
              ) : (
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  className="fill-surface-hover"
                />
              )}
            </svg>
          );
        })}
      </div>
      {showNumeric && (
        <span className="text-xs font-mono font-medium text-text-secondary ml-1">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
};
```

---

### 4.2 Letterboxd Rating Distribution Histogram Algorithm

The histogram renders a 10-bar chart representing the relative density of ratings from 0.5 to 5.0 stars, with user-interactive tooltips and an indicator highlighting where the active viewer's rating sits.

```typescript
// components/ui/HistogramChart.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { StarRating } from '@/types/cine';

interface HistogramChartProps {
  histogram: Partial<Record<StarRating, number>>;
  userRating?: StarRating | null;
  totalRatings: number;
  heightPx?: number;
}

const RATING_STEPS: StarRating[] = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export const HistogramChart: React.FC<HistogramChartProps> = ({
  histogram,
  userRating,
  totalRatings,
  heightPx = 48,
}) => {
  const [activeStep, setActiveStep] = useState<StarRating | null>(null);

  const normalizedBars = useMemo(() => {
    let max = 0;
    RATING_STEPS.forEach((step) => {
      const count = histogram[step] || 0;
      if (count > max) max = count;
    });

    return RATING_STEPS.map((step) => {
      const count = histogram[step] || 0;
      const percentage = max > 0 ? (count / max) * 100 : 0;
      return {
        rating: step,
        count,
        heightPercentage: Math.max(4, Math.round(percentage)),
        isUserRating: userRating === step,
      };
    });
  }, [histogram, userRating]);

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[280px]">
      <div 
        className="flex items-end justify-between gap-[2px] bg-surface-panel p-2 rounded border border-border-subtle"
        style={{ height: `${heightPx + 16}px` }}
        role="group"
        aria-label={`Rating histogram across ${totalRatings} user reviews`}
      >
        {normalizedBars.map((bar) => {
          const isSelected = activeStep === bar.rating;
          const isUser = bar.isUserRating;

          return (
            <button
              key={bar.rating}
              type="button"
              tabIndex={0}
              onClick={() => setActiveStep(isSelected ? null : bar.rating)}
              onMouseEnter={() => setActiveStep(bar.rating)}
              onMouseLeave={() => setActiveStep(null)}
              onFocus={() => setActiveStep(bar.rating)}
              onBlur={() => setActiveStep(null)}
              className="relative flex-1 h-full flex items-end justify-center focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-green py-0 px-0.5 cursor-pointer"
              aria-label={`${bar.rating} stars: ${bar.count} ratings`}
            >
              {/* Tooltip: Active on Click, Focus, and Hover */}
              {isSelected && (
                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center z-20 animate-in fade-in zoom-in-95 duration-100">
                  <span className="bg-surface-bg text-text-primary border border-border-strong text-[10px] font-mono py-0.5 px-1.5 rounded whitespace-nowrap shadow-popover">
                    ★ {bar.rating}: {bar.count.toLocaleString()}
                  </span>
                  <span className="w-1 h-1 bg-surface-bg rotate-45 border-r border-b border-border-strong -mt-0.5" />
                </div>
              )}

              {/* Bar element */}
              <div
                className={`w-full rounded-[1px] transition-all duration-200 ${
                  isUser
                    ? 'bg-brand-green shadow-[0_0_8px_rgba(0,224,84,0.4)]'
                    : isSelected
                    ? 'bg-text-secondary'
                    : 'bg-text-dim hover:bg-text-muted'
                }`}
                style={{ height: `${bar.heightPercentage}%` }}
              />
            </button>
          );
        })}
      </div>
      
      <div className="flex justify-between items-center px-1 text-[10px] text-text-muted font-mono select-none">
        <span>½★</span>
        <span>★★★★★</span>
      </div>
    </div>
  );
};
```

---

### 4.3 Spoiler Concealment Machine

Spoilers must remain masked across both mobile and desktop viewports, requiring a deliberate click/touch to reveal, with clear visual warnings.

```typescript
// components/compound/SpoilerMask.tsx
'use client';

import React, { useState } from 'react';

interface SpoilerMaskProps {
  children: React.ReactNode;
  warningText?: string;
  defaultRevealed?: boolean;
}

export const SpoilerMask: React.FC<SpoilerMaskProps> = ({
  children,
  warningText = 'This review contains spoilers. Tap to reveal.',
  defaultRevealed = false,
}) => {
  const [revealed, setRevealed] = useState(defaultRevealed);

  if (revealed) {
    return (
      <div className="relative group/revealed">
        <div className="animate-in fade-in duration-200">{children}</div>
        <button
          type="button"
          onClick={() => setRevealed(false)}
          className="mt-2 text-[11px] text-[#677886] hover:text-[#9ab0c2] underline transition-colors cursor-pointer"
        >
          Hide spoilers
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setRevealed(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRevealed(true);
        }
      }}
      className="relative overflow-hidden cursor-pointer rounded bg-[#1a2129] border border-[#ff8000]/30 hover:border-[#ff8000]/60 p-4 transition-all duration-200 select-none group"
      aria-label="Spoiler protected content. Click to reveal."
    >
      <div className="flex items-center gap-2.5 text-[#ff8000]">
        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-medium tracking-wide uppercase group-hover:text-[#ffa033]">
          {warningText}
        </span>
      </div>
      
      {/* Visual blurred phantom text behind */}
      <div className="mt-2 filter blur-sm opacity-20 pointer-events-none select-none text-xs text-[#9ab0c2] line-clamp-2">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam.
      </div>
    </div>
  );
};
```

---

### 4.4 Local-First Reactive Storage Engine (Dexie.js Schema & State Hook)

A fully functioning offline-first database running on Dexie.js (IndexedDB) with real-time live queries using `dexie-react-hooks`.

```typescript
// lib/db/indexdb.ts
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

    // Version migration boilerplate reserved for future schema evolution
    this.version(2).stores({}).upgrade(() => {
      // Future indexedDB database migrations go here
    });
  }
}

let dbInstance: CineSocialDatabase | null = null;

/**
 * Lazy client-side-only accessor preventing ReferenceError: indexedDB is not defined in SSR.
 */
export function getDb(): CineSocialDatabase {
  if (typeof window === 'undefined') {
    throw new Error('CineSocialDatabase can only be accessed on client islands.');
  }
  if (!dbInstance) {
    dbInstance = new CineSocialDatabase();
  }
  return dbInstance;
}
```

#### Synchronous Offline Store with Instant Optimistic UI
```typescript
// lib/hooks/useDiaryStore.ts
'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db/indexdb';
import { DiaryEntry, StarRating } from '@/types/cine';

export function useDiaryStore(userId: string) {
  const diaryEntries = useLiveQuery(
    async () => {
      const db = getDb();
      const entries = await db.diary
        .where('userId')
        .equals(userId)
        .filter((entry) => !entry.isDeleted)
        .reverse()
        .sortBy('watchedDate');

      return Promise.all(
        entries.map(async (entry) => {
          const film = await db.films.get(entry.filmId);
          return { ...entry, film };
        })
      );
    },
    [userId],
    []
  );

  const logWatchedFilm = async (payload: {
    filmId: string;
    rating: StarRating;
    isLiked: boolean;
    isRewatch?: boolean;
    watchedDate: string;
    reviewBody?: string;
    containsSpoilers?: boolean;
  }) => {
    const db = getDb();
    const timestamp = new Date().toISOString();
    const entryId = `diary_${crypto.randomUUID()}`;
    let reviewId: string | undefined = undefined;

    return db.transaction('rw', [db.diary, db.reviews, db.films, db.profiles], async () => {
      // Automatic rewatch detection against duplicate non-rewatch entries
      const priorEntries = await db.diary
        .where('[userId+filmId]')
        .equals([userId, payload.filmId])
        .filter((e) => !e.isDeleted)
        .count();

      const calculatedIsRewatch = payload.isRewatch !== undefined ? payload.isRewatch : priorEntries > 0;

      if (payload.reviewBody && payload.reviewBody.trim().length > 0) {
        reviewId = `rev_${crypto.randomUUID()}`;
        await db.reviews.add({
          id: reviewId,
          filmId: payload.filmId,
          userId,
          rating: payload.rating,
          isLiked: payload.isLiked,
          containsSpoilers: Boolean(payload.containsSpoilers),
          reviewBody: payload.reviewBody,
          watchedDate: payload.watchedDate,
          isRewatch: calculatedIsRewatch,
          likeCount: 0,
          commentCount: 0,
          isDeleted: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      await db.diary.add({
        id: entryId,
        userId,
        filmId: payload.filmId,
        reviewId,
        watchedDate: payload.watchedDate,
        rating: payload.rating,
        isLiked: payload.isLiked,
        isRewatch: calculatedIsRewatch,
        isDeleted: false,
        createdAt: timestamp,
      });

      const profile = await db.profiles.get(userId);
      const film = await db.films.get(payload.filmId);
      const addedMinutes = film?.runtimeMinutes || 0;

      if (profile) {
        await db.profiles.update(userId, {
          'stats.filmsWatched': profile.stats.filmsWatched + 1,
          'stats.thisYearCount': profile.stats.thisYearCount + 1,
          'stats.totalWatchTimeMinutes': profile.stats.totalWatchTimeMinutes + addedMinutes,
          ...(payload.reviewBody ? { 'stats.reviewsWritten': profile.stats.reviewsWritten + 1 } : {}),
        });
      }

      if (film) {
        const hist = { ...film.metrics.histogram };
        hist[payload.rating] = (hist[payload.rating] || 0) + 1;
        const newRatingCount = film.metrics.ratingCount + 1;

        const totalScore = Object.entries(hist).reduce(
          (acc, [rate, count]) => acc + parseFloat(rate) * (count || 0),
          0
        );
        const newCommunityRating = Number((totalScore / newRatingCount).toFixed(2));

        await db.films.update(payload.filmId, {
          'metrics.ratingCount': newRatingCount,
          'metrics.logCount': film.metrics.logCount + 1,
          'metrics.communityRating': newCommunityRating,
          'metrics.histogram': hist,
        });
      }

      return { success: true, entryId };
    });
  };

  const updateLog = async (
    diaryId: string,
    updates: {
      rating?: StarRating;
      isLiked?: boolean;
      watchedDate?: string;
      reviewBody?: string;
      containsSpoilers?: boolean;
    }
  ) => {
    const db = getDb();
    const timestamp = new Date().toISOString();

    return db.transaction('rw', [db.diary, db.reviews, db.films, db.profiles], async () => {
      const oldEntry = await db.diary.get(diaryId);
      if (!oldEntry || oldEntry.isDeleted) throw new Error('Diary entry not found');

      const film = await db.films.get(oldEntry.filmId);

      // Reconcile film histogram if rating changed
      if (updates.rating && updates.rating !== oldEntry.rating && film) {
        const hist = { ...film.metrics.histogram };
        hist[oldEntry.rating] = Math.max(0, (hist[oldEntry.rating] || 1) - 1);
        hist[updates.rating] = (hist[updates.rating] || 0) + 1;

        const totalScore = Object.entries(hist).reduce(
          (acc, [rate, count]) => acc + parseFloat(rate) * (count || 0),
          0
        );
        const newCommunityRating = Number((totalScore / Math.max(1, film.metrics.ratingCount)).toFixed(2));

        await db.films.update(oldEntry.filmId, {
          'metrics.communityRating': newCommunityRating,
          'metrics.histogram': hist,
        });
      }

      if (oldEntry.reviewId) {
        await db.reviews.update(oldEntry.reviewId, {
          ...(updates.rating !== undefined ? { rating: updates.rating } : {}),
          ...(updates.isLiked !== undefined ? { isLiked: updates.isLiked } : {}),
          ...(updates.watchedDate !== undefined ? { watchedDate: updates.watchedDate } : {}),
          ...(updates.reviewBody !== undefined ? { reviewBody: updates.reviewBody } : {}),
          ...(updates.containsSpoilers !== undefined ? { containsSpoilers: updates.containsSpoilers } : {}),
          updatedAt: timestamp,
        });
      }

      await db.diary.update(diaryId, {
        ...(updates.rating !== undefined ? { rating: updates.rating } : {}),
        ...(updates.isLiked !== undefined ? { isLiked: updates.isLiked } : {}),
        ...(updates.watchedDate !== undefined ? { watchedDate: updates.watchedDate } : {}),
        updatedAt: timestamp,
      });

      return { success: true };
    });
  };

  const deleteLog = async (diaryId: string) => {
    const db = getDb();

    return db.transaction('rw', [db.diary, db.reviews, db.films, db.profiles], async () => {
      const entry = await db.diary.get(diaryId);
      if (!entry || entry.isDeleted) return;

      // Soft-delete diary entry
      await db.diary.update(diaryId, { isDeleted: true });

      // Soft-delete associated review
      if (entry.reviewId) {
        await db.reviews.update(entry.reviewId, { isDeleted: true });
      }

      // Reconcile user profile stats
      const profile = await db.profiles.get(userId);
      const film = await db.films.get(entry.filmId);
      const minutes = film?.runtimeMinutes || 0;

      if (profile) {
        await db.profiles.update(userId, {
          'stats.filmsWatched': Math.max(0, profile.stats.filmsWatched - 1),
          'stats.thisYearCount': Math.max(0, profile.stats.thisYearCount - 1),
          'stats.totalWatchTimeMinutes': Math.max(0, profile.stats.totalWatchTimeMinutes - minutes),
          ...(entry.reviewId ? { 'stats.reviewsWritten': Math.max(0, profile.stats.reviewsWritten - 1) } : {}),
        });
      }

      // Reconcile film histogram and rating metrics
      if (film) {
        const hist = { ...film.metrics.histogram };
        hist[entry.rating] = Math.max(0, (hist[entry.rating] || 1) - 1);
        const newRatingCount = Math.max(0, film.metrics.ratingCount - 1);

        const totalScore = Object.entries(hist).reduce(
          (acc, [rate, count]) => acc + parseFloat(rate) * (count || 0),
          0
        );
        const newCommunityRating = newRatingCount > 0 ? Number((totalScore / newRatingCount).toFixed(2)) : 0;

        await db.films.update(entry.filmId, {
          'metrics.ratingCount': newRatingCount,
          'metrics.logCount': Math.max(0, film.metrics.logCount - 1),
          'metrics.communityRating': newCommunityRating,
          'metrics.histogram': hist,
        });
      }
    });
  };

  return {
    diaryEntries,
    logWatchedFilm,
    updateLog,
    deleteLog,
    isLoading: diaryEntries === undefined,
  };
}
```

---

## 5. Mobile-First Layout & Viewport Validation Matrix

To mirror Letterboxd's ergonomic utility across portable and desk devices, interfaces adapt across explicit break intervals. Critical actions never rely on hover interactions.

| Viewport Width | Device Target | Navigation Scheme | Film Grid Density | Quick Action Interaction |
| :--- | :--- | :--- | :--- | :--- |
| **360px – 389px** | Small phones (Galaxy S8, iPhone SE) | Unified 5-slot Bottom Nav (48px high, 44x44px hit targets) with inline green '+' Log center button (no floating FAB overlays). | 3 columns poster grid (`aspect-[2/3]`), card click dispatches `onSelectFilm` → `BottomSheet`. | Tap card opens 90vh `BottomSheet`. `StarRatingInput` enforces `min-w-[220px]` with 22px hit-slop per half-star. |
| **390px – 429px** | Standard phones (iPhone 13-16, Pixel 7) | Unified 5-slot Bottom Nav, inline green '+' Log center button. | 3 columns poster grid, gutter `gap-2 px-3`. | `BottomSheet` drawer with tactile rating selector and quick-log. |
| **430px – 767px** | Large phones / Phablets (iPhone Pro Max) | Unified 5-slot Bottom Nav with icon labels. Sticky minimal top brand bar. | 4 columns poster grid, metadata badge overlay. | Half-sheet slide-up with keyboard avoidance. |
| **768px – 1023px** | Tablets (iPad Mini / Air portrait) | Top Navigation Header appears; bottom navigation hidden. | 5-6 columns poster grid. Titles and directors below posters. | Centered modal backdrop for Logging. Hover reveals quick-action overlay. |
| **1024px – 1439px** | Desktop standard | Full desktop navbar with inline search bar (`Cmd+K`). | 6 columns poster grid with Letterboxd green hover ring (`ring-2 ring-[#00e054]`). | Floating popover or instant modal dialog. Full histogram tooltip interactions. |
| **1440px+** | Ultrawide / High-DPI | Fixed max-width container (`max-w-6xl` or `1180px` Letterboxd standard) centered. | Fixed 6 to 7 column layout with backdrop spotlight banner. | Full lateral metadata sidebar with community stats & cast carousel. |

---

## 6. Implementation Specification (The 5-Phase Sequential Queue)

### Phase 1: Types, Storage/API Client Config, and Base Utilities
- [ ] Implement pure TypeScript domain interfaces in `types/cine.ts` (`Film`, `StarRating`, `Review`, `DiaryEntry`, `FilmList`, `UserProfile`, `ActivityEvent`).
- [ ] Configure Dexie.js offline IndexedDB database schema in `lib/db/indexdb.ts`.
- [ ] Write seed dataset generator (`lib/db/seed.ts`) containing:
  - 12 canonical film records with full metadata (Parasite, Blade Runner 2049, Spirited Away, The Godfather, Mulholland Drive, Portrait of a Lady on Fire, etc.).
  - Realistic rating distributions for the 10-bar histogram.
  - Initial user profile and friend activity feed.
- [ ] Implement rating calculation and formatting math (`lib/utils/rating-math.ts`):
  - `calculateStarFromPointer(clientX, containerRect)`
  - `formatRatingDisplay(rating: number): string`
  - `getHistogramPercentages(hist: Record<StarRating, number>)`
- [ ] Create date formatting utilities in `lib/utils/date-format.ts` (e.g., `formatDiaryDate`, `formatRelativeActivity`).

### Phase 2: Design Foundation & Atomic UI Primitives
- [ ] Implement Tailwind CSS v4 design tokens in `app/globals.css` with Letterboxd charcoal gradation, custom shadow tokens, and poster aspect ratios.
- [ ] Construct atomic primitive `StarRatingDisplay.tsx`:
  - 5-star SVG renderer handling full, half, and empty fill states using SVG clip paths / linear gradients.
- [ ] Construct atomic primitive `StarRatingInput.tsx`:
  - Touch-drag scrub and mouse-move calculation with 10 discrete intervals (`0.5` to `5.0`).
  - Accessible keyboard navigation (`ArrowRight` / `ArrowUp` increments by 0.5; `ArrowLeft` / `ArrowDown` decrements by 0.5).
  - Clear button to reset rating to zero.
- [ ] Build `PosterImage.tsx`:
  - Strictly enforced `2:3` aspect ratio container.
  - Smooth blur-up placeholder with dark charcoal skeleton shimmer during loading.
  - Image error fallback handling with film title watermark.
- [ ] Build `LikeButton.tsx`:
  - Accessible toggle button with Letterboxd signature orange heart (`#ff8000`) animation pulse.
- [ ] Build `HistogramChart.tsx`:
  - 10 vertical bars rendered proportional to max rating frequency.
  - Highlight state for current user's rating in active brand green (`#00e054`).
  - Hover and focus tooltip for specific bar count inspection.
- [ ] Build base layout wrappers: `Modal.tsx` (desktop dialog) and `BottomSheet.tsx` (mobile swipe-down panel).

### Phase 3: Compound Molecules & Feature Components
- [ ] Build `FilmCard.tsx`:
  - Poster display with Letterboxd hover border (`ring-[#00e054]`).
  - Mobile tap triggers action sheet; desktop displays rating, like, and add-to-watchlist quick overlay icons.
- [ ] Build `SpoilerMask.tsx`:
  - Accessible masking wrapper for reviews flagged with spoilers.
  - Visual warning header and blur disguise with click-to-reveal toggle.
- [ ] Build `ReviewCard.tsx`:
  - User avatar, username, star rating, like heart, watched date, rewatch indicator icon (`↺`).
  - Markdown text rendering with sanitization.
  - Upvote / like counter and comment count footer.
- [ ] Build `DiaryRow.tsx`:
  - Letterboxd diary style table item: Month/Day column, small thumbnail poster, film title, release year, star rating, orange heart, and rewatch badge.
- [ ] Build `FavoriteFourSelector.tsx`:
  - 4-slot grid displaying user's all-time favorite films.
  - Empty slots indicate "Add Film" placeholder with modal search selector.
- [ ] Build `SearchBarOverlay.tsx`:
  - Global `Cmd+K` / search icon drawer with debounce input searching locally seeded and indexed films.

### Phase 4: Domain Logic, Reactive State, and Specialized APIs
- [ ] Implement `useDiaryStore.ts` utilizing `useLiveQuery` from Dexie for zero-latency optimistic updates across the app.
- [ ] Implement `QuickLogModal.tsx`:
  - Unified modal/bottom sheet to log any film.
  - Date picker defaulting to today (`YYYY-MM-DD`).
  - StarRatingInput + Like toggle + Rewatch checkbox + Spoilers toggle + Markdown textarea.
  - Instant submission writing to IndexedDB and updating film histograms simultaneously.
- [ ] Implement `useFilmFilter.ts`:
  - Multi-facet filtering engine supporting genres, release decades (e.g. 1970s, 2020s), minimum community rating, and sorting criteria (`Popularity`, `Average Rating`, `Release Date`).
  - Synchronizes filter criteria to URL Query Params (`?genre=Sci-Fi&decade=2020&sort=ratingHigh`).
- [ ] Implement `ListEditor.tsx` with `@dnd-kit/core` & `@dnd-kit/sortable`:
  - Interactive curation tool using SortableContext with `PointerSensor` and `TouchSensor` (press delay: 200ms, tolerance: 5px).
  - Fractional indexing algorithm: moving an item between index $A$ and $B$ assigns `(A + B) / 2` to execute an $O(1)$ single-row update without rewriting subsequent indices.
  - Ranked order toggle (renders positional integer `orderNumber`) and custom per-item annotations.
- [ ] Implement `ProfileStatsGrid.tsx`:
  - Computes total runtime in hours and days.
  - Visual breakdown of films logged this calendar year vs all-time.

### Phase 5: Complete Page Assembly & Responsive Shell
- [ ] Build Responsive Shell in `app/layout.tsx`:
  - `HeaderNavbar.tsx`: Desktop navigation with Logo, Films, Lists, Search trigger, and Profile avatar.
  - `MobileBottomNav.tsx`: Bottom navigation on `< 768px` viewports with 5 primary tap targets (Home, Films, Green Quick-Log Button, Lists, Profile).
  - Quick-Log modal portal provider mounted globally.
- [ ] Assemble Homepage (`app/page.tsx`):
  - Hero spotlight backdrop banner with featured trending film.
  - "Popular with Friends" film carousel.
  - Chronological Activity Stream (`ActivityStream.tsx`) showing real-time logs and reviews.
- [ ] Assemble Films Explorer (`app/films/page.tsx`):
  - Faceted sidebar (desktop) / Collapsible filter drawer (mobile).
  - Responsive Grid validating 3-column (360px-429px), 4-column (430px-767px), and 6-column (768px+) layouts.
  - Empty search state with reset filters button.
- [ ] Assemble Film Detail View (`app/films/[slug]/page.tsx`):
  - Wide cinematic backdrop banner with bottom vignette gradient into `#14181c`.
  - Poster, title, release year, director credit, runtime, synopsis.
  - Interactive Action Panel: Log button, Rate half-stars directly, Add to Watchlist, Mark Liked.
  - Rating Histogram and Community Stats widget.
  - Cast & Crew horizontal scroll list.
  - Top and Recent Reviews with `SpoilerMask` components.
- [ ] Assemble Diary Page (`app/diary/page.tsx`):
  - Chronological diary entries grouped by Month and Year.
  - Watch count badges and rewatch indicators.
- [ ] Assemble Profile Page (`app/profile/[username]/page.tsx`):
  - Profile header with avatar, bio, and Letterboxd Favorite Four showcase.
  - Tab navigation: Profile Overview, Diary, Reviews, Lists, Watchlist.
  - Rating histogram of the user's specific lifetime ratings.
- [ ] Rigorous End-to-End Viewport & Accessibility Validation:
  - Verify all touch targets $\ge 44 \times 44\text{px}$ across 360px, 390px, and 430px widths.
  - Confirm keyboard navigation (`Tab`, `Enter`, `Space`, `Arrow` keys) for rating inputs and modal dialogs.
  - Verify zero content clipping or horizontal page overflow.