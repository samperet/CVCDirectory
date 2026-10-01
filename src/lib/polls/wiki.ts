import { randomUUID } from "crypto";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { isAdmin } from "@/lib/auth/admins";
import { problem } from "@/lib/http";
import { deleteJson, enqueue, readJson, writeJson } from "@/lib/storage";
import type { Poll, VoteFailure } from "./shared";
import { PollInput, castVote, newPoll, pollInputSchema, withClosed } from "./server";

/**
 * Polls inside wiki pages. A page holds a poll as `::poll{id="…"}`; the
 * poll itself (question, options, votes) lives with its circle's other
 * polls in one document (`wiki-polls/<circleId>.json`). Whoever can edit the
 * circle's wiki adds polls (any resident, on Community); a poll can be for
 * the circle's members only. A poll is announced the first time a page
 * holding it is saved.
 */

export interface WikiPoll {
  id: string;
  question: string;
  details: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  /** Only the circle's members vote (everyone still sees the results). */
  membersOnly?: boolean;
  /** Residents have been told about it. */
  announced?: boolean;
  poll: Poll;
}

export const wikiPollInputSchema = z.object({
  question: z.string().trim().min(3, "Ask a question (at least 3 characters)").max(160, "Questions must be 160 characters or fewer"),
  details: z.string().trim().max(1000, "Details must be 1000 characters or fewer").optional().transform((value) => value || null),
  membersOnly: z.boolean().default(false),
  poll: pollInputSchema,
});

/** `::poll{id="…"}` (or `#id`), on its own line: the polls a page holds. */
export const POLL_DIRECTIVE = /^[ \t]*::poll\{[^}\n]*?(?:id="?([0-9a-f-]{36})"?|#([0-9a-f-]{36}))[^}\n]*\}[ \t]*$/gim;
export function pollIdsIn(markdown: string) {
  return Array.from(markdown.matchAll(POLL_DIRECTIVE)).map((match) => (match[1] ?? match[2]).toLowerCase());
}

const key = (circleId: string) => `wiki-polls/${circleId}.json`;
const MAX_POLLS = 300;

function normalize(raw: unknown): WikiPoll[] {
  const polls = (raw as { polls?: unknown } | null)?.polls;
  return Array.isArray(polls) ? (polls as WikiPoll[]) : [];
}

export async function listWikiPolls(circleId: string): Promise<WikiPoll[]> {
  return normalize(await readJson(key(circleId)));
}

export async function getWikiPoll(circleId: string, id: string): Promise<WikiPoll | null> {
  return (await listWikiPolls(circleId)).find((entry) => entry.id === id) ?? null;
}

export type PollFailure = "not_found" | "forbidden" | VoteFailure;
export type PollResult = { ok: true; poll: WikiPoll | null } | { ok: false; reason: PollFailure };

function mutate(circleId: string, change: (polls: WikiPoll[]) => { polls: WikiPoll[]; poll: WikiPoll | null } | PollFailure): Promise<PollResult> {
  return enqueue<PollResult>(key(circleId), async () => {
    const result = change(normalize(await readJson(key(circleId))));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(key(circleId), { polls: result.polls });
    return { ok: true, poll: result.poll };
  });
}

export async function createWikiPoll(
  circleId: string,
  author: { id: string; name: string },
  input: { question: string; details: string | null; membersOnly: boolean; poll: PollInput }
) {
  const poll: WikiPoll = {
    id: randomUUID(),
    question: input.question,
    details: input.details,
    authorId: author.id,
    authorName: author.name,
    createdAt: new Date().toISOString(),
    ...(input.membersOnly ? { membersOnly: true } : {}),
    poll: newPoll(input.poll),
  };
  await mutate(circleId, (polls) => ({ polls: [...polls, poll].slice(-MAX_POLLS), poll }));
  return poll;
}

/** Apply a change to one poll. */
function update(circleId: string, id: string, change: (entry: WikiPoll) => WikiPoll | PollFailure) {
  return mutate(circleId, (polls) => {
    const entry = polls.find((candidate) => candidate.id === id);
    if (!entry) return "not_found";
    const next = change(entry);
    if (typeof next === "string") return next;
    return { polls: polls.map((candidate) => (candidate.id === id ? next : candidate)), poll: next };
  });
}

export function voteInWikiPoll(circleId: string, id: string, user: { id: string; name: string }, optionIds: string[], newOption?: string) {
  return update(circleId, id, (entry) => {
    const poll = castVote(entry.poll, user, optionIds, newOption);
    return typeof poll === "string" ? poll : { ...entry, poll };
  });
}

/** Its author may close or reopen a poll — and so may those who moderate the wiki. */
export function setWikiPollClosed(circleId: string, id: string, actor: { id: string; canModerate: boolean }, closed: boolean) {
  return update(circleId, id, (entry) => (actor.canModerate || entry.authorId === actor.id ? { ...entry, poll: withClosed(entry.poll, closed) } : "forbidden"));
}

/** Mark polls as announced; returns the ones that weren't yet. */
export async function claimAnnouncements(circleId: string, ids: string[]): Promise<WikiPoll[]> {
  if (!ids.length) return [];
  let fresh: WikiPoll[] = [];
  await mutate(circleId, (polls) => {
    fresh = polls.filter((entry) => ids.includes(entry.id) && !entry.announced);
    if (!fresh.length) return { polls, poll: null };
    return { polls: polls.map((entry) => (fresh.includes(entry) ? { ...entry, announced: true } : entry)), poll: null };
  });
  return fresh;
}

/** Remove a circle's polls (when the circle is deleted). */
export function deleteWikiPolls(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}

/**
 * Who does what with a circle's polls. Everyone signed in sees and votes in
 * them (members-only polls: the circle's members). Whoever edits the
 * circle's wiki adds them; admins — and, outside Community, the wiki's
 * editors — can close anyone's.
 */
export async function pollsContext(circleId: string) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const community = circleId === "community";
  const editor = canUploadTo(ctx.user, ctx.directory, circleId);
  const personId = ctx.user.personId ?? null;
  return {
    user: ctx.user,
    circle,
    canCreate: featureEnabled(circle, "wiki") && editor,
    canModerate: isAdmin(ctx.user) || (!community && editor),
    /** Whether you can vote in a members-only poll. */
    isMember: community || (!!personId && circle.seats.some((seat) => seat.personId === personId)),
    memberIds: circle.seats.map((seat) => seat.personId),
  };
}

/** Map a poll failure to an HTTP problem response. */
export function pollProblem(reason: PollFailure) {
  switch (reason) {
    case "not_found":
      return problem("That poll no longer exists", 404, "Not Found");
    case "forbidden":
      return problem("Only the poll's author or the wiki's moderators can do that", 403, "Forbidden");
    case "poll_closed":
      return problem("This poll is closed", 409, "Conflict");
    case "invalid_vote":
      return problem("Choose one of the poll's options");
    case "no_new_options":
      return problem("This poll doesn't take new options", 409, "Conflict");
    case "options_full":
      return problem("This poll has as many options as it can hold", 409, "Conflict");
  }
}
