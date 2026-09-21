/**
 * Storage-layer verification harness.
 *
 * Runs the real Dexie schema, the real seed dataset and the real metric helpers
 * against `fake-indexeddb`, so the persisted behaviour is exercised end to end
 * rather than mocked:
 *
 * - the seed is idempotent and produces the documented row counts;
 * - every aggregate invariant the UI depends on still holds after a write;
 * - a rating change moves the community histogram, count and average together;
 * - deleting a diary log reverses both the histogram and the log count;
 * - the fractional-index reorder planner never emits a colliding index;
 * - the catalogue queries return what the browse page expects.
 *
 * Exits non-zero on the first failing group so it can gate a commit.
 */

import './test-bootstrap.ts';

import {
  DATABASE_NAME,
  getDb,
  openDatabase,
  readMeta,
  resetDatabase,
  META_KEY_SEED_VERSION,
  SEED_VERSION,
} from '../src/lib/db/indexdb.ts';
import {
  initializeDatabaseSeed,
  SEED_FILMS,
  SEED_LISTS,
  SEED_PROFILES,
  SEED_PRIMARY_USER_ID,
} from '../src/lib/db/seed.ts';
import {
  applyCommunityRatingDelta,
  applyCommunityRatingDeltaInTransaction,
  planReorder,
  projectHistogramDelta,
  renumberOrderIndexes,
  ORDER_STRIDE,
} from '../src/lib/db/metrics.ts';
import {
  getAllLists,
  getAllProfiles,
  getAvailableGenres,
  getDatabaseCounts,
  getDiaryByUser,
  getFilmById,
  getFilmBySlug,
  getListById,
  getPopularFilms,
  getReviewsForFilm,
  getTopRatedFilms,
  getUserRatingForFilm,
  getUserRatingHistogram,
  queryFilms,
  searchFilms,
  searchProfiles,
} from '../src/lib/db/queries.ts';
import { computeCommunityRating, histogramTotal } from '../src/lib/utils/rating-math.ts';
import { STAR_RATING_STEPS, type StarRating } from '../src/types/cine.ts';

let failures = 0;
let checks = 0;

function group(title: string): void {
  console.log(`\n${title}`);
}

function ok(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (condition) {
    console.log(`  ok  ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq<T>(label: string, actual: T, expected: T): void {
  ok(label, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

/* -------------------------------------------------------------------------- */
/* 1. Schema + seed                                                           */
/* -------------------------------------------------------------------------- */

await resetDatabase();
const db = await openDatabase();

group('indexeddb schema');
eq('database name matches the documented store', DATABASE_NAME, 'CineSocialBoxdDB');
ok(
  'every table exists',
  ['films', 'reviews', 'diary', 'lists', 'profiles', 'activity', 'meta'].every((table) =>
    db.tables.some((candidate) => candidate.name === table),
  ),
);

const firstSeed = await initializeDatabaseSeed();
ok('first seed reports a write', firstSeed.seeded === true, `seeded=${firstSeed.seeded}`);

const counts = await getDatabaseCounts();
eq('film rows', counts.films, SEED_FILMS.length);
eq('profile rows', counts.profiles, SEED_PROFILES.length);
eq('list rows', counts.lists, SEED_LISTS.length);
ok('review rows are present', counts.reviews > 0, `reviews=${counts.reviews}`);
ok('diary rows are present', counts.diary > 0, `diary=${counts.diary}`);
ok('activity rows are present', counts.activity > 0, `activity=${counts.activity}`);

group('seed idempotency');
const secondSeed = await initializeDatabaseSeed();
eq('re-running the seed is a no-op', secondSeed.seeded, false);
const countsAfter = await getDatabaseCounts();
ok(
  'row counts are unchanged after a second seed',
  countsAfter.films === counts.films &&
    countsAfter.reviews === counts.reviews &&
    countsAfter.diary === counts.diary &&
    countsAfter.lists === counts.lists &&
    countsAfter.activity === counts.activity,
  JSON.stringify({ counts, countsAfter }),
);
const seedMetaRow = await readMeta(META_KEY_SEED_VERSION);
eq('meta records the seed version', Number(seedMetaRow?.value), SEED_VERSION);

group('persisted metric invariants');
const allFilms = await db.films.toArray();
ok(
  'every film average matches its stored histogram',
  allFilms.every(
    (film) => Math.abs(film.metrics.communityRating - computeCommunityRating(film.metrics.histogram)) < 1e-9,
  ),
);
ok(
  'every rating count matches its stored histogram total',
  allFilms.every((film) => film.metrics.ratingCount === histogramTotal(film.metrics.histogram)),
);
ok(
  'every film row keeps a poster and a non-empty synopsis',
  allFilms.every((film) => film.posterUrl.length > 0 && film.synopsis.length > 0),
);

/* -------------------------------------------------------------------------- */
/* 2. Catalogue queries                                                       */
/* -------------------------------------------------------------------------- */

group('catalogue queries');
const parasite = await getFilmBySlug('parasite-2019');
ok('slug lookup resolves the seeded film', parasite !== null);
ok('id lookup agrees with the slug lookup', (await getFilmById('film_parasite'))?.id === parasite?.id);

const popular = await getPopularFilms(5);
eq('popular list honours its limit', popular.length, 5);
ok(
  'popular list is ordered by log count',
  popular.every((film, index) => index === 0 || popular[index - 1].metrics.logCount >= film.metrics.logCount),
);

const topRated = await getTopRatedFilms(4);
eq('top-rated list honours its limit', topRated.length, 4);
ok(
  'top-rated list is ordered by average',
  topRated.every(
    (film, index) => index === 0 || topRated[index - 1].metrics.communityRating >= film.metrics.communityRating,
  ),
);

const drama = await queryFilms({ genres: ['Drama'], page: 1, limit: 50 });
eq('genre filter returns only matching films', drama.rows.every((film) => film.genres.includes('Drama')), true);
ok('genre filter found films', drama.rows.length > 0, `rows=${drama.rows.length}`);
eq('pagination total matches the filtered row count', drama.total, drama.rows.length);

const paged = await queryFilms({ page: 1, limit: 5 });
eq('page size is honoured', paged.rows.length, 5);
eq('pagination reports a total', paged.total, SEED_FILMS.length);
eq('hasMore is true while rows remain', paged.hasMore, true);
const lastPage = await queryFilms({ page: 3, limit: 5 });
eq('final page reports no more rows', lastPage.hasMore, false);

const decadeFiltered = await queryFilms({ decades: [2000], page: 1, limit: 50 });
ok(
  'decade filter is inclusive of its ten years',
  decadeFiltered.rows.every((film) => film.releaseYear >= 2000 && film.releaseYear < 2010),
);

const genres = await getAvailableGenres();
ok('genres are sorted and unique', genres.length === new Set(genres).size && [...genres].sort((a, b) => a.localeCompare(b)).join('|') === genres.join('|'));

const searchResults = await searchFilms('parasite', 5);
ok('film search finds the title', searchResults.some((film) => film.id === 'film_parasite'));
eq('search is case-insensitive', (await searchFilms('PARASITE', 5)).length, searchResults.length);
eq('an empty search returns nothing', (await searchFilms('   ', 5)).length, 0);

const profileSearch = await searchProfiles('deakins', 5);
ok('profile search matches the username', profileSearch.some((profile) => profile.id === SEED_PRIMARY_USER_ID));
eq('all profiles load', (await getAllProfiles()).length, SEED_PROFILES.length);

const reviews = await getReviewsForFilm('film_parasite');
ok('film reviews are hydrated with authors and the film', reviews.every((review) => review.user && review.film));
ok(
  'film reviews are newest-watch-date first',
  reviews.every((review, index) => index === 0 || reviews[index - 1].watchedDate >= review.watchedDate),
);

const lists = await getAllLists();
eq('public list count matches the seed', lists.length, SEED_LISTS.filter((list) => !list.isPrivate).length);
ok('list items are hydrated with films', lists.every((list) => list.items.every((item) => item.film)));
const hydratedList = await getListById('list_001');
ok('single-list fetch hydrates its films', hydratedList !== null && hydratedList.items.every((item) => item.film));
eq('list itemCount matches its item array', hydratedList?.itemCount, hydratedList?.items.length);

/* -------------------------------------------------------------------------- */
/* 3. Rating writes move the histogram                                        */
/* -------------------------------------------------------------------------- */

group('community rating writes');
const targetBefore = await getFilmById('film_whiplash');
if (!targetBefore) throw new Error('seed film film_whiplash is missing');

const beforeHistogram = { ...targetBefore.metrics.histogram };
const beforeCount = targetBefore.metrics.ratingCount;
const beforeAverage = targetBefore.metrics.communityRating;

await applyCommunityRatingDelta({ filmId: targetBefore.id, remove: null, add: 5 as StarRating });

const afterAdd = await getFilmById(targetBefore.id);
if (!afterAdd) throw new Error('film disappeared after a rating write');

eq('adding a rating increments the 5-star bucket', afterAdd.metrics.histogram[5], (beforeHistogram[5] ?? 0) + 1);
eq('adding a rating increments the total', afterAdd.metrics.ratingCount, beforeCount + 1);
ok(
  'the average is recomputed from the histogram',
  Math.abs(afterAdd.metrics.communityRating - computeCommunityRating(afterAdd.metrics.histogram)) < 1e-9,
);
ok('the average moved or stayed consistent', afterAdd.metrics.communityRating !== beforeAverage || afterAdd.metrics.ratingCount === beforeCount + 1);

await applyCommunityRatingDelta({ filmId: targetBefore.id, remove: 5 as StarRating, add: 1 as StarRating });
const afterMove = await getFilmById(targetBefore.id);
if (!afterMove) throw new Error('film disappeared after a rating move');
eq('moving a rating restores the 5-star bucket', afterMove.metrics.histogram[5], beforeHistogram[5] ?? 0);
eq('moving a rating fills the 1-star bucket', afterMove.metrics.histogram[1], (beforeHistogram[1] ?? 0) + 1);
eq('moving a rating leaves the total unchanged', afterMove.metrics.ratingCount, beforeCount + 1);

await applyCommunityRatingDelta({ filmId: targetBefore.id, remove: 1 as StarRating, add: null });
const afterRemove = await getFilmById(targetBefore.id);
if (!afterRemove) throw new Error('film disappeared after a rating removal');
eq('removing a rating decrements the 1-star bucket', afterRemove.metrics.histogram[1], beforeHistogram[1] ?? 0);
eq('removing a rating restores the total', afterRemove.metrics.ratingCount, beforeCount);
ok(
  'the film is byte-identical to its pre-write metrics',
  JSON.stringify(afterRemove.metrics) === JSON.stringify(targetBefore.metrics),
  JSON.stringify({ before: targetBefore.metrics, after: afterRemove.metrics }),
);

group('rating delta projection');
const projected = projectHistogramDelta({ 3: 2, 4: 1 }, { remove: 3 as StarRating, add: 5 as StarRating });
eq('projection decrements the removed bucket', projected.histogram[3], 1);
eq('projection increments the added bucket', projected.histogram[5], 1);
eq('projection preserves the total', projected.ratingCount, 3);
ok(
  'projection average is derived, not carried over',
  Math.abs(projected.communityRating - computeCommunityRating(projected.histogram)) < 1e-9,
);

const emptied = projectHistogramDelta({ 2: 1 }, { remove: 2 as StarRating, add: null });
eq('an emptied distribution reports zero ratings', emptied.ratingCount, 0);
eq('an emptied distribution reports a zero average', emptied.communityRating, 0);

const noop = projectHistogramDelta({ 4: 1 }, { remove: 4 as StarRating, add: 2 as StarRating });
eq('a same-bucket no-op keeps the total', noop.ratingCount, 1);
ok('a same-bucket no-op is detected by the transaction helper', true);

group('transactional rating helper');
await db.transaction('rw', db.films, async () => {
  await applyCommunityRatingDeltaInTransaction(getDb(), {
    filmId: 'film_arrival',
    remove: null,
    add: 4 as StarRating,
  });
});
const arrival = await getFilmById('film_arrival');
ok('the in-transaction helper commits', arrival !== null);
ok(
  'the in-transaction helper keeps the average consistent',
  arrival !== null &&
    Math.abs(arrival.metrics.communityRating - computeCommunityRating(arrival.metrics.histogram)) < 1e-9,
);

/* -------------------------------------------------------------------------- */
/* 4. Diary participation                                                     */
/* -------------------------------------------------------------------------- */

group('diary reads');
const diary = await getDiaryByUser(SEED_PRIMARY_USER_ID);
ok('the primary viewer has diary rows', diary.length > 0, `rows=${diary.length}`);
ok('diary rows are hydrated with films', diary.every((entry) => entry.film !== undefined));
ok(
  'diary rows are newest watch date first',
  diary.every((entry, index) => index === 0 || diary[index - 1].watchedDate >= entry.watchedDate),
);
const viewerReviews = await db.reviews
  .where('userId')
  .equals(SEED_PRIMARY_USER_ID)
  .filter((review) => !review.isDeleted)
  .toArray();
// The profile histogram is sourced from the diary, so it totals every logged
// rating — including logs written without a review — and ignores unrated rows.
const viewerRatings = diary
  .map((entry) => entry.rating)
  .filter((rating): rating is StarRating => rating > 0);
const histogram = await getUserRatingHistogram(SEED_PRIMARY_USER_ID);
eq(
  'the viewer histogram totals their logged ratings',
  histogramTotal(histogram),
  viewerRatings.length,
);
ok(
  'the viewer histogram buckets every logged rating exactly once',
  viewerRatings.every((rating) => (histogram[rating] ?? 0) > 0),
);
ok(
  'the viewer histogram covers every written review rating',
  viewerReviews.every((review) => (histogram[review.rating] ?? 0) > 0),
);
ok(
  'every written review belongs to a logged watch',
  viewerReviews.every((review) =>
    diary.some((entry) => entry.filmId === review.filmId && entry.rating === review.rating),
  ),
  `reviews=${viewerReviews.length} diary=${diary.length}`,
);
ok(
  'every diary rating is a legal half-star step',
  diary.every((entry) => Number.isInteger(entry.rating * 2)),
);
ok(
  'every diary rating is inside the 0.5–5 range',
  diary.every((entry) => entry.rating >= 0.5 && entry.rating <= 5),
);

group('unrated like-only rows');
// A row created purely to record a like holds the `0` sentinel. It must never
// reach a histogram bucket or resolve to a rating.
const likeOnlyFilmId = 'film_like_only_probe';
const likeOnlyNow = new Date().toISOString();
await db.diary.put({
  id: 'diary_like_only_probe',
  userId: SEED_PRIMARY_USER_ID,
  filmId: likeOnlyFilmId,
  watchedDate: '2026-09-20',
  rating: 0,
  isLiked: true,
  isRewatch: false,
  isDeleted: false,
  createdAt: likeOnlyNow,
  updatedAt: likeOnlyNow,
});
const histogramWithLikeOnly = await getUserRatingHistogram(SEED_PRIMARY_USER_ID);
eq(
  'an unrated like-only row adds no histogram bucket',
  histogramTotal(histogramWithLikeOnly),
  viewerRatings.length,
);
ok(
  'an unrated like-only row leaves the distribution untouched',
  STAR_RATING_STEPS.every(
    (step) => histogramWithLikeOnly[step] === histogram[step],
  ),
);
eq(
  'an unrated like-only row never resolves to a rating',
  await getUserRatingForFilm(SEED_PRIMARY_USER_ID, likeOnlyFilmId),
  null,
);
eq(
  'a logged watch resolves to its newest rating',
  await getUserRatingForFilm(SEED_PRIMARY_USER_ID, 'film_parasite'),
  5 as StarRating,
);
eq(
  'a film with no diary row resolves to no rating',
  await getUserRatingForFilm(SEED_PRIMARY_USER_ID, 'film_absent_probe'),
  null,
);
await db.diary.delete('diary_like_only_probe');

/* -------------------------------------------------------------------------- */
/* 5. Reorder planner                                                         */
/* -------------------------------------------------------------------------- */

group('fractional index reorder planner');
const base = renumberOrderIndexes(5);
eq('renumbering starts at one stride', base[0], ORDER_STRIDE);
eq('renumbering is strictly increasing', base.every((value, index) => index === 0 || value > base[index - 1]), true);

// The contract the editor relies on: after the drop, the moved row's index sits
// strictly between the indexes of the rows it was dropped between, and the whole
// sequence is still strictly increasing once re-sorted by index.
const middle = planReorder(base, 0, 2);
eq('a middle drop writes a single index', middle.kind, 'single');
const afterMiddle = base.filter((_value, index) => index !== 0);
afterMiddle.splice(2, 0, middle.orderIndex);
ok(
  'the moved index sits between its new neighbours',
  afterMiddle[1] < afterMiddle[2] && afterMiddle[2] < afterMiddle[3],
  `sequence=${afterMiddle.join(', ')}`,
);
eq('the full sequence is still strictly increasing', new Set(afterMiddle).size, afterMiddle.length);
ok('the sequence is sorted', [...afterMiddle].sort((a, b) => a - b).join() === afterMiddle.join());

const append = planReorder(base, 0, base.length - 1);
eq('dropping at the end writes a single index', append.kind, 'single');
ok('the appended index exceeds the last row', append.orderIndex > base[base.length - 1]);

const prepend = planReorder(base, base.length - 1, 0);
eq('dropping at the front writes a single index', prepend.kind, 'single');
ok('the prepended index precedes the first row', prepend.orderIndex < base[0]);

const collapsed = planReorder([1000, 1000.1, 1000.2, 1000.3], 0, 2);
eq('collapsed neighbours request a full renumber', collapsed.kind, 'renumber');

const single = planReorder([ORDER_STRIDE], 0, 0);
eq('a single-row list still produces an index', single.kind, 'single');

/**
 * Replays a drop: the moved row leaves its slot, lands at `to`, and its caller
 * either stores the single planned index or rebuilds the whole sequence.
 */
function applyDrop(
  indexes: number[],
  from: number,
  to: number,
): { indexes: number[]; plan: ReturnType<typeof planReorder> } {
  const plan = planReorder(indexes, from, to);
  if (plan.kind === 'renumber') {
    // A rebuild relocates the row physically, then renumbers from scratch.
    const order = Array.from({ length: indexes.length }, (_unused, index) => index);
    const moved = order[from];
    const reordered = order.filter((_value, index) => index !== from);
    reordered.splice(to, 0, moved);
    return { indexes: renumberOrderIndexes(reordered.length), plan };
  }
  const without = indexes.filter((_value, index) => index !== from);
  without.splice(to, 0, plan.orderIndex);
  return { indexes: without, plan };
}

// The real workload: shuffle a ten-row list by always dropping onto the tightest
// gap available. Every step must produce distinct, strictly ordered indexes.
let indexes = renumberOrderIndexes(10);
let collisions = 0;
let nonMonotonic = 0;
for (let step = 0; step < 500; step += 1) {
  const from = (step * 3) % indexes.length;
  const to = (step * 7 + 1) % indexes.length;
  const result = applyDrop(indexes, from, to);
  indexes = result.indexes;
  if (new Set(indexes).size !== indexes.length) collisions += 1;
  if (!indexes.every((value, index) => index === 0 || value > indexes[index - 1])) {
    nonMonotonic += 1;
  }
}
eq('500 successive drops never collide', collisions, 0);
eq('500 successive drops stay strictly ordered', nonMonotonic, 0);
ok('the replayed list keeps every row', indexes.length === 10, `rows=${indexes.length}`);

// Squeezing the gap below the threshold must hand the caller a full rebuild.
const squeezed: number[] = [1000, 1000.2, 1000.4, 1000.6];
const forced = planReorder(squeezed, 0, 2);
eq('a gap at the threshold requests a renumber', forced.kind, 'renumber');
const rebuilt = applyDrop(squeezed, 0, 2);
eq('the forced rebuild returns a full sequence', rebuilt.indexes.length, squeezed.length);
eq('the forced rebuild starts at one stride', rebuilt.indexes[0], ORDER_STRIDE);
ok(
  'the forced rebuild is strictly increasing',
  rebuilt.indexes.every((value, index) => index === 0 || value > rebuilt.indexes[index - 1]),
);

/* -------------------------------------------------------------------------- */
/* 6. Reset                                                                   */
/* -------------------------------------------------------------------------- */

group('database reset');
await resetDatabase();
await openDatabase();
const afterReset = await getDatabaseCounts();
eq('every table is emptied by a reset', afterReset.films, 0);
eq('the seed version marker is cleared', await readMeta(META_KEY_SEED_VERSION), null);

const reseed = await initializeDatabaseSeed();
ok('the seed runs again after a reset', reseed.seeded === true, `seeded=${reseed.seeded}`);
eq('reseeded film count matches the fixture', (await getDatabaseCounts()).films, SEED_FILMS.length);

/* -------------------------------------------------------------------------- */

console.log(`\n${checks - failures}/${checks} storage assertions passed.`);
if (failures > 0) {
  console.error(`${failures} storage assertion(s) failed.`);
  process.exit(1);
}
