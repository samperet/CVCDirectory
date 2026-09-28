import type { CalendarEvent } from "./events";

const TIME_ZONE = "America/New_York";
const DAY_MS = 86_400_000;

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "Wednesday, September 30 · 7:00 – 8:30 PM", in the community's time zone. */
export function formatWhen(event: CalendarEvent): string {
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (event.allDay) {
    // All-day ends are exclusive: a one-day event ends at the next midnight.
    const lastDay = new Date(end.getTime() - DAY_MS);
    return end.getTime() - start.getTime() > DAY_MS
      ? `${shortDate.format(start)} – ${shortDate.format(lastDay)} · All day`
      : `${dateFormat.format(start)} · All day`;
  }
  const sameDay = dayKey.format(start) === dayKey.format(end);
  return sameDay
    ? `${dateFormat.format(start)} · ${timeFormat.format(start)} – ${timeFormat.format(end)}`
    : `${dateFormat.format(start)}, ${timeFormat.format(start)} – ${shortDate.format(end)}, ${timeFormat.format(end)}`;
}

/** "Today", "Tomorrow", "In 5 days" — relative to now, by calendar day in the community's time zone. */
export function relativeDay(event: CalendarEvent, now = new Date()): string {
  const start = new Date(event.start);
  if (start.getTime() <= now.getTime()) return "Happening now";
  const days = Math.round(
    (Date.parse(dayKey.format(start)) - Date.parse(dayKey.format(now))) / DAY_MS
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
