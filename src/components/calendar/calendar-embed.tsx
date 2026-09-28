import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CALENDAR_ID, CALENDAR_TIME_ZONE as TIME_ZONE } from "@/lib/calendar/events";
// Opening this link in Google Calendar offers to add it to your own calendars.
const SUBSCRIBE_URL = "https://calendar.google.com/calendar/u/0?cid=Y2hhbXBsYWludmFsbGV5Y29ob3VzaW5naW5mb0BnbWFpbC5jb20";

function embedUrl(mode: "MONTH" | "AGENDA") {
  const params = new URLSearchParams({
    src: CALENDAR_ID,
    ctz: TIME_ZONE,
    mode,
    showTitle: "0",
    showPrint: "0",
    showCalendars: "0",
    showTz: "0",
    wkst: "1",
  });
  return `https://calendar.google.com/calendar/embed?${params}`;
}

/** The community's public Google Calendar: month view on wide screens, agenda on phones. */
export function CalendarEmbed() {
  return (
    <Card className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <a
          href={SUBSCRIBE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-secondary-foreground underline-offset-4 hover:underline"
        >
          Open in Google Calendar <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <iframe
          title="Community calendar"
          src={embedUrl("MONTH")}
          loading="lazy"
          className="hidden h-[600px] w-full md:block"
        />
        <iframe
          title="Community calendar (agenda)"
          src={embedUrl("AGENDA")}
          loading="lazy"
          className="block h-[480px] w-full md:hidden"
        />
      </div>
    </Card>
  );
}
