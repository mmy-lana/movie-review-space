/**
 * Phase 1 verification harness — pure-logic and fixture integrity checks.
 *
 * Runs under Node's native type stripping with a resolver hook that mirrors the
 * `@/*` → `src/*` tsconfig alias, so the harness exercises the real production
 * modules rather than copies:
 *
 *   pnpm run verify
 */

import assert from 'node:assert/strict';

const {
  calculateStarFromPointer,
  computeCommunityRating,
  formatRatingDisplay,
  getHistogramPercentages,
  histogramTotal,
  normalizeRating,
  positiveRatingShare,
  stepRating,
  toDenseHistogram,
} = await import('../src/lib/utils/rating-math.ts');
const { renderMarkdown, sanitizeUrl, toPlainTextPreview } = await import(
  '../src/lib/utils/markdown-sanitizer.ts'
);
const { SEED_ACTIVITY, SEED_DIARY, SEED_FILMS, SEED_LISTS, SEED_PROFILES, SEED_REVIEWS } =
  await import('../src/lib/db/seed.ts');
const {
  formatDiaryDate,
  formatRelativeActivity,
  formatRuntime,
  formatWatchTime,
  toDecade,
} = await import('../src/lib/utils/date-format.ts');

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ok  ${label}`);
}

/* ------------------------------- rating math ------------------------------ */
console.log('\nrating-math');

check('normalizeRating clamps and quantises', () => {
  assert.equal(normalizeRating(0), 0);
  assert.equal(normalizeRating(-3), 0);
  assert.equal(normalizeRating(0.2), 0.5);
  assert.equal(normalizeRating(3.26), 3.5);
  assert.equal(normalizeRating(3.24), 3);
  assert.equal(normalizeRating(9), 5);
});

check('stepRating walks the half-star ladder', () => {
  assert.equal(stepRating(3, 1), 3.5);
  assert.equal(stepRating(3, -1), 2.5);
  assert.equal(stepRating(5, 1), 5, 'clamps at the ceiling');
  assert.equal(stepRating(0.5, -1), 0.5, 'default floor holds at the minimum');
  assert.equal(stepRating(0.5, -1, 0), 0, 'min:0 allows clearing to unrated');
  assert.equal(stepRating(0, -1, 0), 0, 'unrated stays unrated');
  assert.equal(stepRating(0, 1), 0.5, 'incrementing from unrated sets half a star');
  assert.equal(stepRating(3, 0), 3, 'zero steps is a no-op');
  // Full keyboard sweep: ArrowLeft from any rating always lands on the ladder.
  for (let start = 0.5; start <= 5; start += 0.5) {
    for (let step = -12; step <= 12; step += 1) {
      const value = stepRating(start as never, step);
      assert.ok(value >= 0.5 && value <= 5, `${start} ${step} → ${value}`);
      assert.ok(Number.isInteger(value * 2), `${start} ${step} → ${value} off-ladder`);
    }
  }
});

check('calculateStarFromPointer maps 20 segments across the track', () => {
  const rect = { left: 100, width: 200 } as DOMRect;
  assert.equal(calculateStarFromPointer(100, rect), 0.5, 'left edge');
  assert.equal(calculateStarFromPointer(60, rect), 0.5, 'left overflow clamps');
  assert.equal(calculateStarFromPointer(400, rect), 5, 'right edge');
  assert.equal(calculateStarFromPointer(900, rect), 5, 'right overflow clamps');
  assert.equal(calculateStarFromPointer(145, rect), 1.5, 'quarter point');
  assert.equal(calculateStarFromPointer(200, rect), 2.5, 'midpoint');
  assert.equal(calculateStarFromPointer(300, rect), 5, 'far right');
  assert.equal(
    calculateStarFromPointer(150, { left: 0, width: 0 } as DOMRect),
    0.5,
    'degenerate rect is safe',
  );
  // The result must always be a legal StarRating member, never the 0 sentinel.
  for (let x = 0; x <= 320; x += 1) {
    const value = calculateStarFromPointer(x, rect);
    assert.ok(value >= 0.5 && value <= 5 && Number.isInteger(value * 2), `x=${x} → ${value}`);
  }
});

check('formatRatingDisplay drops trailing .0', () => {
  assert.equal(formatRatingDisplay(4), '4');
  assert.equal(formatRatingDisplay(4.0), '4');
  assert.equal(formatRatingDisplay(4.5), '4.5');
  assert.equal(formatRatingDisplay(0), '0');
  assert.equal(formatRatingDisplay(null), '—');
  assert.equal(formatRatingDisplay(Number.NaN), '—');
});

check('histogram helpers normalise sparse input', () => {
  const dense = toDenseHistogram({ 5.0: 3, 0.5: 1 });
  assert.equal(Object.keys(dense).length, 10);
  assert.equal(histogramTotal(dense), 4);
  assert.equal(computeCommunityRating(dense), 3.88);
  assert.equal(computeCommunityRating({}), 0);
});

check('getHistogramPercentages scales against the tallest bar', () => {
  const bars = getHistogramPercentages({ 3.0: 10, 5.0: 5 }, 5.0);
  assert.equal(bars.length, 10);
  const top = bars.find((bar) => bar.rating === 3.0)!;
  const half = bars.find((bar) => bar.rating === 5.0)!;
  const empty = bars.find((bar) => bar.rating === 0.5)!;
  assert.equal(top.heightPercentage, 100);
  assert.equal(half.heightPercentage, 50);
  assert.equal(empty.heightPercentage, 4, '4% floor keeps empty bars visible');
  assert.equal(top.sharePercentage, 66.7);
  assert.equal(half.isUserRating, true);
  assert.equal(positiveRatingShare({ 1.0: 1, 4.0: 1 }), 50);
});

/* --------------------------------- sanitizer ------------------------------ */
console.log('\nmarkdown-sanitizer');

check('sanitizeUrl blocks dangerous protocols', () => {
  assert.equal(sanitizeUrl('https://letterboxd.com'), 'https://letterboxd.com');
  assert.equal(sanitizeUrl('/films/parasite-2019'), '/films/parasite-2019');
  assert.equal(sanitizeUrl('mailto:hi@cineslate.app'), 'mailto:hi@cineslate.app');
  assert.equal(sanitizeUrl('javascript:alert(1)'), '#');
  assert.equal(sanitizeUrl('JaVaScRiPt:alert(1)'), '#');
  assert.equal(sanitizeUrl('java\u0000script:alert(1)'), '#');
  assert.equal(sanitizeUrl('data:text/html;base64,PHNjcmlwdD4='), '#');
  assert.equal(sanitizeUrl('//evil.example.com'), '#');
  assert.equal(sanitizeUrl('   '), '#');
});

function flatten(nodes: unknown): string {
  if (typeof nodes === 'string') return nodes;
  if (Array.isArray(nodes)) return nodes.map(flatten).join('');
  if (nodes && typeof nodes === 'object' && 'props' in (nodes as Record<string, unknown>)) {
    const element = nodes as { props: { children?: unknown } };
    return flatten(element.props.children ?? '');
  }
  return '';
}

function collectHrefs(nodes: unknown, out: string[] = []): string[] {
  if (Array.isArray(nodes)) {
    for (const node of nodes) collectHrefs(node, out);
    return out;
  }
  if (nodes && typeof nodes === 'object' && 'props' in (nodes as Record<string, unknown>)) {
    const element = nodes as { props: { children?: unknown; href?: unknown } };
    if (typeof element.props.href === 'string') out.push(element.props.href);
    collectHrefs(element.props.children ?? '', out);
  }
  return out;
}

check('raw HTML is neutralised, never executed', () => {
  const rendered = renderMarkdown('<script>alert(1)</script> and <img src=x onerror=alert(1)>');
  const text = flatten(rendered);
  assert.ok(text.includes('<script>alert(1)</script>'), 'script tag survives as inert text');
  assert.equal(collectHrefs(rendered).length, 0);
});

check('javascript: links collapse to #', () => {
  const rendered = renderMarkdown('[click me](javascript:alert(1))');
  assert.deepEqual(collectHrefs(rendered), ['#']);
});

function collectTags(nodes: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(nodes)) {
    for (const node of nodes) collectTags(node, out);
    return out;
  }
  if (nodes && typeof nodes === 'object' && 'props' in (nodes as Record<string, unknown>)) {
    const element = nodes as { type: unknown; props: Record<string, unknown> };
    out.push({ type: element.type, ...element.props });
    collectTags(element.props.children ?? '', out);
  }
  return out;
}

check('safe links keep target and rel hardening', () => {
  const rendered = renderMarkdown('[Letterboxd](https://letterboxd.com)');
  const anchors = collectTags(rendered).filter((node) => node.type === 'a');
  assert.equal(anchors.length, 1, 'exactly one anchor');
  assert.equal(anchors[0]!.href, 'https://letterboxd.com');
  assert.equal(anchors[0]!.target, '_blank');
  assert.equal(anchors[0]!.rel, 'noopener noreferrer nofollow');
});

check('autolinks bare urls and preserves trailing punctuation', () => {
  const rendered = renderMarkdown('Read more at https://letterboxd.com/journal, seriously.');
  const anchors = collectTags(rendered).filter((node) => node.type === 'a');
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0]!.href, 'https://letterboxd.com/journal');
  assert.equal(anchors[0]!.children, 'https://letterboxd.com/journal');
  assert.equal(flatten(rendered), 'Read more at https://letterboxd.com/journal, seriously.');
});

check('internal links stay in the same tab', () => {
  const rendered = renderMarkdown('[Parasite](/films/parasite-2019)');
  const anchors = collectTags(rendered).filter((node) => node.type === 'a');
  assert.equal(anchors[0]!.href, '/films/parasite-2019');
  assert.equal(anchors[0]!.target, undefined);
});

check('headings, lists and emphasis compile', () => {
  const rendered = renderMarkdown('## Title\n\n- one\n- two\n\n**bold** and *italic* and ~~struck~~');
  const tags = rendered.map((node: unknown) => (node as { type: string }).type);
  assert.deepEqual(tags, ['h2', 'ul', 'p']);
  assert.ok(flatten(rendered).includes('Title'));
});

check('review bodies render without throwing', () => {
  for (const review of SEED_REVIEWS) {
    const nodes = renderMarkdown(review.reviewBody);
    assert.ok(nodes.length > 0, `${review.id} produced output`);
    for (const href of collectHrefs(nodes)) {
      assert.ok(href === '#' || /^(https?:|mailto:|\/|#)/.test(href), `${review.id} href ${href}`);
    }
  }
});

check('toPlainTextPreview strips syntax', () => {
  const preview = toPlainTextPreview('## Head\n\n**bold** [link](https://x.com) `code`', 60);
  assert.ok(!preview.includes('#'));
  assert.ok(!preview.includes('**'));
  assert.ok(preview.includes('bold'));
  assert.ok(preview.includes('link'));
  assert.ok(toPlainTextPreview(null) === '');
});

/* -------------------------------- date utils ------------------------------ */
console.log('\ndate-format');

check('diary dates are timezone safe', () => {
  assert.equal(formatDiaryDate('2026-03-01'), 'Sun 1 Mar 2026');
  assert.equal(formatDiaryDate('2026-03-01', { relativeToYear: 2026 }), 'Sun 1 Mar');
  assert.equal(formatDiaryDate('not-a-date'), 'Unknown date');
});

check('relative activity buckets', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');
  assert.equal(formatRelativeActivity('2026-09-21T11:59:40.000Z', now), 'just now');
  assert.equal(formatRelativeActivity('2026-09-21T11:30:00.000Z', now), '30m');
  assert.equal(formatRelativeActivity('2026-09-21T06:00:00.000Z', now), '6h');
  assert.equal(formatRelativeActivity('2026-09-18T12:00:00.000Z', now), '3d');
  assert.equal(formatRelativeActivity(null, now), 'Unknown time');
});

check('runtime and watch-time copy', () => {
  assert.equal(formatRuntime(132), '2h 12m');
  assert.equal(formatRuntime(120), '2h');
  assert.equal(formatRuntime(45), '45m');
  assert.equal(formatRuntime(0), '—');
  assert.equal(formatWatchTime(162240), '112d 16h');
  assert.equal(formatWatchTime(0), '0h');
});

check('decades bucket correctly', () => {
  assert.equal(toDecade(1994), 1990);
  assert.equal(toDecade(2020), 2020);
});

/* ------------------------------ seed integrity ---------------------------- */
console.log('\nseed dataset');

check('twelve films are present', () => {
  assert.equal(SEED_FILMS.length, 12);
  const ids = new Set(SEED_FILMS.map((film) => film.id));
  const slugs = new Set(SEED_FILMS.map((film) => film.slug));
  assert.equal(ids.size, 12, 'ids unique');
  assert.equal(slugs.size, 12, 'slugs unique');
});

check('every community rating matches its histogram', () => {
  for (const film of SEED_FILMS) {
    const recomputed = computeCommunityRating(film.metrics.histogram);
    assert.equal(
      film.metrics.communityRating,
      recomputed,
      `${film.title}: stored ${film.metrics.communityRating} vs computed ${recomputed}`,
    );
    assert.equal(film.metrics.ratingCount, histogramTotal(film.metrics.histogram));
    assert.ok(film.metrics.communityRating >= 0 && film.metrics.communityRating <= 5);
    assert.equal(toDenseHistogram(film.metrics.histogram)[5.0] > 0, true);
  }
});

check('film payloads are complete', () => {
  for (const film of SEED_FILMS) {
    assert.ok(film.title.length > 0 && film.synopsis.length > 40 && film.tagline.length > 0);
    assert.ok(film.posterUrl.startsWith('https://image.tmdb.org/'), film.title);
    assert.ok(film.backdropUrl.startsWith('https://image.tmdb.org/'), film.title);
    assert.ok(film.genres.length >= 1);
    assert.ok(film.directors.length >= 1 && film.directors[0]!.role === 'Director');
    assert.ok(film.cast.length >= 2);
    assert.ok(film.cast.every((member, index) => member.order === index + 1));
    assert.ok(film.runtimeMinutes > 40 && film.runtimeMinutes < 300);
    assert.match(film.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(film.releaseDate.slice(0, 4), String(film.releaseYear));
  }
});

check('profiles, favourite four and referential integrity', () => {
  assert.equal(SEED_PROFILES.length, 5);
  const usernames = new Set(SEED_PROFILES.map((profile) => profile.username));
  assert.equal(usernames.size, 5);
  const filmIds = new Set(SEED_FILMS.map((film) => film.id));
  for (const profile of SEED_PROFILES) {
    assert.equal(profile.favoriteFilmIds.length, 4);
    for (const id of profile.favoriteFilmIds) {
      if (id !== null) assert.ok(filmIds.has(id), `${profile.username} favourite ${id}`);
    }
  }
  const withEmptySlot = SEED_PROFILES.filter((profile) =>
    profile.favoriteFilmIds.some((id) => id === null),
  );
  assert.ok(withEmptySlot.length > 0, 'empty favourite slots are exercised');
});

check('reviews and diary entries reference real rows', () => {
  const filmIds = new Set(SEED_FILMS.map((film) => film.id));
  const profileIds = new Set(SEED_PROFILES.map((profile) => profile.id));
  const reviewIds = new Set(SEED_REVIEWS.map((review) => review.id));
  assert.equal(reviewIds.size, SEED_REVIEWS.length);

  for (const review of SEED_REVIEWS) {
    assert.ok(filmIds.has(review.filmId), review.id);
    assert.ok(profileIds.has(review.userId), review.id);
    assert.ok(review.reviewBody.trim().length > 40, review.id);
    assert.match(review.watchedDate, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const entry of SEED_DIARY) {
    assert.ok(filmIds.has(entry.filmId), entry.id);
    assert.ok(profileIds.has(entry.userId), entry.id);
    if (entry.reviewId !== undefined) {
      assert.ok(reviewIds.has(entry.reviewId), `${entry.id} → ${entry.reviewId}`);
      const review = SEED_REVIEWS.find((candidate) => candidate.id === entry.reviewId)!;
      assert.equal(review.userId, entry.userId, 'review author matches diary owner');
      assert.equal(review.filmId, entry.filmId, 'review film matches diary film');
    }
  }
  assert.equal(new Set(SEED_DIARY.map((entry) => entry.id)).size, SEED_DIARY.length);
});

check('viewer diary is chronologically ordered', () => {
  const viewerDiary = SEED_DIARY.filter((entry) => entry.userId === 'user_001');
  assert.ok(viewerDiary.length >= 12);
  const sorted = [...viewerDiary].sort((a, b) => a.watchedDate.localeCompare(b.watchedDate));
  assert.deepEqual(viewerDiary.map((entry) => entry.id), sorted.map((entry) => entry.id));
});

check('lists carry fractional indexes and hydrated-safe items', () => {
  const filmIds = new Set(SEED_FILMS.map((film) => film.id));
  assert.equal(SEED_LISTS.length, 5);
  for (const list of SEED_LISTS) {
    assert.equal(list.items.length, list.itemCount);
    assert.ok(list.items.length >= 4);
    const indexes = list.items.map((item) => item.orderIndex);
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), `${list.id} ordering`);
    assert.equal(new Set(indexes).size, indexes.length);
    for (const item of list.items) {
      assert.ok(filmIds.has(item.filmId), `${item.id} → ${item.filmId}`);
      assert.equal(item.listId, list.id);
    }
  }
  assert.ok(SEED_LISTS.some((list) => list.isRanked));
  assert.ok(SEED_LISTS.some((list) => !list.isRanked));
  assert.ok(SEED_LISTS.some((list) => list.isPrivate));
});

check('activity events are ordered and internally consistent', () => {
  const profileIds = new Set(SEED_PROFILES.map((profile) => profile.id));
  const timestamps = SEED_ACTIVITY.map((event) => event.createdAt);
  assert.deepEqual(timestamps, [...timestamps].sort((a, b) => b.localeCompare(a)));
  assert.equal(new Set(SEED_ACTIVITY.map((event) => event.id)).size, SEED_ACTIVITY.length);

  for (const event of SEED_ACTIVITY) {
    assert.ok(profileIds.has(event.userId), event.id);
    assert.equal(event.user.id, event.userId, 'embedded profile matches userId');
    assert.ok(!Number.isNaN(Date.parse(event.createdAt)), event.id);
    if (event.type === 'LOG_FILM' || event.type === 'REVIEW_FILM') {
      assert.ok(event.metadata.filmTitle, `${event.id} needs a film title`);
      assert.ok(event.filmSlug, `${event.id} needs a film slug`);
    }
    if (event.type === 'REVIEW_FILM') {
      assert.ok((event.metadata.reviewSnippet ?? '').length > 0, `${event.id} snippet`);
    }
    if (event.type === 'CREATE_LIST') {
      assert.ok(event.metadata.listTitle, event.id);
    }
  }
  assert.ok(
    SEED_ACTIVITY.some((event) => Date.parse(event.createdAt) > Date.parse('2026-09-01')),
    'stream includes recent events',
  );
});

console.log(`\n${checks} verification groups passed.\n`);
