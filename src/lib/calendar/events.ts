import ICAL from "ical.js";
import { TIME_ZONE } from "@/lib/time";

/**
 * Upcoming events from the community's public Google Calendar, read from its
 * iCal feed on the server. Recurring events are expanded (honouring cancelled
 * dates and one-off changes to single occurrences) so "next event" is right.
 */

export const CALENDAR_ID = "champlainvalleycohousinginfo@gmail.com";
const FEED_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(
  CALENDAR_ID
)}/public/basic.ics`;
const REVALIDATE_SECONDS = 15 * 60;
const HORIZON_DAYS = 400;

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO instant
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
}

/** Midnight at the start of a calendar date in the given time zone, as an instant. */
function zonedMidnight(time: ICAL.Time, timeZone: string): number {
  const guess = Date.UTC(time.year, time.month - 1, time.day);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, Number(part.value)])
  );
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return guess - (wallAsUtc - guess);
}

/** All-day dates carry no time zone; anchor them to the community's, not the server's. */
function instant(time: ICAL.Time): number {
  return time.isDate ? zonedMidnight(time, TIME_ZONE) : time.toJSDate().getTime();
}

function text(value: unknown): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str || null;
}

/** Expand the feed into individual occurrences ending after `now`, soonest first. */
export function parseUpcoming(ics: string, now = new Date(), limit = 20): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(tz);
  }

  // Masters and their one-off exceptions share a UID.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const component of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) exceptions.push(event);
    else masters.set(event.uid, event);
  }
  for (const exception of exceptions) {
    masters.get(exception.uid)?.relateException(exception);
  }

  const nowTime = now.getTime();
  const horizon = nowTime + HORIZON_DAYS * 86_400_000;
  const occurrences: CalendarEvent[] = [];

  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, key: string) => {
    if (String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED")
      return;
    const startMs = instant(start);
    const endMs = instant(end ?? start);
    if (endMs <= nowTime || startMs > horizon) return;
    occurrences.push({
      id: key,
      title: text(item.summary) ?? "Untitled event",
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      allDay: start.isDate,
      location: text(item.location),
      description: text(item.description)?.slice(0, 500) ?? null,
    });
  };

  masters.forEach((event) => {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate, event.uid);
      return;
    }
    const iterator = event.iterator();
    for (
      let next = iterator.next(), guard = 0;
      next && guard < 5000;
      next = iterator.next(), guard++
    ) {
      if (instant(next) > horizon) break;
      const details = event.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate, `${event.uid}:${next.toString()}`);
    }
  });

  return occurrences.sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit);
}

/** Fetch and expand the feed; cached for 15 minutes. Returns [] if the feed is unreachable. */
export async function getUpcomingEvents(limit = 20): Promise<CalendarEvent[]> {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseUpcoming(await res.text(), new Date(), limit);
  } catch (error) {
    console.error(
      `[calendar] could not load the community calendar feed: ${(error as Error).message}`
    );
    return [];
  }
}
