"use client";

import { useState, type ReactNode } from "react";
import { BadgeCheck } from "lucide-react";
import { namesOf, type NamedPerson } from "@/lib/people";
import { shortDate, todayInVermont } from "@/lib/time";
import { CirclePeopleField } from "@/components/directory/circle-people-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A circle's consent — to a written page or an uploaded file — as it's
 * recorded and shown: the day, who consented, and who recorded it here.
 * Records from before the app asked who consented show only the day and
 * who recorded them.
 */

type Consent = {
  date: string;
  consentedBy?: NamedPerson[];
  recordedBy: { name: string };
};

/** "Consented Oct 3, 2026 by Ada Ash and Ben Birch · recorded by Cara Cedar" (for tooltips). */
export function consentSummary(consent: Consent, what = "Consented") {
  const by = consent.consentedBy?.length ? ` by ${namesOf(consent.consentedBy)}` : "";
  return `${what} ${shortDate(consent.date, true)}${by} · recorded by ${consent.recordedBy.name}`;
}

/** The record, as a line: who consented when, and who recorded it. */
export function ConsentRecord({
  consent,
  what = "Consented",
  className,
}: {
  consent: Consent;
  /** How it starts: "Consented", or "Version 2 consented" once the file has changed since. */
  what?: string;
  className?: string;
}) {
  return (
    <p
      className={cn("flex flex-wrap items-center gap-x-1 text-xs text-muted", className)}
      data-consent-record
    >
      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-pine" aria-hidden />
      <span>
        {what} {shortDate(consent.date, true)}
        {consent.consentedBy?.length ? (
          <>
            {" "}
            by <span className="text-foreground">{namesOf(consent.consentedBy)}</span>
          </>
        ) : null}
      </span>
      <span aria-hidden>·</span>
      <span>recorded by {consent.recordedBy.name}</span>
    </p>
  );
}

/**
 * Recording a circle's consent: the day it consented (not in the future) and
 * who consented — its members ticked, or anyone else added. Whoever records
 * it is noted by the server.
 */
export function ConsentDialog({
  circleId,
  circleName,
  initialDate,
  note,
  submitLabel = "Mark consented",
  saving,
  onSave,
  onClose,
}: {
  circleId: string;
  circleName: string;
  initialDate: string;
  /** What consent covers ("the page as it stands now…"). */
  note?: ReactNode;
  submitLabel?: string;
  saving: boolean;
  onSave: (consent: { date: string; consentedBy: NamedPerson[] }) => void;
  onClose: () => void;
}) {
  const today = todayInVermont();
  const [date, setDate] = useState(initialDate);
  const [people, setPeople] = useState<NamedPerson[]>([]);
  return (
    <Dialog
      title="Record consent"
      icon={<BadgeCheck className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (date && people.length) onSave({ date, consentedBy: people });
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-foreground">
          {circleName} consented on
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
            className="bg-white"
            required
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-foreground">Who consented</legend>
          <CirclePeopleField
            circleId={circleId}
            people={people}
            onChange={setPeople}
            allLabel="All members"
            othersLabel="Others who consented"
            otherPlaceholder="…or someone else's name"
            otherLabel="Someone else's name"
          />
        </fieldset>
        {note ? <p className="text-xs text-muted">{note}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!date || !people.length || saving}>
            {saving ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
