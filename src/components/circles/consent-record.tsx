"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { namesOf, type NamedPerson } from "@/lib/people";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * A circle's consent — to a written page or an uploaded file — as it's
 * shown: the day, the meeting it was given at (consent comes through
 * proposals now, at a meeting), who consented (the circle's members who
 * were there), and who recorded it. Records from before proposals have no
 * meeting; older ones still don't say who consented.
 */

type Consent = {
  date: string;
  consentedBy?: NamedPerson[];
  recordedBy: { name: string };
  meeting?: { title: string; href: string };
};

/** "Consented Oct 3, 2026 by Ada Ash and Ben Birch · recorded by Cara Cedar" (for tooltips). */
export function consentSummary(consent: Consent, what = "Consented") {
  const at = consent.meeting ? ` at ${consent.meeting.title}` : "";
  const by = consent.consentedBy?.length ? ` by ${namesOf(consent.consentedBy)}` : "";
  return `${what} ${shortDate(consent.date, true)}${at}${by} · recorded by ${
    consent.recordedBy.name
  }`;
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
        {consent.meeting ? (
          <>
            {" "}
            at{" "}
            <Link
              href={consent.meeting.href}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {consent.meeting.title}
            </Link>
          </>
        ) : null}
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
