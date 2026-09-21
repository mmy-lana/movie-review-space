/**
 * Letterboxd-flavoured date formatting helpers.
 *
 * Every formatter is timezone-safe: `YYYY-MM-DD` calendar strings are parsed as
 * local calendar dates (never as UTC instants) so a diary entry logged on the
 * 1st of a month can never render as the last day of the previous month.
 */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const DAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

/** Parses `YYYY-MM-DD` (or an ISO timestamp / Date) into local calendar parts. */
export function parseCalendarDate(value: string | Date): CalendarParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Zero-padded `YYYY-MM-DD` for a date (defaults to today, local time). */
export function toIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `2026-03-04` → `4 Mar 2026`. */
export function formatIsoDate(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return 'Unknown date';
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** `2026-03-04` → `4 March 2026`. */
export function formatLongDate(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return 'Unknown date';
  return `${parts.day} ${MONTHS_LONG[parts.month - 1]} ${parts.year}`;
}

/** `2026-03-04` → `4` — the diary month/day column day cell. */
export function formatDayOfMonth(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  return parts ? String(parts.day) : '—';
}

/** `2026-03-04` → `Mar` — the diary month/day column month cell. */
export function formatMonthShort(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  return parts ? MONTHS_SHORT[parts.month - 1] : '—';
}

/** `2026-03-04` → `Wednesday`. */
export function formatWeekday(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return '';
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return DAYS_LONG[date.getDay()]!;
}

/**
 * Letterboxd-style diary stamp.
 *
 * - `formatDiaryDate('2026-03-04')` → `Wed 4 Mar 2026`
 * - `formatDiaryDate('2026-03-04', { relativeToYear: 2026 })` → `Wed 4 Mar`
 */
export function formatDiaryDate(
  value: string | null | undefined,
  options: { relativeToYear?: number; withWeekday?: boolean; long?: boolean } = {},
): string {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return 'Unknown date';

  const { relativeToYear, withWeekday = true, long = false } = options;
  const monthName = long ? MONTHS_LONG[parts.month - 1] : MONTHS_SHORT[parts.month - 1];
  const segments: string[] = [];

  if (withWeekday) {
    const weekday = new Date(parts.year, parts.month - 1, parts.day).getDay();
    segments.push(DAYS_SHORT[weekday]!);
  }
  segments.push(String(parts.day), monthName);
  if (relativeToYear === undefined || relativeToYear !== parts.year) {
    segments.push(String(parts.year));
  }
  return segments.join(' ');
}

/** `March 2026` — diary month group header. */
export function formatMonthYear(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return 'Undated';
  return `${MONTHS_LONG[parts.month - 1]} ${parts.year}`;
}

/** Stable `2026-03` bucket key used to group diary rows by month. */
export function monthKey(value: string | null | undefined): string {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return 'undated';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

/** Whole years elapsed between a date and `now` (used for "member since"). */
export function yearsSince(
  value: string | null | undefined,
  now: Date = new Date(),
): number {
  const parts = value ? parseCalendarDate(value) : null;
  if (!parts) return 0;
  let years = now.getFullYear() - parts.year;
  const anniversaryPassed =
    now.getMonth() + 1 > parts.month ||
    (now.getMonth() + 1 === parts.month && now.getDate() >= parts.day);
  if (!anniversaryPassed) years -= 1;
  return Math.max(0, years);
}

/** `142` minutes → `2h 22m`; `45` → `45m`. */
export function formatRuntime(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '—';
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

/** Cumulative watch time copy, e.g. `112d 16h`. */
export function formatWatchTime(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return '0h';
  }
  const whole = Math.round(totalMinutes);
  const days = Math.floor(whole / 1440);
  const hours = Math.floor((whole % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  const minutes = whole % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** `1248` → `1,248` — locale-stable grouping with no Intl server/client drift. */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Compact large counts: `78000` → `78K`, `1240000` → `1.2M`. */
export function formatCompactCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}K`;
  if (abs >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return formatCount(value);
}

/**
 * Relative activity stamp: `just now`, `12m`, `5h`, `3d`, then a calendar date
 * once the event is older than a month.
 */
export function formatRelativeActivity(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return 'Unknown time';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Unknown time';

  const delta = now.getTime() - timestamp.getTime();
  if (delta < MS_PER_MINUTE) return 'just now';
  if (delta < MS_PER_HOUR) return `${Math.floor(delta / MS_PER_MINUTE)}m`;
  if (delta < MS_PER_DAY) return `${Math.floor(delta / MS_PER_HOUR)}h`;
  if (delta < 30 * MS_PER_DAY) return `${Math.floor(delta / MS_PER_DAY)}d`;
  if (delta < 365 * MS_PER_DAY) return formatIsoDate(toIsoDate(timestamp));
  return `${yearsSince(toIsoDate(timestamp), now)}y ago`;
}

/** Full human timestamp used for `title` / `dateTime` accessibility attributes. */
export function formatAccessibleTimestamp(value: string | null | undefined): string {
  if (!value) return 'Unknown time';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Unknown time';
  const month = MONTHS_LONG[timestamp.getMonth()];
  const hours = String(timestamp.getHours()).padStart(2, '0');
  const minutes = String(timestamp.getMinutes()).padStart(2, '0');
  return `${timestamp.getDate()} ${month} ${timestamp.getFullYear()} at ${hours}:${minutes}`;
}

/** The decade start year for a release year: `1994` → `1990`. */
export function toDecade(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** `2020` → `2020s`. */
export function formatDecade(decadeStartYear: number): string {
  return `${decadeStartYear}s`;
}

/** Local midnight for a `YYYY-MM-DD` value or Date. */
export function startOfDay(value: string | Date): Date {
  if (typeof value === 'string') {
    const parts = parseCalendarDate(value);
    if (parts) return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
    const fallback = new Date(value);
    return new Date(
      fallback.getFullYear(),
      fallback.getMonth(),
      fallback.getDate(),
      0, 0, 0, 0,
    );
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

/**
 * Human "x years ago" style watch-context copy used on review cards.
 * Falls back to an absolute date when the delta is under a year.
 */
export function formatWatchedContext(
  watchedDate: string | null | undefined,
  now: Date = new Date(),
): string {
  const parts = watchedDate ? parseCalendarDate(watchedDate) : null;
  if (!parts) return 'Watch date unknown';
  const years = yearsSince(watchedDate, now);
  if (years >= 1) return `Watched ${years} ${years === 1 ? 'year' : 'years'} ago`;
  return `Watched ${formatIsoDate(watchedDate)}`;
}
