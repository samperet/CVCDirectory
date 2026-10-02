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

export type MeetingsResponse = { meetings: MeetingSummary[]; proposals: ProposalSummary[]; canEdit: boolean; canReview: boolean };
export type MeetingResponse = { meeting: Meeting; proposals: ProposalSummary[]; canEdit: boolean; canReview: boolean };
export type ProposalResponse = { proposal: Proposal; meeting: MeetingSummary | null; canEdit: boolean; canReview: boolean; admin: boolean };

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

export const meetingHref = (circleId: string, meetingId: string) => `/circles/${circleId}/meetings/${meetingId}`;
export const proposalHref = (circleId: string, proposalId: string) => `/circles/${circleId}/proposals/${proposalId}`;

/** "Thu, Oct 2, 2026", from YYYY-MM-DD. */
export const meetingDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** "Oct 7, 4:05 pm". */
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm");

/** The time now, ticking each minute (for review clocks). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const STATE_STYLES: Record<ProposalState, string> = {
  draft: "bg-accent text-foreground",
  review: "bg-sun/15 text-[#7a5200]",
  paused: "bg-destructive/10 text-destructive",
  consented: "bg-primary/25 text-pine",
  withdrawn: "bg-black/5 text-muted",
};

/** Where a proposal stands, as a pill: "3 days left", "Paused: 1 objection", "Consented". */
export function ProposalBadge({ proposal, objections, now, className }: { proposal: Pick<Proposal, "review" | "consentedAt" | "withdrawnAt">; objections: number; now: number; className?: string }) {
  const state = proposalState(proposal, now);
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATE_STYLES[state], className)} data-state={state}>
      {statusLine(proposal, objections, now)}
    </span>
  );
}
