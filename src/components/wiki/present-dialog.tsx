"use client";

import { useState } from "react";
import { CalendarDays, Users } from "lucide-react";
import { shortDate, todayInVermont } from "@/lib/time";
import type { PagePerson } from "@/lib/wiki/store";
import { CirclePeopleField } from "@/components/directory/circle-people-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Who's present — for a page of meeting notes: the day of the meeting (which
 * makes the page a meeting's notes, where proposals can be consented), and
 * the page's circle's members as chips to tick (or **All members present**),
 * plus **Add someone** for any other resident, or a guest by name
 * (`CirclePeopleField`). Saved as the page's `meetingDate` and `present`,
 * shown under its title.
 */
export function PresentDialog({
  circleId,
  present: initial,
  meetingDate: initialDate,
  saving,
  onSave,
  onClose,
}: {
  circleId: string;
  present: PagePerson[];
  meetingDate: string | null;
  saving: boolean;
  onSave: (present: PagePerson[], meetingDate: string) => void;
  onClose: () => void;
}) {
  const today = todayInVermont();
  const [present, setPresent] = useState(initial);
  const [date, setDate] = useState(initialDate ?? today);
  return (
    <Dialog
      title="Who's present"
      icon={<Users className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        The meeting was on
        <Input
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
          className="h-9 w-auto bg-white"
          aria-label="The meeting's day"
        />
      </label>
      <CirclePeopleField
        circleId={circleId}
        people={present}
        onChange={setPresent}
        allLabel="All members present"
        othersLabel="Others present"
        otherNote="guest"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(present, date)} disabled={saving || !date}>
          {saving ? "Saving…" : "Done"}
        </Button>
      </div>
    </Dialog>
  );
}

/** "Meeting Oct 8, 2026 · Present: Ada Ash, Ben Birch, Sam (guest)" under a page's title. */
export function PresentLine({
  present,
  meetingDate,
}: {
  present?: PagePerson[];
  meetingDate?: string | null;
}) {
  if (!present?.length && !meetingDate) return null;
  return (
    <p
      className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-foreground-light"
      data-present
    >
      {meetingDate ? (
        <>
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-medium" data-meeting-date>
            Meeting {shortDate(meetingDate, true)}
          </span>
          {present?.length ? <span aria-hidden>·</span> : null}
        </>
      ) : null}
      {present?.length ? (
        <>
          <Users className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-medium">Present:</span>
          {present.map((entry) => `${entry.name}${entry.personId ? "" : " (guest)"}`).join(", ")}
        </>
      ) : null}
    </p>
  );
}
