import { isIsoDate } from "./rotation";
import { addMonths, daysInMonth, isMonth, monthOf } from "./print";

/**
 * A schedule's daily count — the eggs the Chicken Tenders collect — as the
 * browser and the server share it: what's kept for each day, how counts sent
 * in are merged, the summary and CSV made from them, and the checks on what
 * the photo reader says it read. Types and pure helpers only; storage is in
 * `egg-store.ts`, the photo reading in `egg-reader.ts`.
 *
 * A count is a whole number from 0 to 500. Nothing is recorded for a day that
 * hasn't come yet (in Vermont). The log keeps the newest 4000 days, and the
 * last 100 photos of the printed calendar.
 */

export const MAX_COUNT = 500;
export const MAX_EGG_DAYS = 4000;
export const MAX_EGG_PHOTOS = 100;
/** The earliest day a count can be recorded for. */
export const FIRST_COUNT_DAY = "2000-01-01";

/** Who recorded something: their directory entry (when they have one) and name. */
export interface EggRecorder {
  personId: string | null;
  name: string;
}

export interface EggDay {
  count: number;
  by: EggRecorder;
  at: string;
  /** Read from a photo of the printed calendar (and checked), or typed in. */
  via: "photo" | "typed";
  /** The photo it was read from, while that photo is kept. */
  photoId?: string;
}

/** A photo of the printed calendar, as sent to be read. */
export interface EggPhoto {
  id: string;
  /** The month the page was read as, if it could be. */
  month: string | null;
  at: string;
  by: EggRecorder;
}

export interface EggLog {
  /** By date, YYYY-MM-DD. */
  days: Record<string, EggDay>;
  /** Newest first. */
  photos: EggPhoto[];
}

/** What `GET /api/circles/<id>/eggs` answers. */
export interface EggLogResponse extends EggLog {
  /** What's counted ("Eggs"). */
  label: string;
  canRecord: boolean;
  /** Whether photos of the calendar can be read (`OPENAI_KEY` is set). */
  readerReady: boolean;
}

export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;

/** A stored log as the app uses it, whatever was stored. */
export function normalizeEggLog(raw: unknown): EggLog {
  const doc = raw as Partial<EggLog> | null;
  const days: Record<string, EggDay> = {};
  for (const [date, day] of Object.entries(doc?.days ?? {})) {
    if (isIsoDate(date) && isCount(day?.count)) days[date] = day;
  }
  return { days, photos: Array.isArray(doc?.photos) ? doc!.photos : [] };
}

/** Why counts weren't recorded. */
export type CountFailure = "future" | "too_old";

/**
 * The log with `counts` merged in: a number records that day's count, null
 * clears it. A day whose count doesn't change keeps who recorded it and
 * when. `changed` lists the days that changed (none means there's nothing to
 * write). A photo is named only while the log still has it.
 */
export function mergeCounts(
  log: EggLog,
  counts: Record<string, number | null>,
  change: { by: EggRecorder; at: string; today: string; photoId?: string | null }
): { log: EggLog; changed: string[] } | CountFailure {
  const dates = Object.keys(counts);
  if (dates.some((date) => date > change.today)) return "future";
  if (dates.some((date) => date < FIRST_COUNT_DAY)) return "too_old";
  const photoId =
    change.photoId && log.photos.some((photo) => photo.id === change.photoId)
      ? change.photoId
      : null;
  const days = { ...log.days };
  const changed: string[] = [];
  for (const date of dates.sort()) {
    const count = counts[date];
    if (count === null) {
      if (days[date]) {
        delete days[date];
        changed.push(date);
      }
      continue;
    }
    if (days[date]?.count === count) continue;
    days[date] = {
      count,
      by: { personId: change.by.personId, name: change.by.name },
      at: change.at,
      via: change.photoId ? "photo" : "typed",
      ...(photoId ? { photoId } : {}),
    };
    changed.push(date);
  }
  return { log: { ...log, days: trimDays(days) }, changed };
}

/** The newest `max` days. */
export function trimDays<T>(days: Record<string, T>, max = MAX_EGG_DAYS): Record<string, T> {
  const dates = Object.keys(days);
  if (dates.length <= max) return days;
  const kept = dates.sort().slice(-max);
  return Object.fromEntries(kept.map((date) => [date, days[date]]));
}

/** The log with a new photo first, and the ids of the photos that no longer fit. */
export function addPhoto(log: EggLog, photo: EggPhoto): { log: EggLog; dropped: string[] } {
  const photos = [photo, ...log.photos.filter((entry) => entry.id !== photo.id)];
  return {
    log: { ...log, photos: photos.slice(0, MAX_EGG_PHOTOS) },
    dropped: photos.slice(MAX_EGG_PHOTOS).map((entry) => entry.id),
  };
}

// --- The CSV download ----------------------------------------------------------------------------

/**
 * One CSV field: quoted when it holds a comma, quote, or line break (quotes
 * doubled), and kept from being read as a formula by a spreadsheet.
 */
export function csvField(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Every day's count, oldest first: `date,count,recorded by`. */
export function eggsCsv(days: Record<string, EggDay>) {
  const rows = Object.keys(days)
    .sort()
    .map((date) => [date, days[date].count, days[date].by.name].map(csvField).join(","));
  return ["date,count,recorded by", ...rows].join("\r\n") + "\r\n";
}

// --- The summary on the circle's page ------------------------------------------------------------

export interface MonthTotal {
  month: string;
  total: number;
  /** How many of its days have a count. */
  counted: number;
}

/** Each month's total and how many days were counted. */
export function monthTotals(days: Record<string, Pick<EggDay, "count">>, months: string[]) {
  const totals = new Map<string, MonthTotal>(
    months.map((month) => [month, { month, total: 0, counted: 0 }])
  );
  for (const [date, day] of Object.entries(days)) {
    const entry = totals.get(monthOf(date));
    if (!entry) continue;
    entry.total += day.count;
    entry.counted += 1;
  }
  return months.map((month) => totals.get(month)!);
}

/**
 * This month so far (with the average a day, over the days counted), last
 * month, and the twelve months ending with this one, oldest first.
 */
export function eggSummary(days: Record<string, Pick<EggDay, "count">>, today: string) {
  const thisMonth = monthOf(today);
  const year = monthTotals(
    days,
    Array.from({ length: 12 }, (_, index) => addMonths(thisMonth, index - 11))
  );
  const current = year[11];
  return {
    thisMonth: {
      ...current,
      average: current.counted ? Math.round((current.total / current.counted) * 10) / 10 : null,
    },
    lastMonth: year[10],
    year,
  };
}

// --- What the photo reader read ------------------------------------------------------------------

/** One day as read from a photo: its count (null for an empty box) and whether it was hard to read. */
export interface ReadDay {
  date: string;
  count: number | null;
  unsure: boolean;
}

/** What `POST /api/circles/<id>/eggs/read` answers. */
export interface EggReading {
  photoId: string;
  /** The month printed on the page, if it could be read. */
  month: string | null;
  days: ReadDay[];
  /** Anything the reader wants the person checking to know. */
  note: string | null;
}

/**
 * What the reader said, checked: the month only if it is one; each day only
 * once, inside that month (or the month expected, when the page's couldn't be
 * read), not after today, with a whole count from 0 to 500 or none. Anything
 * else is dropped.
 */
export function validateReading(
  raw: unknown,
  { expected, today }: { expected: string; today: string }
): Omit<EggReading, "photoId"> {
  const reading = (raw ?? {}) as { month?: unknown; days?: unknown; note?: unknown };
  const month = isMonth(reading.month) ? reading.month : null;
  const target = month ?? expected;
  const length = daysInMonth(target);
  const seen = new Set<number>();
  const days: ReadDay[] = [];
  for (const entry of Array.isArray(reading.days) ? reading.days : []) {
    const { day, count, unsure } = (entry ?? {}) as {
      day?: unknown;
      count?: unknown;
      unsure?: unknown;
    };
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > length) continue;
    if (count !== null && !isCount(count)) continue;
    const date = `${target}-${String(day).padStart(2, "0")}`;
    if (date > today || seen.has(day)) continue;
    seen.add(day);
    days.push({ date, count, unsure: unsure === true });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const note = typeof reading.note === "string" ? reading.note.trim().slice(0, 300) : "";
  return { month, days, note: note || null };
}
