/**
 * A circle's meetings and the proposals brought to them (safe for the
 * browser). A meeting has who was there and its notes (the minutes). A
 * proposal goes into a consent review of five days: the circle's members
 * log tensions in its comments, and a Reasoned Objection pauses the review
 * until the objector withdraws it, when the review picks up with the time it
 * had left. With no open objection when the time runs out, it's consented.
 */

export const REVIEW_DAYS = 5;
export const REVIEW_MS = REVIEW_DAYS * 24 * 60 * 60 * 1000;
/** An objection needs a reason this long, at least. */
export const MIN_OBJECTION_REASON = 10;

export interface Attendee {
  /** Unset for a guest who isn't in the directory. */
  personId?: string;
  name: string;
}

export interface MeetingAuthor {
  userId: string;
  name: string;
}

export interface Meeting {
  id: string;
  circleId: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  attendees: Attendee[];
  /** The minutes, in Markdown. */
  notes: string;
  createdBy: MeetingAuthor;
  createdAt: string;
  updatedBy: MeetingAuthor;
  updatedAt: string;
}

export type CommentKind = "tension" | "objection";

export interface ProposalComment {
  id: string;
  /** null: a tension or an objection of its own; otherwise the one it replies to. */
  parentId: string | null;
  /** What it is (for replies, the same as what they reply to). */
  kind: CommentKind;
  authorId: string;
  /** The author's directory entry (so objections can be told apart from the circle's members). */
  authorPersonId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  /** A tension marked addressed, and by whom. */
  addressedAt?: string | null;
  addressedBy?: string | null;
  /** An objection withdrawn by its author (or an admin), with an optional note. */
  withdrawnAt?: string | null;
  withdrawnBy?: string | null;
  withdrawnNote?: string | null;
}

export type ProposalEventKind = "review" | "paused" | "resumed" | "consented" | "withdrawn" | "edited";

export interface ProposalEvent {
  at: string;
  kind: ProposalEventKind;
  /** Who did it (unset when the review simply ran its course). */
  by?: string;
}

export interface Proposal {
  id: string;
  circleId: string;
  meetingId: string;
  title: string;
  /** Markdown. */
  body: string;
  proposer: { userId: string; personId: string | null; name: string };
  createdAt: string;
  editedAt?: string | null;
  /** Set once it's sent for review: while it runs, `deadline`; while it's paused, the time it had left. */
  review: { startedAt: string; deadline: string | null; remainingMs: number | null } | null;
  consentedAt?: string | null;
  withdrawnAt?: string | null;
  /** Whether its consent has been announced. */
  announced?: boolean;
  comments: ProposalComment[];
  events: ProposalEvent[];
}

export type ProposalState = "draft" | "review" | "paused" | "consented" | "withdrawn";

export const STATE_LABELS: Record<ProposalState, string> = {
  draft: "Draft",
  review: "In review",
  paused: "Paused",
  consented: "Consented",
  withdrawn: "Withdrawn",
};

/** Objections not yet withdrawn. */
export const openObjections = (proposal: Pick<Proposal, "comments">) =>
  proposal.comments.filter((comment) => comment.kind === "objection" && comment.parentId === null && !comment.withdrawnAt);

/** Where a proposal stands at `now` (consent comes as the review's time runs out, without anyone doing anything). */
export function proposalState(proposal: Pick<Proposal, "review" | "consentedAt" | "withdrawnAt">, now = Date.now()): ProposalState {
  if (proposal.withdrawnAt) return "withdrawn";
  if (proposal.consentedAt) return "consented";
  if (!proposal.review) return "draft";
  if (proposal.review.deadline === null) return "paused";
  return Date.parse(proposal.review.deadline) <= now ? "consented" : "review";
}

/** When it was consented (the end of its review), if it has been. */
export const consentedOn = (proposal: Pick<Proposal, "review" | "consentedAt" | "withdrawnAt">, now = Date.now()) =>
  proposalState(proposal, now) === "consented" ? proposal.consentedAt ?? proposal.review?.deadline ?? null : null;

/** The review's time left: counting down while it runs, held while it's paused. */
export function reviewTimeLeft(proposal: Pick<Proposal, "review" | "consentedAt" | "withdrawnAt">, now = Date.now()): number | null {
  const state = proposalState(proposal, now);
  if (state === "review") return Date.parse(proposal.review!.deadline!) - now;
  if (state === "paused") return proposal.review!.remainingMs ?? 0;
  return null;
}

/** "4 days 3 hours", "5 hours 10 minutes", "12 minutes". */
export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days) return hours ? `${part(days, "day")} ${part(hours, "hour")}` : part(days, "day");
  if (hours) return mins ? `${part(hours, "hour")} ${part(mins, "minute")}` : part(hours, "hour");
  return part(mins, "minute");
}

/** A short status: "3 days 4 hours left", "Paused: 1 objection", "Consented". */
export function statusLine(proposal: Pick<Proposal, "review" | "consentedAt" | "withdrawnAt">, objections: number, now = Date.now()) {
  const state = proposalState(proposal, now);
  const left = reviewTimeLeft(proposal, now);
  if (state === "review") return `${formatDuration(left!)} left`;
  if (state === "paused") return `Paused: ${objections === 1 ? "1 objection" : `${objections} objections`}`;
  return STATE_LABELS[state];
}

export const meetingHref = (circleId: string, meetingId: string) => `/circles/${circleId}/meetings/${meetingId}`;
export const proposalHref = (circleId: string, proposalId: string) => `/circles/${circleId}/proposals/${proposalId}`;

/** A meeting with just what lists need. */
export type MeetingSummary = Pick<Meeting, "id" | "circleId" | "title" | "date" | "updatedAt"> & { present: number };

/** A proposal with just what lists need. */
export type ProposalSummary = Pick<Proposal, "id" | "circleId" | "meetingId" | "title" | "review" | "consentedAt" | "withdrawnAt" | "createdAt"> & {
  proposerName: string;
  openObjections: number;
  openTensions: number;
};

export const summarizeMeeting = (meeting: Meeting): MeetingSummary => ({
  id: meeting.id,
  circleId: meeting.circleId,
  title: meeting.title,
  date: meeting.date,
  updatedAt: meeting.updatedAt,
  present: meeting.attendees.length,
});

export const summarizeProposal = (proposal: Proposal): ProposalSummary => ({
  id: proposal.id,
  circleId: proposal.circleId,
  meetingId: proposal.meetingId,
  title: proposal.title,
  review: proposal.review,
  consentedAt: proposal.consentedAt ?? null,
  withdrawnAt: proposal.withdrawnAt ?? null,
  createdAt: proposal.createdAt,
  proposerName: proposal.proposer.name,
  openObjections: openObjections(proposal).length,
  openTensions: proposal.comments.filter((comment) => comment.kind === "tension" && comment.parentId === null && !comment.addressedAt).length,
});
