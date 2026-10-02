"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  proposalState,
  statusLine,
  type Meeting,
  type MeetingSummary,
  type Proposal,
  type ProposalState,
  type ProposalSummary,
} from "@/lib/meetings/shared";
import { cn } from "@/lib/utils";
import { Pill, type PillTone } from "@/components/ui/pill";

export type MeetingsResponse = {
  meetings: MeetingSummary[];
  proposals: ProposalSummary[];
  canEdit: boolean;
  canReview: boolean;
};
export type MeetingResponse = {
  meeting: Meeting;
  proposals: ProposalSummary[];
  canEdit: boolean;
  canReview: boolean;
};
export type ProposalResponse = {
  proposal: Proposal;
  meeting: MeetingSummary | null;
  canEdit: boolean;
  canReview: boolean;
  admin: boolean;
};

export const meetingsQuery = (circleId: string) => ({
  queryKey: ["meetings", circleId],
  queryFn: () => apiFetch<MeetingsResponse>(`/api/circles/${circleId}/meetings`),
});

export const meetingQuery = (circleId: string, meetingId: string) => ({
  queryKey: ["meeting", circleId, meetingId],
  queryFn: () => apiFetch<MeetingResponse>(`/api/circles/${circleId}/meetings/${meetingId}`),
});

export const proposalQuery = (circleId: string, proposalId: string) => ({
  queryKey: ["proposal", circleId, proposalId],
  queryFn: () => apiFetch<ProposalResponse>(`/api/circles/${circleId}/proposals/${proposalId}`),
});

export { meetingHref, proposalHref } from "@/lib/meetings/shared";

/** "Thu, Oct 2, 2026", from YYYY-MM-DD. */
export const meetingDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** "Oct 7, 4:05 pm". */
export const dateTime = (iso: string) =>
  new Date(iso)
    .toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .replace(" AM", " am")
    .replace(" PM", " pm");

/** The time now, ticking each minute (for review clocks). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const STATE_TONES: Record<ProposalState, PillTone> = {
  draft: "accent",
  review: "amber",
  paused: "destructive",
  consented: "pine",
  withdrawn: "muted",
};

/** Where a proposal stands, as a pill: "3 days left", "Paused: 1 objection", "Consented". */
export function ProposalBadge({
  proposal,
  objections,
  now,
  className,
}: {
  proposal: Pick<Proposal, "review" | "consentedAt" | "withdrawnAt">;
  objections: number;
  now: number;
  className?: string;
}) {
  const state = proposalState(proposal, now);
  return (
    <Pill tone={STATE_TONES[state]} className={cn("font-semibold", className)} data-state={state}>
      {statusLine(proposal, objections, now)}
    </Pill>
  );
}
