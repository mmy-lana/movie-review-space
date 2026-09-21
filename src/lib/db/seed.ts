import { Film, UserProfile } from '@/types/cine';
import { getDb } from './indexdb';

export const SEED_PROFILE: UserProfile = {
  id: 'user_default',
  username: 'cinephile',
  displayName: 'Alex Rivers',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  bio: 'Filmmaker and archivist. Always chasing wide aspect ratios and 35mm grain.',
  website: 'https://cineslate.app',
  location: 'Los Angeles, CA',
  favoriteFilmIds: ['film_parasite', 'film_blade_runner_2049', 'film_spirited_away', 'film_godfather'],
  stats: {
    filmsWatched: 1248,
    thisYearCount: 142,
    listsCreated: 18,
    reviewsWritten: 312,
    followingCount: 384,
    followersCount: 512,
    totalWatchTimeMinutes: 162240,
  },
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

export const SEED_FILMS: Film[] = [
  {
    id: 'film_parasite',
    slug: 'parasite-2019',
    title: 'Parasite',
    originalTitle: '기생충',
    releaseYear: 2019,
    releaseDate: '2019-05-30',
    runtimeMinutes: 132,
    tagline: 'Act like you own the place.',
    synopsis: 'All unemployed, Ki-taek and his family take peculiar interest in the wealthy and glamorous Parks, as they ingratiate themselves into their lives and get entangled in an unexpected incident.',
    posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&h=900&q=80',
    backdropUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1920&h=1080&q=80',
    genres: ['Drama', 'Thriller', 'Comedy'],
    directors: [{ id: 'dir_bong', name: 'Bong Joon-ho', role: 'Director' }],
    cast: [
      { id: 'cast_song', name: 'Song Kang-ho', character: 'Kim Ki-taek', order: 1 },
      { id: 'cast_lee', name: 'Lee Sun-kyun', character: 'Park Dong-ik', order: 2 },
      { id: 'cast_cho', name: 'Cho Yeo-jeong', character: 'Choi Yeon-gyo', order: 3 },
    ],
    metrics: {
      communityRating: 4.58,
      ratingCount: 42000,
      logCount: 78000,
      reviewCount: 14500,
      listCount: 8900,
      likeCount: 32000,
      histogram: { 0.5: 80, 1.0: 120, 1.5: 210, 2.0: 450, 2.5: 980, 3.0: 2400, 3.5: 5800, 4.0: 12400, 4.5: 14200, 5.0: 16800 },
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'film_blade_runner_2049',
    slug: 'blade-runner-2049-2017',
    title: 'Blade Runner 2049',
    releaseYear: 2017,
    releaseDate: '2017-10-06',
    runtimeMinutes: 164,
    tagline: 'The key to the future is finally unearthed.',
    synopsis: 'Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what is left of society into chaos.',
    posterUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&h=900&q=80',
    backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1920&h=1080&q=80',
    genres: ['Science Fiction', 'Mystery', 'Drama'],
    directors: [{ id: 'dir_denis', name: 'Denis Villeneuve', role: 'Director' }],
    cast: [
      { id: 'cast_ryan', name: 'Ryan Gosling', character: 'K', order: 1 },
      { id: 'cast_ford', name: 'Harrison Ford', character: 'Rick Deckard', order: 2 },
      { id: 'cast_ana', name: 'Ana de Armas', character: 'Joi', order: 3 },
    ],
    metrics: {
      communityRating: 4.42,
      ratingCount: 38500,
      logCount: 65400,
      reviewCount: 11200,
      listCount: 7400,
      likeCount: 28900,
      histogram: { 0.5: 110, 1.0: 180, 1.5: 320, 2.0: 710, 2.5: 1400, 3.0: 3100, 3.5: 6700, 4.0: 13100, 4.5: 13900, 5.0: 14200 },
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'film_spirited_away',
    slug: 'spirited-away-2001',
    title: 'Spirited Away',
    originalTitle: '千と千尋の神隠し',
    releaseYear: 2001,
    releaseDate: '2001-07-20',
    runtimeMinutes: 125,
    tagline: 'Tunnel into another world.',
    synopsis: 'A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.',
    posterUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&h=900&q=80',
    backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&h=1080&q=80',
    genres: ['Animation', 'Family', 'Fantasy'],
    directors: [{ id: 'dir_hayao', name: 'Hayao Miyazaki', role: 'Director' }],
    cast: [
      { id: 'cast_rumi', name: 'Rumi Hiiragi', character: 'Chihiro Ogino (voice)', order: 1 },
      { id: 'cast_miyu', name: 'Miyu Irino', character: 'Haku (voice)', order: 2 },
    ],
    metrics: {
      communityRating: 4.52,
      ratingCount: 51000,
      logCount: 92000,
      reviewCount: 16000,
      listCount: 11000,
      likeCount: 41000,
      histogram: { 0.5: 50, 1.0: 90, 1.5: 140, 2.0: 320, 2.5: 750, 3.0: 2100, 3.5: 5400, 4.0: 11900, 4.5: 15800, 5.0: 19800 },
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'film_godfather',
    slug: 'the-godfather-1972',
    title: 'The Godfather',
    releaseYear: 1972,
    releaseDate: '1972-03-24',
    runtimeMinutes: 175,
    tagline: 'An offer you cannot refuse.',
    synopsis: 'Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family. When organized crime family patriarch, Vito Corleone barely survives an attempt on his life, his youngest son, Michael steps in to take care of the would-be killers.',
    posterUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&h=900&q=80',
    backdropUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1920&h=1080&q=80',
    genres: ['Drama', 'Crime'],
    directors: [{ id: 'dir_francis', name: 'Francis Ford Coppola', role: 'Director' }],
    cast: [
      { id: 'cast_brando', name: 'Marlon Brando', character: 'Don Vito Corleone', order: 1 },
      { id: 'cast_pacino', name: 'Al Pacino', character: 'Michael Corleone', order: 2 },
      { id: 'cast_caan', name: 'James Caan', character: 'Sonny Corleone', order: 3 },
    ],
    metrics: {
      communityRating: 4.60,
      ratingCount: 62000,
      logCount: 104000,
      reviewCount: 19000,
      listCount: 14200,
      likeCount: 49000,
      histogram: { 0.5: 60, 1.0: 80, 1.5: 120, 2.0: 250, 2.5: 600, 3.0: 1800, 3.5: 4600, 4.0: 10200, 4.5: 16900, 5.0: 24000 },
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
];

export async function initializeDatabaseSeed(): Promise<void> {
  const db = getDb();
  const filmCount = await db.films.count();
  if (filmCount === 0) {
    await db.films.bulkAdd(SEED_FILMS);
    await db.profiles.put(SEED_PROFILE);
  }
}
