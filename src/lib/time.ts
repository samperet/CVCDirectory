/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", then a date. */
/** CVC's time zone: "today", calendars, and clocks are worked out in it, wherever the reader is. */
export const TIME_ZONE = "America/New_York";

/** Today in Vermont, as YYYY-MM-DD. */
export function todayInVermont(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Sep 3" (or "Sep 3, 2026") for a YYYY-MM-DD date — or the date part of a timestamp — as written, whatever the reader's time zone. */
export function shortDate(date: string, withYear = false) {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
