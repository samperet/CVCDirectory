import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, mutateJson, readJson } from "@/lib/storage";
import { mergeText } from "@/lib/wiki/merge";
import { isIsoDate } from "@/lib/schedules/rotation";
import { todayInVermont } from "@/lib/time";
import {
  MIN_OBJECTION_REASON,
  REVIEW_MS,
  openObjections,
  proposalState,
  type Attendee,
  type CommentKind,
  type Meeting,
  type MeetingAuthor,
  type Proposal,
  type ProposalComment,
  type ProposalEvent,
} from "./shared";
import type { Actor } from "@/lib/auth/actor";

/**
 * A circle's meetings and proposals, kept together (`meetings/<circleId>.json`)
 * so a proposal's review clock changes in the same write as the objection
 * that pauses or resumes it. Consent is worked out as the clock runs out (see
 * `proposalState`) and recorded at the next write.
 */

const MAX_MEETINGS = 1000;
const MAX_PROPOSALS = 1000;
const MAX_COMMENTS = 500;
const MAX_ATTENDEES = 200;

const key = (circleId: string) => `meetings/${circleId}.json`;

type Stored = { meetings: Meeting[]; proposals: Proposal[] };

function normalize(raw: unknown): Stored {
  const value = raw as Partial<Stored> | null;
  return {
    meetings: Array.isArray(value?.meetings) ? value!.meetings : [],
    proposals: Array.isArray(value?.proposals) ? value!.proposals : [],
  };
}

/** Record consent for a review whose time has run out. */
function settle(proposal: Proposal, now = Date.now()): Proposal {
  if (proposal.consentedAt || proposal.withdrawnAt || proposalState(proposal, now) !== "consented")
    return proposal;
  const at = proposal.review!.deadline!;
  return { ...proposal, consentedAt: at, events: [...proposal.events, { at, kind: "consented" }] };
}

/** A circle's meetings (newest first) and proposals (newest first), with consent recorded where it's due. */
export async function readCircleMeetings(circleId: string): Promise<Stored> {
  const stored = normalize(await readJson(key(circleId)));
  return {
    meetings: stored.meetings
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    proposals: stored.proposals
      .map((proposal) => settle(proposal))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/** Delete a circle's meetings (with the circle). */
export const deleteCircleMeetings = (circleId: string) => deleteJson(key(circleId));

export type Failure =
  | "not_found"
  | "forbidden"
  | "full"
  | "closed"
  | "not_in_review"
  | "has_proposals"
  | "unknown_thread"
  | "too_short";
type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure };

function mutate<T>(
  circleId: string,
  change: (stored: Stored, now: number) => { stored: Stored; value: T } | Failure
): Promise<Result<T>> {
  return mutateJson<Result<T>>(key(circleId), (raw) => {
    const now = Date.now();
    const current = normalize(raw);
    const result = change(
      { ...current, proposals: current.proposals.map((proposal) => settle(proposal, now)) },
      now
    );
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return { value: result.stored, result: { ok: true, value: result.value } };
  });
}

// ── Meetings ──────────────────────────────────────────────────────────────

const date = z.string().refine(isIsoDate, "Choose a date");
const attendee = z.object({
  personId: z
    .string()
    .regex(/^[a-f0-9]{12}$/)
    .optional(),
  name: z.string().trim().min(1, "Give each person a name").max(80),
});

export const meetingCreateSchema = z.object({
  date: date.optional(),
  title: z.string().trim().max(120, "Titles must be 120 characters or fewer").optional(),
});

export const meetingUpdateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the meeting a title")
      .max(120, "Titles must be 120 characters or fewer"),
    date,
    attendees: z.array(attendee).max(MAX_ATTENDEES),
    notes: z.string().max(100_000, "Notes must be 100,000 characters or fewer"),
    /** The notes as they were when these were written from them (to merge with anyone else's changes). */
    baseNotes: z.string().max(100_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export function createMeeting(
  circleId: string,
  circleName: string,
  author: MeetingAuthor,
  input: z.infer<typeof meetingCreateSchema>
) {
  return mutate<Meeting>(circleId, (stored, now) => {
    if (stored.meetings.length >= MAX_MEETINGS) return "full";
    const at = new Date(now).toISOString();
    const by = { userId: author.userId, name: author.name };
    const meeting: Meeting = {
      id: randomUUID(),
      circleId,
      title: input.title || `${circleName} meeting`,
      date: input.date ?? todayInVermont(),
      attendees: [],
      notes: "",
      createdBy: by,
      createdAt: at,
      updatedBy: by,
      updatedAt: at,
    };
    return { stored: { ...stored, meetings: [...stored.meetings, meeting] }, value: meeting };
  });
}

/** Without duplicates (the same resident, or the same guest name, twice). */
function uniqueAttendees(attendees: Attendee[]) {
  const seen = new Set<string>();
  return attendees.filter((entry) => {
    const id = entry.personId ?? `guest:${entry.name.toLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Change a meeting. Notes written from `baseNotes` that someone else has
 * changed since are merged with their changes (paragraph by paragraph), so
 * two people taking notes don't undo each other.
 */
export function updateMeeting(
  circleId: string,
  meetingId: string,
  editor: MeetingAuthor,
  update: z.infer<typeof meetingUpdateSchema>
) {
  return mutate<{ meeting: Meeting; merged: boolean }>(circleId, (stored, now) => {
    const current = stored.meetings.find((entry) => entry.id === meetingId);
    if (!current) return "not_found";
    const { baseNotes, notes, attendees, ...rest } = update;
    let merged = false;
    let nextNotes = current.notes;
    if (notes !== undefined) {
      if (baseNotes !== undefined && baseNotes !== current.notes && notes !== current.notes) {
        nextNotes = mergeText(baseNotes, notes, current.notes).text;
        merged = true;
      } else nextNotes = notes;
    }
    const meeting: Meeting = {
      ...current,
      ...rest,
      ...(attendees ? { attendees: uniqueAttendees(attendees) } : {}),
      notes: nextNotes,
      updatedBy: { userId: editor.userId, name: editor.name },
      updatedAt: new Date(now).toISOString(),
    };
    return {
      stored: {
        ...stored,
        meetings: stored.meetings.map((entry) => (entry.id === meetingId ? meeting : entry)),
      },
      value: { meeting, merged },
    };
  });
}

/** Delete a meeting — not once one of its proposals has gone for review (its drafts go with it). */
export function deleteMeeting(circleId: string, meetingId: string) {
  return mutate<null>(circleId, (stored) => {
    if (!stored.meetings.some((entry) => entry.id === meetingId)) return "not_found";
    const own = stored.proposals.filter((proposal) => proposal.meetingId === meetingId);
    if (own.some((proposal) => proposal.review)) return "has_proposals";
    return {
      stored: {
        meetings: stored.meetings.filter((entry) => entry.id !== meetingId),
        proposals: stored.proposals.filter((proposal) => proposal.meetingId !== meetingId),
      },
      value: null,
    };
  });
}

// ── Proposals ─────────────────────────────────────────────────────────────

const proposalTitle = z
  .string()
  .trim()
  .min(1, "Give the proposal a title")
  .max(160, "Titles must be 160 characters or fewer");
const proposalBody = z.string().max(20_000, "Proposals must be 20,000 characters or fewer");

export const proposalInputSchema = z.object({
  title: proposalTitle,
  body: proposalBody.default(""),
});
export const proposalUpdateSchema = z.union([
  z.object({ action: z.enum(["start-review", "withdraw"]) }),
  z
    .object({ title: proposalTitle, body: proposalBody })
    .partial()
    .refine((value) => Object.keys(value).length > 0, "Nothing to update"),
]);

function changeProposal(
  circleId: string,
  proposalId: string,
  change: (proposal: Proposal, now: number) => Proposal | Failure
) {
  return mutate<Proposal>(circleId, (stored, now) => {
    const current = stored.proposals.find((entry) => entry.id === proposalId);
    if (!current) return "not_found";
    const next = change(current, now);
    if (typeof next === "string") return next;
    return {
      stored: {
        ...stored,
        proposals: stored.proposals.map((entry) => (entry.id === proposalId ? next : entry)),
      },
      value: next,
    };
  });
}

const event = (now: number, kind: ProposalEvent["kind"], by?: string): ProposalEvent => ({
  at: new Date(now).toISOString(),
  kind,
  ...(by ? { by } : {}),
});
const closed = (proposal: Proposal, now: number) =>
  ["consented", "withdrawn"].includes(proposalState(proposal, now));

export function addProposal(
  circleId: string,
  meetingId: string,
  proposer: Actor,
  input: z.infer<typeof proposalInputSchema>
) {
  return mutate<Proposal>(circleId, (stored, now) => {
    if (!stored.meetings.some((entry) => entry.id === meetingId)) return "not_found";
    if (stored.proposals.length >= MAX_PROPOSALS) return "full";
    const proposal: Proposal = {
      id: randomUUID(),
      circleId,
      meetingId,
      title: input.title,
      body: input.body,
      proposer: { userId: proposer.userId, personId: proposer.personId, name: proposer.name },
      createdAt: new Date(now).toISOString(),
      review: null,
      comments: [],
      events: [],
    };
    return { stored: { ...stored, proposals: [...stored.proposals, proposal] }, value: proposal };
  });
}

/** Change a proposal's wording (until it's consented or withdrawn); changes during its review are noted in its history. */
export function editProposal(
  circleId: string,
  proposalId: string,
  editor: Actor,
  update: { title?: string; body?: string }
) {
  return changeProposal(circleId, proposalId, (proposal, now) => {
    if (closed(proposal, now)) return "closed";
    const last = proposal.events[proposal.events.length - 1];
    // A run of edits by one person shows once.
    const noted =
      proposal.review &&
      !(
        last?.kind === "edited" &&
        last.by === editor.name &&
        now - Date.parse(last.at) < 30 * 60_000
      );
    return {
      ...proposal,
      ...update,
      editedAt: proposal.review ? new Date(now).toISOString() : proposal.editedAt ?? null,
      events: noted ? [...proposal.events, event(now, "edited", editor.name)] : proposal.events,
    };
  });
}

/** Send a draft for its five-day consent review. */
export function startReview(circleId: string, proposalId: string, actor: Actor) {
  return changeProposal(circleId, proposalId, (proposal, now) => {
    if (proposalState(proposal, now) !== "draft") return "closed";
    const startedAt = new Date(now).toISOString();
    // Objections raised on the draft (none can be) don't apply; the review starts running.
    return {
      ...proposal,
      review: { startedAt, deadline: new Date(now + REVIEW_MS).toISOString(), remainingMs: null },
      events: [...proposal.events, event(now, "review", actor.name)],
    };
  });
}

export function withdrawProposal(circleId: string, proposalId: string, actor: Actor) {
  return changeProposal(circleId, proposalId, (proposal, now) => {
    if (closed(proposal, now)) return "closed";
    return {
      ...proposal,
      withdrawnAt: new Date(now).toISOString(),
      events: [...proposal.events, event(now, "withdrawn", actor.name)],
    };
  });
}

/** Delete a proposal that never went for review. */
export function deleteProposal(circleId: string, proposalId: string) {
  return mutate<null>(circleId, (stored) => {
    const proposal = stored.proposals.find((entry) => entry.id === proposalId);
    if (!proposal) return "not_found";
    if (proposal.review) return "closed";
    return {
      stored: { ...stored, proposals: stored.proposals.filter((entry) => entry.id !== proposalId) },
      value: null,
    };
  });
}

// ── Comments: tensions, objections, and replies ───────────────────────────

const commentBody = z
  .string()
  .trim()
  .min(1, "Write something")
  .max(4000, "Comments must be 4000 characters or fewer");

export const proposalCommentSchema = z.object({
  kind: z.enum(["tension", "objection"]).default("tension"),
  body: commentBody,
  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const proposalCommentUpdateSchema = z.union([
  z.object({ body: commentBody }),
  z.object({ addressed: z.boolean() }),
  z.object({
    withdrawn: z.literal(true),
    note: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((value) => value || null),
  }),
]);

function changeComments(
  circleId: string,
  proposalId: string,
  change: (
    proposal: Proposal,
    now: number
  ) => { proposal: Proposal; comment: ProposalComment | null } | Failure
) {
  return mutate<{ proposal: Proposal; comment: ProposalComment | null }>(
    circleId,
    (stored, now) => {
      const current = stored.proposals.find((entry) => entry.id === proposalId);
      if (!current) return "not_found";
      const result = change(current, now);
      if (typeof result === "string") return result;
      return {
        stored: {
          ...stored,
          proposals: stored.proposals.map((entry) =>
            entry.id === proposalId ? result.proposal : entry
          ),
        },
        value: result,
      };
    }
  );
}

/**
 * Log a tension, raise a Reasoned Objection, or reply to either. An
 * objection pauses a running review, holding the time it had left.
 */
export function addProposalComment(
  circleId: string,
  proposalId: string,
  author: Actor,
  input: { kind: CommentKind; body: string; parentId: string | null }
) {
  return changeComments(circleId, proposalId, (proposal, now) => {
    if (closed(proposal, now)) return "closed";
    if (proposal.comments.length >= MAX_COMMENTS) return "full";
    const parent = input.parentId
      ? proposal.comments.find((entry) => entry.id === input.parentId && entry.parentId === null)
      : null;
    if (input.parentId && !parent) return "unknown_thread";
    const kind: CommentKind = parent ? parent.kind : input.kind;
    const objecting = !parent && kind === "objection";
    if (objecting) {
      if (!proposal.review) return "not_in_review";
      if (input.body.length < MIN_OBJECTION_REASON) return "too_short";
    }
    const comment: ProposalComment = {
      id: randomUUID(),
      parentId: parent?.id ?? null,
      kind,
      authorId: author.userId,
      authorPersonId: author.personId,
      authorName: author.name,
      body: input.body,
      createdAt: new Date(now).toISOString(),
    };
    let next: Proposal = { ...proposal, comments: [...proposal.comments, comment] };
    if (objecting && proposalState(proposal, now) === "review") {
      next = {
        ...next,
        review: {
          ...proposal.review!,
          deadline: null,
          remainingMs: Math.max(0, Date.parse(proposal.review!.deadline!) - now),
        },
        events: [...proposal.events, event(now, "paused", author.name)],
      };
    }
    return { proposal: next, comment };
  });
}

export function editProposalComment(
  circleId: string,
  proposalId: string,
  commentId: string,
  actor: Actor,
  body: string
) {
  return changeComments(circleId, proposalId, (proposal, now) => {
    const comment = proposal.comments.find((entry) => entry.id === commentId);
    if (!comment) return "not_found";
    if (comment.authorId !== actor.userId) return "forbidden";
    if (closed(proposal, now)) return "closed";
    if (
      comment.kind === "objection" &&
      comment.parentId === null &&
      body.length < MIN_OBJECTION_REASON
    )
      return "too_short";
    const updated = { ...comment, body, editedAt: new Date(now).toISOString() };
    return {
      proposal: {
        ...proposal,
        comments: proposal.comments.map((entry) => (entry.id === commentId ? updated : entry)),
      },
      comment: updated,
    };
  });
}

/** Mark a tension addressed (or not, again). */
export function setTensionAddressed(
  circleId: string,
  proposalId: string,
  commentId: string,
  actor: Actor,
  addressed: boolean
) {
  return changeComments(circleId, proposalId, (proposal, now) => {
    const comment = proposal.comments.find(
      (entry) => entry.id === commentId && entry.parentId === null && entry.kind === "tension"
    );
    if (!comment) return "not_found";
    const updated = {
      ...comment,
      addressedAt: addressed ? new Date(now).toISOString() : null,
      addressedBy: addressed ? actor.name : null,
    };
    return {
      proposal: {
        ...proposal,
        comments: proposal.comments.map((entry) => (entry.id === commentId ? updated : entry)),
      },
      comment: updated,
    };
  });
}

/**
 * Withdraw an objection: its author, or an admin. With no objection left
 * open, the review carries on with the time it had left.
 */
export function withdrawObjection(
  circleId: string,
  proposalId: string,
  commentId: string,
  actor: Actor,
  note: string | null
) {
  return changeComments(circleId, proposalId, (proposal, now) => {
    const comment = proposal.comments.find(
      (entry) => entry.id === commentId && entry.parentId === null && entry.kind === "objection"
    );
    if (!comment) return "not_found";
    if (comment.authorId !== actor.userId && !actor.admin) return "forbidden";
    if (comment.withdrawnAt || proposal.withdrawnAt) return "closed";
    const updated: ProposalComment = {
      ...comment,
      withdrawnAt: new Date(now).toISOString(),
      withdrawnBy: actor.name,
      withdrawnNote: note,
    };
    let next: Proposal = {
      ...proposal,
      comments: proposal.comments.map((entry) => (entry.id === commentId ? updated : entry)),
    };
    if (!openObjections(next).length && proposalState(proposal, now) === "paused") {
      next = {
        ...next,
        review: {
          ...proposal.review!,
          deadline: new Date(now + (proposal.review!.remainingMs ?? 0)).toISOString(),
          remainingMs: null,
        },
        events: [...proposal.events, event(now, "resumed", actor.name)],
      };
    }
    return { proposal: next, comment: updated };
  });
}

/** Delete a tension or a reply (its author, or an admin) — objections are withdrawn, not deleted, so the record stays. */
export function deleteProposalComment(
  circleId: string,
  proposalId: string,
  commentId: string,
  actor: Pick<Actor, "userId" | "admin">
) {
  return changeComments(circleId, proposalId, (proposal) => {
    const comment = proposal.comments.find((entry) => entry.id === commentId);
    if (!comment) return "not_found";
    if (comment.authorId !== actor.userId && !actor.admin) return "forbidden";
    if (comment.kind === "objection" && comment.parentId === null) return "forbidden";
    return {
      proposal: {
        ...proposal,
        comments: proposal.comments.filter(
          (entry) => entry.id !== commentId && entry.parentId !== commentId
        ),
      },
      comment: null,
    };
  });
}

/** Proposals consented but not yet announced, now marked announced (so each is announced once). */
export async function claimConsents(circleId: string): Promise<Proposal[]> {
  const pending = (await readCircleMeetings(circleId)).proposals.filter(
    (proposal) => proposal.consentedAt && !proposal.announced
  );
  if (!pending.length) return [];
  const result = await mutate<Proposal[]>(circleId, (stored) => {
    const fresh = stored.proposals.filter(
      (proposal) => proposal.consentedAt && !proposal.announced
    );
    if (!fresh.length) return { stored, value: [] };
    return {
      stored: {
        ...stored,
        proposals: stored.proposals.map((proposal) =>
          fresh.includes(proposal) ? { ...proposal, announced: true } : proposal
        ),
      },
      value: fresh,
    };
  });
  return result.ok ? result.value : [];
}
