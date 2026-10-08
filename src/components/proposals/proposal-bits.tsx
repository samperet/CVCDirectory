"use client";

import Link from "next/link";
import { BadgeCheck, CircleSlash, Hourglass, Users } from "lucide-react";
import { namesOf } from "@/lib/people";
import { shortDate } from "@/lib/time";
import type { ProposalConsent, ProposalStatus } from "@/lib/proposals/shared";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

/**
 * How a proposal's standing is shown everywhere: a pill (proposed — and
 * the day to decide — consented, or withdrawn), and the record of consent:
 * the circle, the meeting (linked to its notes or minutes), who was there
 * (the circle's members, then anyone else), and who recorded it.
 */

export function ProposalStatusPill({
  status,
  decideOn,
  consentDate,
  size = "sm",
}: {
  status: ProposalStatus;
  decideOn?: string | null;
  consentDate?: string | null;
  size?: "xs" | "sm";
}) {
  if (status === "consented")
    return (
      <Pill tone="pine" size={size} data-status="consented">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented
        {consentDate ? ` ${shortDate(consentDate, true)}` : ""}
      </Pill>
    );
  if (status === "withdrawn")
    return (
      <Pill tone="outline" size={size} className="font-normal" data-status="withdrawn">
        <CircleSlash className="h-3.5 w-3.5" aria-hidden /> Withdrawn
      </Pill>
    );
  return (
    <Pill tone="sun" size={size} data-status="proposed">
      <Hourglass className="h-3.5 w-3.5" aria-hidden /> Proposed
      {decideOn ? ` · to decide ${shortDate(decideOn, true)}` : ""}
    </Pill>
  );
}

/** "Present: Cara Cedar and Dev Dogwood · also there: Ada Ash, Sam (guest)". */
export function presentText(present: ProposalConsent["present"]) {
  const members = present.filter((person) => person.member);
  const others = present.filter((person) => !person.member);
  const other = others
    .map((person) => `${person.name}${person.personId ? "" : " (guest)"}`)
    .join(", ");
  return [
    members.length ? `Present: ${namesOf(members)}` : "",
    others.length ? `${members.length ? "also there" : "Present"}: ${other}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The record of a proposal's consent, as a few lines (flowing as text, so they centre or wrap alike). */
export function ProposalConsentRecord({
  consent,
  circleName,
  className,
}: {
  consent: ProposalConsent;
  circleName: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-0.5 text-xs text-muted", className)}
      data-proposal-consent
    >
      <p>
        <BadgeCheck className="mr-1 inline h-3.5 w-3.5 align-[-3px] text-pine" aria-hidden />
        {circleName} consented {shortDate(consent.meeting.date, true)} at{" "}
        <Link
          href={consent.meeting.href}
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          {consent.meeting.title}
        </Link>{" "}
        · recorded by {consent.submittedBy.name}
      </p>
      {consent.present.length ? (
        <p>
          <Users className="mr-1 inline h-3.5 w-3.5 align-[-3px]" aria-hidden />
          {presentText(consent.present)}
        </p>
      ) : null}
      {consent.note ? <p className="italic text-foreground-light">{consent.note}</p> : null}
    </div>
  );
}
