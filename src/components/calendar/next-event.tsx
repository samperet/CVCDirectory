import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/events";
import { formatWhen, relativeDay } from "@/lib/calendar/format";
import { Card } from "@/components/ui/card";
import { TIME_ZONE } from "@/lib/time";

const month = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, day: "numeric" });

/** The next event on the community calendar, with a link to the full calendar. */
export function NextEvent({ event }: { event: CalendarEvent | null }) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      {event ? (
        <>
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/25 text-secondary-foreground">
            <span className="text-xs font-semibold uppercase">{month.format(new Date(event.start))}</span>
            <span className="text-2xl font-bold leading-none">{day.format(new Date(event.start))}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Next event · {relativeDay(event)}
            </p>
            <p className="text-lg font-semibold text-foreground">{event.title}</p>
            <p className="text-sm text-foreground-light">{formatWhen(event)}</p>
            {event.location ? (
              <p className="flex items-center gap-1 text-sm text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{event.location}</span>
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <CalendarDays className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted">No upcoming events on the community calendar.</p>
        </div>
      )}
      <Link
        href="/calendar"
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-secondary-foreground underline-offset-4 hover:underline"
      >
        Full calendar <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
