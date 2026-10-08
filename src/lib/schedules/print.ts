import { MONTH_NAMES, dayNumber } from "./rotation";

/**
 * Months as the printed duty calendar and the egg log name them: "2026-11"
 * (YYYY-MM). Printing offers the twelve months from the current one (in
 * Vermont), with the next three after it chosen to start with; the print
 * page takes up to twelve in its address (`?months=2026-11,2026-12`).
 */

export const MAX_PRINT_MONTHS = 12;

/** Whether a value is a month like "2026-11". */
export const isMonth = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** The month a date ("2026-11-05") falls in: "2026-11". */
export const monthOf = (date: string) => date.slice(0, 7);

/** The month `delta` months after (or before) `month`. */
export function addMonths(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** How many days a month has. */
export function daysInMonth(month: string) {
  return dayNumber(`${addMonths(month, 1)}-01`) - dayNumber(`${month}-01`);
}

/** "November 2026", or "Nov 2026" when short. */
export function monthLabel(month: string, short = false) {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  return `${short ? name.slice(0, 3) : name} ${month.slice(0, 4)}`;
}

/** The `count` months starting with the one `today` is in. */
export function upcomingMonths(today: string, count = MAX_PRINT_MONTHS) {
  return Array.from({ length: count }, (_, index) => addMonths(monthOf(today), index));
}

/** What printing starts with chosen: the three months after the current one. */
export function defaultPrintMonths(today: string) {
  return [1, 2, 3].map((delta) => addMonths(monthOf(today), delta));
}

/**
 * The months asked for in the print page's address, in order and without
 * repeats — the default three when none are given. Anything that isn't a
 * month, or more than twelve, is an error to show.
 */
export function parsePrintMonths(
  param: string | null | undefined,
  today: string
): { months: string[] } | { error: string } {
  const values = (param ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.length) return { months: defaultPrintMonths(today) };
  const wrong = values.find((value): boolean => !isMonth(value));
  if (wrong) return { error: `“${wrong.slice(0, 20)}” isn't a month — use one like 2026-11.` };
  const months = Array.from(new Set(values)).sort();
  if (months.length > MAX_PRINT_MONTHS)
    return { error: `Print up to ${MAX_PRINT_MONTHS} months at a time.` };
  return { months };
}
