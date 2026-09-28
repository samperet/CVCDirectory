import type { Metadata } from "next";
import { CalendarEmbed } from "@/components/calendar/calendar-embed";

export const metadata: Metadata = {
  title: "Calendar | Community Village Cooperative Directory",
};

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
        <p className="text-sm text-foreground/70">Meetings, work days, and gatherings at CVC.</p>
      </div>
      <CalendarEmbed />
    </div>
  );
}
