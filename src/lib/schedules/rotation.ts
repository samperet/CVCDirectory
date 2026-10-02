import { TIME_ZONE, todayInVermont } from "@/lib/time";

/**
 * Duty rotations for circles (e.g. the Chicken Tenders' daily chicken and
 * compost duty). A schedule assigns each weekday to one household, or to
 * several that take turns week by week, and continues indefinitely. One-off
 * changes — swaps, cover while someone is away — are recorded per date.
 *
 * Dates are plain calendar dates ("2026-09-01"); day arithmetic is done in UTC
 * so time zones and daylight-saving changes never shift a date. "Today" is
 * taken in Eastern time, where the community is.
 */

export const SCHEDULE_TIME_ZONE = TIME_ZONE;
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface HouseholdMember {
  name: string;
  /** The member's directory entry, when they have one (for their phone number). */
  personId?: string | null;
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
}

export interface DutyOverride {
  /** Who's on duty instead; null means the day needs someone to cover it. */
  householdId: string | null;
  note?: string | null;
  updatedBy?: string;
  updatedAt?: string;
}

export interface DutyInstructions {
  title: string;
  body: string;
  /** Months (1–12) these duties apply in, e.g. summer vs. winter; empty means year-round. */
  months?: number[];
}

export interface DutySchedule {
  title: string;
  /** The first day of the schedule; nothing is shown as due before it. */
  startsOn: string;
  /** A date in the week when every weekday's rotation is on its first household. */
  anchor: string;
  households: Household[];
  /** Index 0 = Sunday … 6 = Saturday: the households that take that weekday in turn, one per week. */
  weekdays: string[][];
  overrides: Record<string, DutyOverride>;
  instructions: DutyInstructions[];
  updatedAt?: string;
}

export interface Duty {
  date: string;
  householdId: string | null;
  /** Who the rotation alone would put on duty. */
  regularId: string | null;
  override?: DutyOverride;
}

export const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Days since 1970-01-01. */
export function dayNumber(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(days: number) {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

export const addDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export function weekdayOf(date: string) {
  return (((dayNumber(date) + 4) % 7) + 7) % 7;
}

/** Today, as the schedule counts it (YYYY-MM-DD in Vermont). */
export const todayIso = () => todayInVermont();

/** Who the weekly rotation puts on duty, ignoring one-off changes. */
export function regularDuty(
  schedule: Pick<DutySchedule, "anchor" | "weekdays">,
  date: string
): string | null {
  const turn = schedule.weekdays[weekdayOf(date)] ?? [];
  if (!turn.length) return null;
  const anchorWeek = dayNumber(schedule.anchor) - weekdayOf(schedule.anchor); // the Sunday starting the anchor week
  const weeks = Math.floor((dayNumber(date) - anchorWeek) / 7);
  return turn[((weeks % turn.length) + turn.length) % turn.length];
}

export function dutyFor(schedule: DutySchedule, date: string): Duty {
  const regularId = regularDuty(schedule, date);
  const override = schedule.overrides[date];
  return override
    ? { date, householdId: override.householdId, regularId, override }
    : { date, householdId: regularId, regularId };
}

/** The dates of a month's calendar grid: whole weeks, Sunday first. */
export function monthGrid(year: number, month: number) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = addDays(first, -weekdayOf(first));
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const days = dayNumber(nextMonth) - dayNumber(start);
  const weeks = Math.ceil(days / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index));
}

/** A household's next turns on duty from a date onward (within a year). */
export function upcomingTurns(
  schedule: DutySchedule,
  householdId: string,
  from: string,
  count: number
) {
  const turns: Duty[] = [];
  for (let offset = 0; offset < 366 && turns.length < count; offset++) {
    const duty = dutyFor(schedule, addDays(from, offset));
    if (duty.householdId === householdId && duty.date >= schedule.startsOn) turns.push(duty);
  }
  return turns;
}

/** "Peter & Eliza", "Lynn, Mary Claire & Tom". */
export function memberNames(household: Household) {
  const names = household.members.map((member) => member.name.split(" ")[0]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0] ?? "";
}
