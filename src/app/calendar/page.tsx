import type { Metadata } from "next";
import { CalendarEmbed } from "@/components/calendar/calendar-embed";

export const metadata: Metadata = {
  title: "Calendar · Common Pastures",
};

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
      </div>
      <CalendarEmbed />
    </div>
  );
}
