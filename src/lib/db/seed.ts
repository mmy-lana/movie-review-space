/**
 * Canonical seed dataset for CINE-SOCIAL-BOXD.
 *
 * The dataset is a deterministic fixture: every histogram is a fixed ten-bucket
 * distribution, every timestamp is derived from `SEED_NOW`, and every derived
 * metric (community rating, rating count) is computed rather than hand-written
 * so the aggregates can never contradict the distribution.
 *
 * `initializeDatabaseSeed()` is idempotent and versioned: bumping `SEED_VERSION`
 * in `lib/db/indexdb.ts` clears the seeded tables and repopulates them on the
 * next client bootstrap.
 */

import type {
  ActivityEvent,
  DiaryEntry,
  Film,
  FilmList,
  ListItem,
  PartialRatingHistogram,
  Review,
  StarRating,
  UserProfile,
} from '@/types/cine';
import { computeCommunityRating, histogramTotal } from '@/lib/utils/rating-math';
import { toPlainTextPreview } from '@/lib/utils/markdown-sanitizer';
import { getDb, META_KEY_SEEDED_AT, META_KEY_SEED_VERSION, SEED_VERSION } from './indexdb';

/** Frozen "now" for the fixture so relative timestamps stay stable in tests. */
export const SEED_NOW = '2026-09-21T09:30:00.000Z';

const FILM_CREATED_AT = '2023-01-01T00:00:00.000Z';
const FILM_UPDATED_AT = '2026-09-20T18:45:00.000Z';
const REVIEW_CREATED_AT = '2026-08-01T00:00:00.000Z';

/** Offset helper: `SEED_NOW` minus a number of hours, as an ISO timestamp. */
function hoursAgo(hours: number): string {
  return new Date(Date.parse(SEED_NOW) - hours * 3_600_000).toISOString();
}

/** Offset helper: `SEED_NOW` minus a number of days, as an ISO timestamp. */
function daysAgoIso(days: number): string {
  return hoursAgo(days * 24);
}

function tmdbPoster(path: string): string {
  return `https://image.tmdb.org/t/p/w500${path}`;
}

function tmdbBackdrop(path: string): string {
  return `https://image.tmdb.org/t/p/w1280${path}`;
}

/* -------------------------------------------------------------------------- */
/* Films                                                                       */
/* -------------------------------------------------------------------------- */

interface FilmSeedInput {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  releaseYear: number;
  releaseDate: string;
  runtimeMinutes: number;
  tagline: string;
  synopsis: string;
  posterPath: string;
  backdropPath: string;
  genres: string[];
  directors: Film['directors'];
  cast: Film['cast'];
  tmdbId: number;
  imdbId: string;
  histogram: PartialRatingHistogram;
  logCount: number;
  reviewCount: number;
  listCount: number;
  likeCount: number;
}

function buildFilm(input: FilmSeedInput): Film {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    originalTitle: input.originalTitle,
    releaseYear: input.releaseYear,
    releaseDate: input.releaseDate,
    runtimeMinutes: input.runtimeMinutes,
    tagline: input.tagline,
    synopsis: input.synopsis,
    posterUrl: tmdbPoster(input.posterPath),
    backdropUrl: tmdbBackdrop(input.backdropPath),
    genres: input.genres,
    directors: input.directors,
    cast: input.cast,
    metrics: {
      communityRating: computeCommunityRating(input.histogram),
      ratingCount: histogramTotal(input.histogram),
      logCount: input.logCount,
      reviewCount: input.reviewCount,
      listCount: input.listCount,
      likeCount: input.likeCount,
      histogram: input.histogram,
    },
    tmdbId: input.tmdbId,
    imdbId: input.imdbId,
    createdAt: FILM_CREATED_AT,
    updatedAt: FILM_UPDATED_AT,
  };
}

/** The twelve canonical films shipped with the app. */
export const SEED_FILMS: Film[] = [
  buildFilm({
    id: 'film_parasite',
    slug: 'parasite-2019',
    title: 'Parasite',
    originalTitle: '기생충',
    releaseYear: 2019,
    releaseDate: '2019-05-30',
    runtimeMinutes: 132,
    tagline: 'Act like you own the place.',
    synopsis:
      'All unemployed, Ki-taek and his family take peculiar interest in the wealthy and glamorous Parks, as they ingratiate themselves into their lives and get entangled in an unexpected incident.',
    posterPath: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
    backdropPath: '/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg',
    genres: ['Comedy', 'Drama', 'Thriller'],
    directors: [{ id: 'dir_bong_joon_ho', name: 'Bong Joon-ho', role: 'Director' }],
    cast: [
      { id: 'cast_song_kang_ho', name: 'Song Kang-ho', character: 'Kim Ki-taek', order: 1 },
      { id: 'cast_lee_sun_kyun', name: 'Lee Sun-kyun', character: 'Park Dong-ik', order: 2 },
      { id: 'cast_cho_yeo_jeong', name: 'Cho Yeo-jeong', character: 'Choi Yeon-gyo', order: 3 },
      { id: 'cast_choi_woo_shik', name: 'Choi Woo-shik', character: 'Kim Ki-woo', order: 4 },
      { id: 'cast_park_so_dam', name: 'Park So-dam', character: 'Kim Ki-jung', order: 5 },
    ],
    tmdbId: 496243,
    imdbId: 'tt6751668',
    histogram: {
      0.5: 80, 1.0: 120, 1.5: 210, 2.0: 450, 2.5: 980,
      3.0: 2400, 3.5: 5800, 4.0: 12400, 4.5: 14200, 5.0: 16800,
    },
    logCount: 78_000,
    reviewCount: 14_500,
    listCount: 8_900,
    likeCount: 32_000,
  }),
  buildFilm({
    id: 'film_blade_runner_2049',
    slug: 'blade-runner-2049-2017',
    title: 'Blade Runner 2049',
    releaseYear: 2017,
    releaseDate: '2017-10-06',
    runtimeMinutes: 164,
    tagline: 'The key to the future is finally unearthed.',
    synopsis:
      'Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what is left of society into chaos.',
    posterPath: '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
    backdropPath: '/ilRyazdMJwN05exqhwK4tMKBYZs.jpg',
    genres: ['Science Fiction', 'Drama', 'Mystery'],
    directors: [{ id: 'dir_denis_villeneuve', name: 'Denis Villeneuve', role: 'Director' }],
    cast: [
      { id: 'cast_ryan_gosling', name: 'Ryan Gosling', character: 'K', order: 1 },
      { id: 'cast_harrison_ford', name: 'Harrison Ford', character: 'Rick Deckard', order: 2 },
      { id: 'cast_ana_de_armas', name: 'Ana de Armas', character: 'Joi', order: 3 },
      { id: 'cast_sylvia_hoeks', name: 'Sylvia Hoeks', character: 'Luv', order: 4 },
    ],
    tmdbId: 335984,
    imdbId: 'tt1856101',
    histogram: {
      0.5: 110, 1.0: 180, 1.5: 320, 2.0: 710, 2.5: 1400,
      3.0: 3100, 3.5: 6700, 4.0: 13100, 4.5: 13900, 5.0: 14200,
    },
    logCount: 65_400,
    reviewCount: 11_200,
    listCount: 7_400,
    likeCount: 28_900,
  }),
  buildFilm({
    id: 'film_spirited_away',
    slug: 'spirited-away-2001',
    title: 'Spirited Away',
    originalTitle: '千と千尋の神隠し',
    releaseYear: 2001,
    releaseDate: '2001-07-20',
    runtimeMinutes: 125,
    tagline: 'The tunnel led Chihiro to a mysterious town.',
    synopsis:
      'A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.',
    posterPath: '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
    backdropPath: '/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg',
    genres: ['Animation', 'Family', 'Fantasy'],
    directors: [{ id: 'dir_hayao_miyazaki', name: 'Hayao Miyazaki', role: 'Director' }],
    cast: [
      { id: 'cast_rumi_hiiragi', name: 'Rumi Hiiragi', character: 'Chihiro Ogino (voice)', order: 1 },
      { id: 'cast_miyu_irino', name: 'Miyu Irino', character: 'Haku (voice)', order: 2 },
      { id: 'cast_mari_natsuki', name: 'Mari Natsuki', character: 'Yubaba (voice)', order: 3 },
    ],
    tmdbId: 129,
    imdbId: 'tt0245429',
    histogram: {
      0.5: 50, 1.0: 90, 1.5: 140, 2.0: 320, 2.5: 750,
      3.0: 2100, 3.5: 5400, 4.0: 11900, 4.5: 15800, 5.0: 19800,
    },
    logCount: 92_000,
    reviewCount: 16_000,
    listCount: 11_000,
    likeCount: 41_000,
  }),
  buildFilm({
    id: 'film_godfather',
    slug: 'the-godfather-1972',
    title: 'The Godfather',
    releaseYear: 1972,
    releaseDate: '1972-03-24',
    runtimeMinutes: 175,
    tagline: 'An offer you cannot refuse.',
    synopsis:
      'Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family. When organized crime family patriarch Vito Corleone barely survives an attempt on his life, his youngest son Michael steps in to take care of the would-be killers.',
    posterPath: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    backdropPath: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
    genres: ['Drama', 'Crime'],
    directors: [{ id: 'dir_francis_ford_coppola', name: 'Francis Ford Coppola', role: 'Director' }],
    cast: [
      { id: 'cast_marlon_brando', name: 'Marlon Brando', character: 'Don Vito Corleone', order: 1 },
      { id: 'cast_al_pacino', name: 'Al Pacino', character: 'Michael Corleone', order: 2 },
      { id: 'cast_james_caan', name: 'James Caan', character: 'Sonny Corleone', order: 3 },
      { id: 'cast_robert_duvall', name: 'Robert Duvall', character: 'Tom Hagen', order: 4 },
    ],
    tmdbId: 238,
    imdbId: 'tt0068646',
    histogram: {
      0.5: 60, 1.0: 80, 1.5: 120, 2.0: 250, 2.5: 600,
      3.0: 1800, 3.5: 4600, 4.0: 10200, 4.5: 16900, 5.0: 24000,
    },
    logCount: 104_000,
    reviewCount: 19_000,
    listCount: 14_200,
    likeCount: 49_000,
  }),
  buildFilm({
    id: 'film_mulholland_drive',
    slug: 'mulholland-drive-2001',
    title: 'Mulholland Drive',
    releaseYear: 2001,
    releaseDate: '2001-10-12',
    runtimeMinutes: 147,
    tagline: 'A love story in the city of dreams.',
    synopsis:
      'Blonde Betty Elms has only just arrived in Hollywood to become a movie star when she meets an enigmatic brunette with amnesia. Meanwhile, as the two set off to solve the second woman\'s identity, filmmaker Adam Kesher runs into ominous trouble while casting his latest project.',
    posterPath: '/tVGAof7fBzpT39AA9I1pRbhBnjx.jpg',
    backdropPath: '/zj8bYYkFmC4D6zDqkIo2Gkm0s7v.jpg',
    genres: ['Thriller', 'Drama', 'Mystery'],
    directors: [{ id: 'dir_david_lynch', name: 'David Lynch', role: 'Director' }],
    cast: [
      { id: 'cast_naomi_watts', name: 'Naomi Watts', character: 'Betty Elms / Diane Selwyn', order: 1 },
      { id: 'cast_laura_harring', name: 'Laura Harring', character: 'Rita / Camilla Rhodes', order: 2 },
      { id: 'cast_justin_theroux', name: 'Justin Theroux', character: 'Adam Kesher', order: 3 },
    ],
    tmdbId: 1018,
    imdbId: 'tt0166924',
    histogram: {
      0.5: 420, 1.0: 380, 1.5: 520, 2.0: 900, 2.5: 1600,
      3.0: 3100, 3.5: 5200, 4.0: 9400, 4.5: 11200, 5.0: 12400,
    },
    logCount: 44_000,
    reviewCount: 8_600,
    listCount: 6_100,
    likeCount: 18_400,
  }),
  buildFilm({
    id: 'film_portrait_lady_on_fire',
    slug: 'portrait-of-a-lady-on-fire-2019',
    title: 'Portrait of a Lady on Fire',
    originalTitle: 'Portrait de la jeune fille en feu',
    releaseYear: 2019,
    releaseDate: '2019-09-18',
    runtimeMinutes: 122,
    tagline: 'Do all lovers feel they\'re inventing something?',
    synopsis:
      'On an isolated island in Brittany at the end of the eighteenth century, a female painter is obliged to paint a wedding portrait of a young woman.',
    posterPath: '/2LquGwEhbg3soxSCs9VNyh5VJd9.jpg',
    backdropPath: '/kG8Cm3iC3nEzTNhJn7Zo6JgkKtm.jpg',
    genres: ['Romance', 'Drama', 'History'],
    directors: [{ id: 'dir_celine_sciamma', name: 'Céline Sciamma', role: 'Director' }],
    cast: [
      { id: 'cast_noemie_merlant', name: 'Noémie Merlant', character: 'Marianne', order: 1 },
      { id: 'cast_adele_haenel', name: 'Adèle Haenel', character: 'Héloïse', order: 2 },
      { id: 'cast_luana_bajrami', name: 'Luàna Bajrami', character: 'Sophie', order: 3 },
    ],
    tmdbId: 531428,
    imdbId: 'tt8613070',
    histogram: {
      0.5: 40, 1.0: 70, 1.5: 110, 2.0: 260, 2.5: 620,
      3.0: 1900, 3.5: 4300, 4.0: 8800, 4.5: 10600, 5.0: 11200,
    },
    logCount: 38_000,
    reviewCount: 7_400,
    listCount: 5_200,
    likeCount: 16_800,
  }),
  buildFilm({
    id: 'film_eeaao',
    slug: 'everything-everywhere-all-at-once-2022',
    title: 'Everything Everywhere All at Once',
    releaseYear: 2022,
    releaseDate: '2022-03-25',
    runtimeMinutes: 139,
    tagline: 'The universe is so much bigger than you realize.',
    synopsis:
      'An aging Chinese immigrant is swept up in an insane adventure, where she alone can save what\'s important to her by connecting with the lives she could have led in other universes.',
    posterPath: '/u68AjlvlutfEIcpmbYpKcdi09ut.jpg',
    backdropPath: '/ss0Os3uWJfQAENILHZUdX8Tt1OC.jpg',
    genres: ['Action', 'Adventure', 'Science Fiction'],
    directors: [
      { id: 'dir_dan_kwan', name: 'Dan Kwan', role: 'Director' },
      { id: 'dir_daniel_scheinert', name: 'Daniel Scheinert', role: 'Director' },
    ],
    cast: [
      { id: 'cast_michelle_yeoh', name: 'Michelle Yeoh', character: 'Evelyn Wang', order: 1 },
      { id: 'cast_ke_huy_quan', name: 'Ke Huy Quan', character: 'Waymond Wang', order: 2 },
      { id: 'cast_stephanie_hsu', name: 'Stephanie Hsu', character: 'Joy Wang / Jobu Tupaki', order: 3 },
      { id: 'cast_jamie_lee_curtis', name: 'Jamie Lee Curtis', character: 'Deirdre Beaubeirdre', order: 4 },
    ],
    tmdbId: 545611,
    imdbId: 'tt6710474',
    histogram: {
      0.5: 900, 1.0: 820, 1.5: 960, 2.0: 1500, 2.5: 2200,
      3.0: 4200, 3.5: 7600, 4.0: 13800, 4.5: 15200, 5.0: 17600,
    },
    logCount: 128_000,
    reviewCount: 21_000,
    listCount: 12_400,
    likeCount: 52_000,
  }),
  buildFilm({
    id: 'film_in_the_mood_for_love',
    slug: 'in-the-mood-for-love-2000',
    title: 'In the Mood for Love',
    originalTitle: '花樣年華',
    releaseYear: 2000,
    releaseDate: '2000-09-29',
    runtimeMinutes: 98,
    tagline: 'Feel the heat, keep the feeling burning, let the sensation explode.',
    synopsis:
      'In 1962 Hong Kong, a journalist and a secretary rent rooms in the same building and discover their spouses are having an affair. As they confide in each other, they struggle against their own attraction.',
    posterPath: '/1b86hOvnvItLQl7XCAKw3s2nIH9.jpg',
    backdropPath: '/iYv7KB3Fg6DMyJ4d9FqZ7m3oFyE.jpg',
    genres: ['Drama', 'Romance'],
    directors: [{ id: 'dir_wong_kar_wai', name: 'Wong Kar-wai', role: 'Director' }],
    cast: [
      { id: 'cast_tony_leung', name: 'Tony Leung Chiu-wai', character: 'Chow Mo-wan', order: 1 },
      { id: 'cast_maggie_cheung', name: 'Maggie Cheung', character: 'Su Li-zhen', order: 2 },
    ],
    tmdbId: 843,
    imdbId: 'tt0118694',
    histogram: {
      0.5: 30, 1.0: 45, 1.5: 90, 2.0: 200, 2.5: 520,
      3.0: 1800, 3.5: 4100, 4.0: 8900, 4.5: 11100, 5.0: 12300,
    },
    logCount: 41_000,
    reviewCount: 7_900,
    listCount: 8_100,
    likeCount: 19_600,
  }),
  buildFilm({
    id: 'film_fury_road',
    slug: 'mad-max-fury-road-2015',
    title: 'Mad Max: Fury Road',
    releaseYear: 2015,
    releaseDate: '2015-05-15',
    runtimeMinutes: 120,
    tagline: 'What a lovely day.',
    synopsis:
      'An apocalyptic story set in the furthest reaches of our planet, in a stark desert landscape where humanity is broken, and almost everyone is crazed fighting for the necessities of life.',
    posterPath: '/hA2ple9q4qnwxp3hKVNhroipsir.jpg',
    backdropPath: '/uT895WNwm6OeSV1XhqQpFqJ9sRj.jpg',
    genres: ['Action', 'Adventure', 'Science Fiction'],
    directors: [{ id: 'dir_george_miller', name: 'George Miller', role: 'Director' }],
    cast: [
      { id: 'cast_tom_hardy', name: 'Tom Hardy', character: 'Max Rockatansky', order: 1 },
      { id: 'cast_charlize_theron', name: 'Charlize Theron', character: 'Imperator Furiosa', order: 2 },
      { id: 'cast_nicholas_hoult', name: 'Nicholas Hoult', character: 'Nux', order: 3 },
    ],
    tmdbId: 76341,
    imdbId: 'tt1392190',
    histogram: {
      0.5: 200, 1.0: 240, 1.5: 340, 2.0: 700, 2.5: 1300,
      3.0: 3300, 3.5: 7200, 4.0: 14500, 4.5: 15100, 5.0: 14800,
    },
    logCount: 88_000,
    reviewCount: 13_400,
    listCount: 7_800,
    likeCount: 34_200,
  }),
  buildFilm({
    id: 'film_whiplash',
    slug: 'whiplash-2014',
    title: 'Whiplash',
    releaseYear: 2014,
    releaseDate: '2014-10-10',
    runtimeMinutes: 106,
    tagline: 'The road to greatness can take you to the edge.',
    synopsis:
      'Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.',
    posterPath: '/7fn624j5lj3xTme2SgiLCeuedmO.jpg',
    backdropPath: '/6bbZ6XyvgfjhQwbplnUh1LSj1ky.jpg',
    genres: ['Drama', 'Music'],
    directors: [{ id: 'dir_damien_chazelle', name: 'Damien Chazelle', role: 'Director' }],
    cast: [
      { id: 'cast_miles_teller', name: 'Miles Teller', character: 'Andrew Neiman', order: 1 },
      { id: 'cast_jk_simmons', name: 'J.K. Simmons', character: 'Terence Fletcher', order: 2 },
      { id: 'cast_paul_reiser', name: 'Paul Reiser', character: 'Jim Neiman', order: 3 },
    ],
    tmdbId: 244786,
    imdbId: 'tt2582802',
    histogram: {
      0.5: 150, 1.0: 170, 1.5: 260, 2.0: 540, 2.5: 1000,
      3.0: 2600, 3.5: 5900, 4.0: 12300, 4.5: 13900, 5.0: 14200,
    },
    logCount: 74_000,
    reviewCount: 12_100,
    listCount: 6_400,
    likeCount: 27_500,
  }),
  buildFilm({
    id: 'film_arrival',
    slug: 'arrival-2016',
    title: 'Arrival',
    releaseYear: 2016,
    releaseDate: '2016-11-11',
    runtimeMinutes: 116,
    tagline: 'Why are they here?',
    synopsis:
      'Taking place after alien crafts land around the world, an expert linguist is recruited by the military to determine whether they come in peace or are a threat.',
    posterPath: '/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
    backdropPath: '/yIZ1xendyqKvY3FGeeUYUd5X9Mm.jpg',
    genres: ['Science Fiction', 'Drama', 'Mystery'],
    directors: [{ id: 'dir_denis_villeneuve', name: 'Denis Villeneuve', role: 'Director' }],
    cast: [
      { id: 'cast_amy_adams', name: 'Amy Adams', character: 'Louise Banks', order: 1 },
      { id: 'cast_jeremy_renner', name: 'Jeremy Renner', character: 'Ian Donnelly', order: 2 },
      { id: 'cast_forest_whitaker', name: 'Forest Whitaker', character: 'Colonel Weber', order: 3 },
    ],
    tmdbId: 329865,
    imdbId: 'tt2543164',
    histogram: {
      0.5: 90, 1.0: 110, 1.5: 180, 2.0: 400, 2.5: 820,
      3.0: 2400, 3.5: 5600, 4.0: 12400, 4.5: 13600, 5.0: 13900,
    },
    logCount: 69_000,
    reviewCount: 11_600,
    listCount: 8_300,
    likeCount: 30_100,
  }),
  buildFilm({
    id: 'film_fallen_angels',
    slug: 'fallen-angels-1995',
    title: 'Fallen Angels',
    originalTitle: '墮落天使',
    releaseYear: 1995,
    releaseDate: '1995-09-06',
    runtimeMinutes: 99,
    tagline: 'Every night is a journey through the neon rain.',
    synopsis:
      'A killer-for-hire and his mysterious partner drift through the neon underworld of Hong Kong, while a mute ex-convict drifts through the same nights and the two stories brush past one another.',
    posterPath: '/n1M9nHj9tFhKMH9nJ0YkKuC0WqU.jpg',
    backdropPath: '/e9J1d2nfH7aOCQ6J7Yn3FvIzS9B.jpg',
    genres: ['Drama', 'Crime', 'Romance'],
    directors: [{ id: 'dir_wong_kar_wai', name: 'Wong Kar-wai', role: 'Director' }],
    cast: [
      { id: 'cast_leon_lai', name: 'Leon Lai', character: 'Killer', order: 1 },
      { id: 'cast_michelle_reis', name: 'Michelle Reis', character: 'Agent', order: 2 },
      { id: 'cast_takeshi_kaneshiro', name: 'Takeshi Kaneshiro', character: 'He Zhiwu', order: 3 },
    ],
    tmdbId: 11220,
    imdbId: 'tt0112913',
    histogram: {
      0.5: 25, 1.0: 40, 1.5: 80, 2.0: 190, 2.5: 430,
      3.0: 1500, 3.5: 3600, 4.0: 8100, 4.5: 10200, 5.0: 11400,
    },
    logCount: 33_000,
    reviewCount: 6_200,
    listCount: 5_400,
    likeCount: 14_300,
  }),
];

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

interface ProfileSeedInput {
  id: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  bio: string;
  website?: string;
  location?: string;
  favoriteFilmIds: UserProfile['favoriteFilmIds'];
  stats: UserProfile['stats'];
  createdAt: string;
}

function buildProfile(input: ProfileSeedInput): UserProfile {
  return {
    id: input.id,
    username: input.username,
    displayName: input.displayName,
    avatarUrl: `https://images.unsplash.com/${input.avatarSeed}?auto=format&fit=crop&w=256&h=256&q=80`,
    bio: input.bio,
    website: input.website,
    location: input.location,
    favoriteFilmIds: input.favoriteFilmIds,
    stats: input.stats,
    createdAt: input.createdAt,
    updatedAt: FILM_UPDATED_AT,
  };
}

/** The signed-in viewer. Every "my" surface reads this profile id. */
export const SEED_PRIMARY_USER_ID = 'user_001';

export const SEED_PROFILES: UserProfile[] = [
  buildProfile({
    id: SEED_PRIMARY_USER_ID,
    username: 'deakins_ghost',
    displayName: 'Alex Rivers',
    avatarSeed: 'photo-1534528741775-53994a69daeb',
    bio: 'Filmmaker and archivist. Always chasing wide aspect ratios and 35mm grain. Letterboxd diary since 2011.',
    website: 'https://cineslate.app/alex',
    location: 'Los Angeles, CA',
    favoriteFilmIds: [
      'film_parasite',
      'film_blade_runner_2049',
      'film_in_the_mood_for_love',
      'film_mulholland_drive',
    ],
    stats: {
      filmsWatched: 1_248,
      thisYearCount: 142,
      listsCreated: 18,
      reviewsWritten: 312,
      followingCount: 384,
      followersCount: 512,
      totalWatchTimeMinutes: 162_240,
    },
    createdAt: '2019-02-11T00:00:00.000Z',
  }),
  buildProfile({
    id: 'user_002',
    username: 'reel_roulette',
    displayName: 'Mira Okonkwo',
    avatarSeed: 'photo-1494790108377-be9c29b29330',
    bio: 'Programmer at a repertory cinema. If it was shot on 16mm, I have already bought a ticket.',
    location: 'Lagos, NG',
    favoriteFilmIds: [
      'film_spirited_away',
      'film_in_the_mood_for_love',
      'film_whiplash',
      null,
    ],
    stats: {
      filmsWatched: 943,
      thisYearCount: 118,
      listsCreated: 26,
      reviewsWritten: 204,
      followingCount: 291,
      followersCount: 640,
      totalWatchTimeMinutes: 118_500,
    },
    createdAt: '2020-05-02T00:00:00.000Z',
  }),
  buildProfile({
    id: 'user_003',
    username: 'grain_and_gate',
    displayName: 'Tomas Lindqvist',
    avatarSeed: 'photo-1500648767791-00dcc994a43e',
    bio: 'Sound designer. I rate films on how they treat silence.',
    website: 'https://grainandgate.se',
    location: 'Stockholm, SE',
    favoriteFilmIds: [
      'film_blade_runner_2049',
      'film_arrival',
      'film_fallen_angels',
      'film_portrait_lady_on_fire',
    ],
    stats: {
      filmsWatched: 1_602,
      thisYearCount: 96,
      listsCreated: 11,
      reviewsWritten: 158,
      followingCount: 122,
      followersCount: 388,
      totalWatchTimeMinutes: 205_400,
    },
    createdAt: '2017-11-19T00:00:00.000Z',
  }),
  buildProfile({
    id: 'user_004',
    username: 'matinee_maya',
    displayName: 'Maya Delacroix',
    avatarSeed: 'photo-1517841905240-472988babdf9',
    bio: 'Writes about melodrama and colour. Currently obsessed with early Technicolor restorations.',
    location: 'Paris, FR',
    favoriteFilmIds: ['film_godfather', 'film_portrait_lady_on_fire', 'film_fury_road', null],
    stats: {
      filmsWatched: 1_104,
      thisYearCount: 173,
      listsCreated: 31,
      reviewsWritten: 276,
      followingCount: 512,
      followersCount: 731,
      totalWatchTimeMinutes: 141_800,
    },
    createdAt: '2018-08-30T00:00:00.000Z',
  }),
  buildProfile({
    id: 'user_005',
    username: 'letterbox_dad',
    displayName: 'Idris Bello',
    avatarSeed: 'photo-1506794778202-cad84cf45f1d',
    bio: 'Father of two, curator of a very loud living room cinema. Popcorn is non-negotiable.',
    location: 'Manchester, UK',
    favoriteFilmIds: ['film_eeaao', 'film_fury_road', 'film_spirited_away', 'film_whiplash'],
    stats: {
      filmsWatched: 688,
      thisYearCount: 84,
      listsCreated: 9,
      reviewsWritten: 92,
      followingCount: 164,
      followersCount: 208,
      totalWatchTimeMinutes: 86_300,
    },
    createdAt: '2021-01-08T00:00:00.000Z',
  }),
];

/** Fast lookups for the seed composition helpers below. */
export const SEED_PROFILE_BY_ID: Record<string, UserProfile> = Object.fromEntries(
  SEED_PROFILES.map((profile) => [profile.id, profile]),
);

const SEED_FILM_BY_ID: Record<string, Film> = Object.fromEntries(
  SEED_FILMS.map((film) => [film.id, film]),
);

function filmOf(filmId: string): Film {
  const film = SEED_FILM_BY_ID[filmId];
  if (!film) throw new Error(`Seed fixture error: unknown film id "${filmId}"`);
  return film;
}

/* -------------------------------------------------------------------------- */
/* Reviews & diary                                                             */
/* -------------------------------------------------------------------------- */

type ReviewSeedInput = Omit<Review, 'createdAt' | 'updatedAt' | 'isDeleted'> & {
  createdAt?: string;
};

function buildReview(input: ReviewSeedInput): Review {
  return {
    ...input,
    isDeleted: false,
    createdAt: input.createdAt ?? REVIEW_CREATED_AT,
    updatedAt: input.createdAt ?? REVIEW_CREATED_AT,
  };
}

export const SEED_REVIEWS: Review[] = [
  buildReview({
    id: 'rev_0001',
    filmId: 'film_parasite',
    userId: 'user_001',
    rating: 5.0,
    isLiked: true,
    containsSpoilers: true,
    watchedDate: '2026-03-14',
    isRewatch: true,
    likeCount: 214,
    commentCount: 18,
    reviewBody:
      '## The staircase is the thesis\n\nThe whole film is a vertical argument. Every ascent is an **aspiration** and every descent is a *concession*, and Bong shoots the geometry so precisely that you feel the class structure in your knees before anyone says a word about money.\n\n> The smell is the only thing in this house that cannot be bought.\n\nWhat I keep returning to is the *tonal pivot* — the moment the storm starts and the comedy drains out of the frame. On a fifth viewing I noticed the framing tightens by a few degrees every time the family descends, until the basement sequence is shot almost entirely in **medium close-up**.\n\n- The flood sequence is the best-edited ten minutes of the decade\n- The party scene uses natural light almost exclusively\n- That final shot is a punchline and an elegy at once',
    createdAt: hoursAgo(26),
  }),
  buildReview({
    id: 'rev_0002',
    filmId: 'film_blade_runner_2049',
    userId: 'user_002',
    rating: 4.5,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-02-28',
    isRewatch: false,
    likeCount: 168,
    commentCount: 11,
    reviewBody:
      'Deakins shoots fog like it is a *character*. Every frame is dense with atmosphere and yet the film never becomes a slideshow, because Villeneuve keeps the pacing deliberately **slow and architectural**.\n\nK\'s arc is essentially a search for evidence that he is *special*, and the film is cruel and tender about how that search ends. Two hours and forty-four minutes of melancholy that earns every minute.',
    createdAt: hoursAgo(52),
  }),
  buildReview({
    id: 'rev_0003',
    filmId: 'film_spirited_away',
    userId: 'user_003',
    rating: 5.0,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-01-12',
    isRewatch: true,
    likeCount: 302,
    commentCount: 24,
    reviewBody:
      'A film about *learning to work before you learn to want*. Chihiro is never given a power-up; she is given a job, and the job teaches her courage.\n\nMiyazaki animates water like it has memory. The train sequence across the flooded plain is still the most *quietly devastating* three minutes in animation — nothing happens, and everything changes.\n\n1. The bathhouse is a workplace comedy\n2. No-Face is loneliness with an appetite\n3. Haku is the friend who forgot himself first',
    createdAt: hoursAgo(90),
  }),
  buildReview({
    id: 'rev_0004',
    filmId: 'film_godfather',
    userId: 'user_001',
    rating: 5.0,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-08-30',
    isRewatch: true,
    likeCount: 486,
    commentCount: 41,
    reviewBody:
      'The definitive argument that **lighting is narrative**. Gordon Willis keeps Brando\'s eyes in shadow through the entire first act so that when Michael finally takes the chair, the light has *moved* — and we understand the inheritance without a single line of exposition.\n\nThe film is a machine about *legitimacy*: everyone wants to be respectable, and every route to respectability runs through violence.\n\nAlso: the wedding sequence remains the most efficient piece of cross-cutting ever assembled.',
    createdAt: hoursAgo(38),
  }),
  buildReview({
    id: 'rev_0005',
    filmId: 'film_mulholland_drive',
    userId: 'user_004',
    rating: 4.0,
    isLiked: false,
    containsSpoilers: true,
    watchedDate: '2026-07-19',
    isRewatch: false,
    likeCount: 121,
    commentCount: 27,
    reviewBody:
      'The first two hours are a *wish*, and the last thirty minutes are the bill. Everything before Club Silencio is glossy, over-lit and slightly too kind — and that is the point, because Lynch is showing us a dream that Diane is *narrating to herself*.\n\n`Reel change` is the structural hinge: after it, the casting changes, the cruelty is real, and the same actresses play different people.\n\n- The Cowboy scene is a threat delivered as a lullaby\n- The Spanish cover of "Crying" is the emotional detonator\n- The blue key is never explained and never needs to be',
    createdAt: hoursAgo(118),
  }),
  buildReview({
    id: 'rev_0006',
    filmId: 'film_portrait_lady_on_fire',
    userId: 'user_003',
    rating: 4.5,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-06-06',
    isRewatch: false,
    likeCount: 274,
    commentCount: 16,
    reviewBody:
      'Sciamma builds the entire romance out of *looking*. The film is about the difference between being seen and being **painted**, and it never once cheats that distinction.\n\nThe a cappella sequence is the best use of diegetic sound in a modern film: no score, no cutaway, just a face deciding whether to turn around.\n\n> Do all lovers feel they are inventing something?',
    createdAt: hoursAgo(146),
  }),
  buildReview({
    id: 'rev_0007',
    filmId: 'film_eeaao',
    userId: 'user_005',
    rating: 4.5,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-09-05',
    isRewatch: false,
    likeCount: 96,
    commentCount: 8,
    reviewBody:
      'I watched this with my father and we both pretended not to cry at the *googly eyes* sequence. It is a maximalist comedy that somehow lands every single one of its thousand swings.\n\nThe Daniels understand that **absurdity is a delivery mechanism for sincerity**. The bagel is nihilism rendered as a pastry. I have no notes.',
    createdAt: hoursAgo(14),
  }),
  buildReview({
    id: 'rev_0008',
    filmId: 'film_mulholland_drive',
    userId: 'user_001',
    rating: 4.5,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-06-06',
    isRewatch: true,
    likeCount: 189,
    commentCount: 13,
    reviewBody:
      'Second viewing, and the *sound design* is what carries it. Lynch mixes room tone so aggressively that silence itself feels like a held breath.\n\nWhat looked like an incoherent second half on first watch now reads as a perfectly legible **guilt structure**: the dream is generous because the reality was not.',
    createdAt: daysAgoIso(4),
  }),
  buildReview({
    id: 'rev_0009',
    filmId: 'film_whiplash',
    userId: 'user_002',
    rating: 4.5,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-09-12',
    isRewatch: false,
    likeCount: 143,
    commentCount: 19,
    reviewBody:
      'A sports film wearing a jazz costume. Chazelle cuts to the *click of a metronome* like it is a punch landing, and the final nine minutes are edited with the rhythm of the piece itself.\n\nIs Fletcher a mentor or an abuser? The film is smarter than it gets credit for: it lets you *want* the answer to be mentor, and then makes you sit with that.',
    createdAt: hoursAgo(20),
  }),
  buildReview({
    id: 'rev_0010',
    filmId: 'film_in_the_mood_for_love',
    userId: 'user_004',
    rating: 5.0,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-08-22',
    isRewatch: true,
    likeCount: 341,
    commentCount: 32,
    reviewBody:
      'Nothing happens in the corridors, and the corridors are the entire film. Wong Kar-wai shoots the *approach* — the walk to the noodle stall, the shared wall, the stairwell half-turn.\n\nShigeru Umebayashi\'s theme repeats until it becomes a physical sensation. The **red curtain**, the **green wall**, the **cigarette smoke**: a colour score as precise as any dialogue.\n\n> He remembers those vanished years. As though looking through a dusty window pane, the past is something he could see, but not touch.',
    createdAt: hoursAgo(44),
  }),
  buildReview({
    id: 'rev_0011',
    filmId: 'film_arrival',
    userId: 'user_003',
    rating: 4.0,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-05-17',
    isRewatch: false,
    likeCount: 112,
    commentCount: 9,
    reviewBody:
      'A first-contact film where the aliens are *language*, and the twist is grammatical rather than military. Villeneuve treats the heptapod logograms as **palindromes of time**, and the entire structure of the film retroactively becomes one of them.\n\nThe choice Louise makes at the end is the most genuinely *adult* decision in a mainstream science fiction film this century.',
    createdAt: hoursAgo(66),
  }),
  buildReview({
    id: 'rev_0012',
    filmId: 'film_fury_road',
    userId: 'user_005',
    rating: 4.0,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-09-18',
    isRewatch: true,
    likeCount: 87,
    commentCount: 6,
    reviewBody:
      'Two hours of *kinetic storytelling* with almost no exposition and no wasted frame. Miller stages action so that every cut answers a spatial question you did not know you had asked.\n\nFuriosa is the protagonist and Max is the passenger, and the film never once feels the need to explain that.',
    createdAt: hoursAgo(8),
  }),
  buildReview({
    id: 'rev_0013',
    filmId: 'film_fallen_angels',
    userId: 'user_002',
    rating: 4.0,
    isLiked: false,
    containsSpoilers: false,
    watchedDate: '2026-04-09',
    isRewatch: false,
    likeCount: 74,
    commentCount: 5,
    reviewBody:
      'Shot through ultra-wide lenses so distorted that the city folds around the characters. It is a *mood piece* rather than a plot, and the mood is neon insomnia.\n\nThe mute protagonist who never speaks is the most articulate person in the film.',
    createdAt: hoursAgo(102),
  }),
  buildReview({
    id: 'rev_0014',
    filmId: 'film_parasite',
    userId: 'user_004',
    rating: 4.5,
    isLiked: true,
    containsSpoilers: false,
    watchedDate: '2026-02-14',
    isRewatch: false,
    likeCount: 233,
    commentCount: 21,
    reviewBody:
      'The *peach* is the best plot device of the decade. A comedy of manners that turns into a tragedy of architecture without ever changing its tone abruptly — it just keeps **tightening the frame**.\n\nEvery object introduced in the first hour pays off in the second. It is a heist film with the moral floor removed.',
    createdAt: daysAgoIso(6),
  }),
];

type DiarySeedInput = Omit<DiaryEntry, 'createdAt' | 'isDeleted' | 'updatedAt'> & {
  createdAt?: string;
};

function buildDiaryEntry(input: DiarySeedInput): DiaryEntry {
  return {
    ...input,
    isDeleted: false,
    createdAt: input.createdAt ?? REVIEW_CREATED_AT,
    updatedAt: input.createdAt ?? REVIEW_CREATED_AT,
  };
}

/**
 * The viewer's watch history, plus friend entries that back the activity feed.
 * Entries carrying a `reviewId` are wired to that review's back-reference.
 */
export const SEED_DIARY: DiaryEntry[] = [
  // --- Alex Rivers (the signed-in viewer) ---
  buildDiaryEntry({
    id: 'diary_0001', userId: 'user_001', filmId: 'film_spirited_away',
    watchedDate: '2026-01-12', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0002', userId: 'user_001', filmId: 'film_whiplash',
    watchedDate: '2026-01-27', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0003', userId: 'user_001', filmId: 'film_arrival',
    watchedDate: '2026-02-07', rating: 4.0, isLiked: false, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0004', userId: 'user_001', filmId: 'film_blade_runner_2049',
    watchedDate: '2026-02-21', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0005', userId: 'user_001', filmId: 'film_fallen_angels',
    watchedDate: '2026-03-02', rating: 4.0, isLiked: false, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0006', userId: 'user_001', filmId: 'film_parasite', reviewId: 'rev_0001',
    watchedDate: '2026-03-14', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0007', userId: 'user_001', filmId: 'film_fury_road',
    watchedDate: '2026-03-29', rating: 4.0, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0008', userId: 'user_001', filmId: 'film_eeaao',
    watchedDate: '2026-04-15', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0009', userId: 'user_001', filmId: 'film_mulholland_drive', reviewId: 'rev_0008',
    watchedDate: '2026-06-06', rating: 4.5, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0010', userId: 'user_001', filmId: 'film_portrait_lady_on_fire',
    watchedDate: '2026-06-24', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0011', userId: 'user_001', filmId: 'film_in_the_mood_for_love',
    watchedDate: '2026-07-08', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0012', userId: 'user_001', filmId: 'film_godfather', reviewId: 'rev_0004',
    watchedDate: '2026-08-30', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0013', userId: 'user_001', filmId: 'film_spirited_away',
    watchedDate: '2026-09-13', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0014', userId: 'user_001', filmId: 'film_blade_runner_2049',
    watchedDate: '2026-09-19', rating: 5.0, isLiked: true, isRewatch: false,
  }),

  // --- Friends ---
  buildDiaryEntry({
    id: 'diary_0101', userId: 'user_002', filmId: 'film_blade_runner_2049', reviewId: 'rev_0002',
    watchedDate: '2026-02-28', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0102', userId: 'user_002', filmId: 'film_fallen_angels', reviewId: 'rev_0013',
    watchedDate: '2026-04-09', rating: 4.0, isLiked: false, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0103', userId: 'user_002', filmId: 'film_whiplash', reviewId: 'rev_0009',
    watchedDate: '2026-09-12', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0104', userId: 'user_003', filmId: 'film_spirited_away', reviewId: 'rev_0003',
    watchedDate: '2026-01-12', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0105', userId: 'user_003', filmId: 'film_arrival',
    watchedDate: '2026-05-17', rating: 4.0, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0106', userId: 'user_003', filmId: 'film_portrait_lady_on_fire', reviewId: 'rev_0006',
    watchedDate: '2026-06-06', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0107', userId: 'user_004', filmId: 'film_mulholland_drive',
    watchedDate: '2026-07-19', rating: 4.0, isLiked: false, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0108', userId: 'user_004', filmId: 'film_in_the_mood_for_love',
    watchedDate: '2026-08-22', rating: 5.0, isLiked: true, isRewatch: true,
  }),
  buildDiaryEntry({
    id: 'diary_0109', userId: 'user_005', filmId: 'film_eeaao', reviewId: 'rev_0007',
    watchedDate: '2026-09-05', rating: 4.5, isLiked: true, isRewatch: false,
  }),
  buildDiaryEntry({
    id: 'diary_0110', userId: 'user_005', filmId: 'film_fury_road',
    watchedDate: '2026-09-18', rating: 4.0, isLiked: true, isRewatch: true,
  }),
];

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

interface ListSeedInput {
  id: string;
  userId: string;
  title: string;
  description: string;
  isRanked: boolean;
  isPrivate: boolean;
  likeCount: number;
  tags: string[];
  createdAt: string;
  entries: { filmId: string; customNote?: string }[];
}

/** Base spacing for the fractional index ladder. */
const ORDER_STRIDE = 1000;

function buildList(input: ListSeedInput): FilmList {
  const items: ListItem[] = input.entries.map((entry, index) => ({
    id: `${input.id}_item_${String(index + 1).padStart(2, '0')}`,
    listId: input.id,
    filmId: entry.filmId,
    orderIndex: (index + 1) * ORDER_STRIDE,
    customNote: entry.customNote,
    addedAt: input.createdAt,
  }));

  return {
    id: input.id,
    userId: input.userId,
    title: input.title,
    description: input.description,
    isRanked: input.isRanked,
    isPrivate: input.isPrivate,
    itemCount: items.length,
    likeCount: input.likeCount,
    tags: input.tags,
    items,
    isDeleted: false,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export const SEED_LISTS: FilmList[] = [
  buildList({
    id: 'list_001',
    userId: 'user_001',
    title: 'Neon & Rain: The Nocturnal Canon',
    description:
      'Films that treat night-time cities as a psychological state. Ranked by how completely they dissolve the boundary between the street and the dream.',
    isRanked: true,
    isPrivate: false,
    likeCount: 412,
    tags: ['neo-noir', 'cinematography', 'mood'],
    createdAt: daysAgoIso(210),
    entries: [
      { filmId: 'film_in_the_mood_for_love', customNote: 'The corridor walk is the whole genre in ninety seconds.' },
      { filmId: 'film_blade_runner_2049', customNote: 'Fog as architecture.' },
      { filmId: 'film_fallen_angels', customNote: 'Ultra-wide lenses that bend the city around people.' },
      { filmId: 'film_mulholland_drive', customNote: 'A dream with the lights left on.' },
    ],
  }),
  buildList({
    id: 'list_002',
    userId: 'user_001',
    title: 'Films That Rewire Your Sense of Time',
    description:
      'Structural puzzle boxes where the editing itself is the argument. Unranked — ordering them would defeat the point.',
    isRanked: false,
    isPrivate: false,
    likeCount: 268,
    tags: ['editing', 'structure', 'rewatch'],
    createdAt: daysAgoIso(145),
    entries: [
      { filmId: 'film_arrival', customNote: 'The twist is grammatical.' },
      { filmId: 'film_mulholland_drive', customNote: 'Reel change as a hinge.' },
      { filmId: 'film_eeaao', customNote: 'Maximalism as a delivery mechanism for sincerity.' },
      { filmId: 'film_parasite', customNote: 'Vertical editing: every cut is a class move.' },
      { filmId: 'film_whiplash', customNote: 'Cut to the click of a metronome.' },
    ],
  }),
  buildList({
    id: 'list_003',
    userId: 'user_002',
    title: 'Repertory Night Picks',
    description: 'What I put on the big screen when I get to choose. All 35mm if the prints still exist.',
    isRanked: true,
    isPrivate: false,
    likeCount: 176,
    tags: ['repertory', '35mm'],
    createdAt: daysAgoIso(96),
    entries: [
      { filmId: 'film_spirited_away', customNote: 'Hand-drawn water with memory.' },
      { filmId: 'film_in_the_mood_for_love', customNote: 'Colour score as precise as dialogue.' },
      { filmId: 'film_fallen_angels', customNote: 'Neon insomnia.' },
      { filmId: 'film_whiplash', customNote: 'A sports film in a jazz costume.' },
    ],
  }),
  buildList({
    id: 'list_004',
    userId: 'user_003',
    title: 'Best Sound Design, 2000–2026',
    description: 'Ranked by how much of the storytelling happens in the mix rather than the frame.',
    isRanked: true,
    isPrivate: false,
    likeCount: 331,
    tags: ['sound', 'craft'],
    createdAt: daysAgoIso(70),
    entries: [
      { filmId: 'film_blade_runner_2049', customNote: 'Room tone as a character.' },
      { filmId: 'film_arrival', customNote: 'The heptapod vocalisations are the plot.' },
      { filmId: 'film_portrait_lady_on_fire', customNote: 'No score, just a face deciding.' },
      { filmId: 'film_mulholland_drive', customNote: 'Silence held like a breath.' },
      { filmId: 'film_fury_road', customNote: 'Engine noise as percussion.' },
    ],
  }),
  buildList({
    id: 'list_005',
    userId: 'user_005',
    title: 'Living Room Crowd-Pleasers',
    description:
      'Tested on a seven-year-old, a sceptical teenager and a grandmother. All three stayed off their phones.',
    isRanked: false,
    isPrivate: true,
    likeCount: 84,
    tags: ['family', 'rewatchable'],
    createdAt: daysAgoIso(28),
    entries: [
      { filmId: 'film_eeaao', customNote: 'The googly eyes got everyone.' },
      { filmId: 'film_spirited_away', customNote: 'The train sequence silences the room.' },
      { filmId: 'film_fury_road', customNote: 'Two hours, zero boredom.' },
      { filmId: 'film_whiplash', customNote: 'Loud, and the teenager loved it.' },
      { filmId: 'film_godfather', customNote: 'Grandmother\'s verdict: "now that is a film".' },
    ],
  }),
];

/* -------------------------------------------------------------------------- */
/* Activity stream                                                             */
/* -------------------------------------------------------------------------- */

interface ActivitySeedInput {
  id: string;
  userId: string;
  type: ActivityEvent['type'];
  targetId: string;
  filmId?: string;
  metadata: ActivityEvent['metadata'];
  createdAt: string;
}

function buildActivity(input: ActivitySeedInput): ActivityEvent {
  const profile = SEED_PROFILE_BY_ID[input.userId];
  if (!profile) {
    throw new Error(`Seed fixture error: unknown user id "${input.userId}"`);
  }
  const film = input.filmId ? filmOf(input.filmId) : null;

  return {
    id: input.id,
    userId: input.userId,
    user: profile,
    type: input.type,
    targetId: input.targetId,
    filmSlug: film?.slug,
    metadata: {
      ...(film
        ? { filmTitle: film.title, filmYear: film.releaseYear, filmPoster: film.posterUrl }
        : {}),
      ...input.metadata,
    },
    createdAt: input.createdAt,
  };
}

function reviewSnippet(reviewId: string): string {
  const review = SEED_REVIEWS.find((candidate) => candidate.id === reviewId);
  return review ? toPlainTextPreview(review.reviewBody, 200) : '';
}

export const SEED_ACTIVITY: ActivityEvent[] = [
  buildActivity({
    id: 'act_0001', userId: 'user_005', type: 'LOG_FILM', targetId: 'film_fury_road',
    filmId: 'film_fury_road', metadata: { rating: 4.0, isLiked: true }, createdAt: hoursAgo(2),
  }),
  buildActivity({
    id: 'act_0002', userId: 'user_002', type: 'REVIEW_FILM', targetId: 'rev_0009',
    filmId: 'film_whiplash',
    metadata: { rating: 4.5, isLiked: true, reviewSnippet: reviewSnippet('rev_0009') },
    createdAt: hoursAgo(6),
  }),
  buildActivity({
    id: 'act_0003', userId: 'user_001', type: 'LIKE_REVIEW', targetId: 'rev_0009',
    filmId: 'film_whiplash', metadata: {}, createdAt: hoursAgo(7),
  }),
  buildActivity({
    id: 'act_0004', userId: 'user_005', type: 'REVIEW_FILM', targetId: 'rev_0007',
    filmId: 'film_eeaao',
    metadata: { rating: 4.5, isLiked: true, reviewSnippet: reviewSnippet('rev_0007') },
    createdAt: hoursAgo(14),
  }),
  buildActivity({
    id: 'act_0005', userId: 'user_003', type: 'LOG_FILM', targetId: 'film_arrival',
    filmId: 'film_arrival', metadata: { rating: 4.0 }, createdAt: hoursAgo(19),
  }),
  buildActivity({
    id: 'act_0006', userId: 'user_001', type: 'REVIEW_FILM', targetId: 'rev_0001',
    filmId: 'film_parasite',
    metadata: { rating: 5.0, isLiked: true, reviewSnippet: reviewSnippet('rev_0001') },
    createdAt: hoursAgo(26),
  }),
  buildActivity({
    id: 'act_0007', userId: 'user_004', type: 'CREATE_LIST', targetId: 'list_005',
    metadata: { listTitle: 'Living Room Crowd-Pleasers' }, createdAt: hoursAgo(31),
  }),
  buildActivity({
    id: 'act_0008', userId: 'user_002', type: 'FOLLOW_USER', targetId: 'user_001',
    metadata: {}, createdAt: hoursAgo(35),
  }),
  buildActivity({
    id: 'act_0009', userId: 'user_001', type: 'LOG_FILM', targetId: 'film_blade_runner_2049',
    filmId: 'film_blade_runner_2049', metadata: { rating: 5.0, isLiked: true },
    createdAt: hoursAgo(41),
  }),
  buildActivity({
    id: 'act_0010', userId: 'user_004', type: 'REVIEW_FILM', targetId: 'rev_0010',
    filmId: 'film_in_the_mood_for_love',
    metadata: { rating: 5.0, isLiked: true, reviewSnippet: reviewSnippet('rev_0010') },
    createdAt: hoursAgo(48),
  }),
  buildActivity({
    id: 'act_0011', userId: 'user_002', type: 'REVIEW_FILM', targetId: 'rev_0002',
    filmId: 'film_blade_runner_2049',
    metadata: { rating: 4.5, isLiked: true, reviewSnippet: reviewSnippet('rev_0002') },
    createdAt: hoursAgo(52),
  }),
  buildActivity({
    id: 'act_0012', userId: 'user_003', type: 'LIKE_REVIEW', targetId: 'rev_0010',
    filmId: 'film_in_the_mood_for_love', metadata: {}, createdAt: hoursAgo(58),
  }),
  buildActivity({
    id: 'act_0013', userId: 'user_003', type: 'REVIEW_FILM', targetId: 'rev_0011',
    filmId: 'film_arrival',
    metadata: { rating: 4.0, isLiked: true, reviewSnippet: reviewSnippet('rev_0011') },
    createdAt: hoursAgo(66),
  }),
  buildActivity({
    id: 'act_0014', userId: 'user_004', type: 'CREATE_LIST', targetId: 'list_004',
    metadata: { listTitle: 'Best Sound Design, 2000–2026' }, createdAt: hoursAgo(74),
  }),
  buildActivity({
    id: 'act_0015', userId: 'user_003', type: 'REVIEW_FILM', targetId: 'rev_0003',
    filmId: 'film_spirited_away',
    metadata: { rating: 5.0, isLiked: true, reviewSnippet: reviewSnippet('rev_0003') },
    createdAt: hoursAgo(90),
  }),
  buildActivity({
    id: 'act_0016', userId: 'user_002', type: 'REVIEW_FILM', targetId: 'rev_0013',
    filmId: 'film_fallen_angels',
    metadata: { rating: 4.0, reviewSnippet: reviewSnippet('rev_0013') },
    createdAt: hoursAgo(102),
  }),
  buildActivity({
    id: 'act_0017', userId: 'user_005', type: 'LIKE_REVIEW', targetId: 'rev_0004',
    filmId: 'film_godfather', metadata: {}, createdAt: hoursAgo(112),
  }),
  buildActivity({
    id: 'act_0018', userId: 'user_004', type: 'REVIEW_FILM', targetId: 'rev_0005',
    filmId: 'film_mulholland_drive',
    metadata: { rating: 4.0, reviewSnippet: reviewSnippet('rev_0005') },
    createdAt: hoursAgo(118),
  }),
  buildActivity({
    id: 'act_0019', userId: 'user_001', type: 'CREATE_LIST', targetId: 'list_001',
    metadata: { listTitle: 'Neon & Rain: The Nocturnal Canon' }, createdAt: hoursAgo(128),
  }),
  buildActivity({
    id: 'act_0020', userId: 'user_003', type: 'REVIEW_FILM', targetId: 'rev_0006',
    filmId: 'film_portrait_lady_on_fire',
    metadata: { rating: 4.5, isLiked: true, reviewSnippet: reviewSnippet('rev_0006') },
    createdAt: hoursAgo(146),
  }),
];

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

export interface SeedResult {
  seeded: boolean;
  filmCount: number;
  reviewCount: number;
  diaryCount: number;
  listCount: number;
  profileCount: number;
  activityCount: number;
}

/**
 * Idempotently populates IndexedDB with the fixture dataset.
 *
 * Safe to call from every client island mount: the operation short-circuits
 * when the stored `seedVersion` already matches, and the write itself runs in a
 * single transaction so a closed tab can never leave a half-seeded database.
 */
export async function initializeDatabaseSeed(): Promise<SeedResult> {
  const db = getDb();
  const storedVersion = await db.meta.get(META_KEY_SEED_VERSION);
  const isCurrent = Number(storedVersion?.value ?? 0) === SEED_VERSION;

  if (isCurrent) {
    return {
      seeded: false,
      filmCount: await db.films.count(),
      reviewCount: await db.reviews.count(),
      diaryCount: await db.diary.count(),
      listCount: await db.lists.count(),
      profileCount: await db.profiles.count(),
      activityCount: await db.activity.count(),
    };
  }

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
      ]);

      await db.films.bulkPut(SEED_FILMS);
      await db.profiles.bulkPut(SEED_PROFILES);
      await db.reviews.bulkPut(SEED_REVIEWS);
      await db.diary.bulkPut(SEED_DIARY);
      await db.lists.bulkPut(SEED_LISTS);
      await db.activity.bulkPut(SEED_ACTIVITY);

      await db.meta.bulkPut([
        { key: META_KEY_SEED_VERSION, value: SEED_VERSION, updatedAt: SEED_NOW },
        { key: META_KEY_SEEDED_AT, value: SEED_NOW, updatedAt: SEED_NOW },
      ]);
    },
  );

  return {
    seeded: true,
    filmCount: SEED_FILMS.length,
    reviewCount: SEED_REVIEWS.length,
    diaryCount: SEED_DIARY.length,
    listCount: SEED_LISTS.length,
    profileCount: SEED_PROFILES.length,
    activityCount: SEED_ACTIVITY.length,
  };
}

/** Convenience helper for tests and the profile reset action. */
export async function forceReseed(): Promise<SeedResult> {
  const db = getDb();
  await db.meta.delete(META_KEY_SEED_VERSION);
  return initializeDatabaseSeed();
}

/** Deterministic "highest rated" fixture used by the home spotlight fallback. */
export function getSeedFilmBySlug(slug: string): Film | null {
  return SEED_FILMS.find((film) => film.slug === slug) ?? null;
}

/** The sign-in fixture — read by every "my diary" surface. */
export function getPrimarySeedProfile(): UserProfile {
  const profile = SEED_PROFILE_BY_ID[SEED_PRIMARY_USER_ID];
  if (!profile) throw new Error('Seed fixture error: primary profile is missing');
  return profile;
}

/** Type re-export guard so consumers cannot import a rating literal by accident. */
export type { StarRating };
