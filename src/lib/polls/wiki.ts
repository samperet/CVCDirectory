import { randomUUID } from "crypto";
import { z } from "zod";
import { canUploadTo } from "@/lib/documents/access";
import { isAdmin } from "@/lib/auth/admins";
import { problem } from "@/lib/http";
import { mutateJson, readJson } from "@/lib/storage";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Poll, VoteFailure } from "./shared";
import { PollInput, castVote, newPoll, pollInputSchema, withClosed } from "./server";

/**
 * Polls inside wiki pages. A page holds a poll as `::poll{id="…"}`; the
 * poll itself (question, options, votes) lives with every other wiki poll
 * in one document (`wiki/polls.json`). Whoever can edit a page adds polls to
 * it; a poll belongs to the page's keeper circle as it was added, and can be
 * for that circle's members only. A poll is announced the first time a page
 * holding it is saved.
 */

export interface WikiPoll {
  id: string;
  /** The circle it belongs to (whose members vote, when it's members-only). */
  circleId: string;
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

const KEY = "wiki/polls.json";
const MAX_POLLS = 3000;

function normalize(raw: unknown): WikiPoll[] {
  const polls = (raw as { polls?: unknown } | null)?.polls;
  return Array.isArray(polls) ? (polls as WikiPoll[]) : [];
}

export async function listWikiPolls(): Promise<WikiPoll[]> {
  return normalize(await readJson(KEY));
}

export async function getWikiPoll(id: string): Promise<WikiPoll | null> {
  return (await listWikiPolls()).find((entry) => entry.id === id) ?? null;
}

export type PollFailure = "not_found" | "forbidden" | VoteFailure;
export type PollResult = { ok: true; poll: WikiPoll | null } | { ok: false; reason: PollFailure };

function mutate(change: (polls: WikiPoll[]) => { polls: WikiPoll[]; poll: WikiPoll | null } | PollFailure): Promise<PollResult> {
  return mutateJson<PollResult>(KEY, (raw) => {
    const result = change(normalize(raw));
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return { value: { polls: result.polls }, result: { ok: true, poll: result.poll } };
  });
}

export async function createWikiPoll(
  circleId: string,
  author: { id: string; name: string },
  input: { question: string; details: string | null; membersOnly: boolean; poll: PollInput }
) {
  const poll: WikiPoll = {
    id: randomUUID(),
    circleId,
    question: input.question,
    details: input.details,
    authorId: author.id,
    authorName: author.name,
    createdAt: new Date().toISOString(),
    ...(input.membersOnly ? { membersOnly: true } : {}),
    poll: newPoll(input.poll),
  };
  await mutate((polls) => ({ polls: [...polls, poll].slice(-MAX_POLLS), poll }));
  return poll;
}

/** Apply a change to one poll. */
function update(id: string, change: (entry: WikiPoll) => WikiPoll | PollFailure) {
  return mutate((polls) => {
    const entry = polls.find((candidate) => candidate.id === id);
    if (!entry) return "not_found";
    const next = change(entry);
    if (typeof next === "string") return next;
    return { polls: polls.map((candidate) => (candidate.id === id ? next : candidate)), poll: next };
  });
}

export function voteInWikiPoll(id: string, user: { id: string; name: string }, optionIds: string[], newOption?: string) {
  return update(id, (entry) => {
    const poll = castVote(entry.poll, user, optionIds, newOption);
    return typeof poll === "string" ? poll : { ...entry, poll };
  });
}

/** Its author may close or reopen a poll — and so may those who moderate the wiki. */
export function setWikiPollClosed(id: string, actor: { id: string; canModerate: boolean }, closed: boolean) {
  return update(id, (entry) => (actor.canModerate || entry.authorId === actor.id ? { ...entry, poll: withClosed(entry.poll, closed) } : "forbidden"));
}

/** Mark polls as announced; returns the ones that weren't yet. */
export async function claimAnnouncements(ids: string[]): Promise<WikiPoll[]> {
  if (!ids.length) return [];
  let fresh: WikiPoll[] = [];
  await mutate((polls) => {
    fresh = polls.filter((entry) => ids.includes(entry.id) && !entry.announced);
    if (!fresh.length) return { polls, poll: null };
    return { polls: polls.map((entry) => (fresh.includes(entry) ? { ...entry, announced: true } : entry)), poll: null };
  });
  return fresh;
}

/**
 * What a resident can do with a poll. Everyone signed in sees and votes in
 * it (members-only polls: its circle's members). Its author can close it,
 * and so can admins and — outside Community — its circle's members.
 */
export function pollAccess(user: { id: string; personId?: string | null; isAdmin?: boolean }, directory: DirectoryDocument, poll: WikiPoll) {
  const circle = directory.circles.find((entry) => entry.id === poll.circleId);
  const community = poll.circleId === "community";
  const member = community || (!!user.personId && !!circle?.seats.some((seat) => seat.personId === user.personId));
  return {
    circleName: circle?.name ?? "the circle",
    canClose: poll.authorId === user.id || isAdmin(user) || (!community && canUploadTo(user, directory, poll.circleId)),
    canVote: !poll.membersOnly || member,
    memberIds: circle?.seats.map((seat) => seat.personId) ?? [],
  };
}

/** Map a poll failure to an HTTP problem response. */
export function pollProblem(reason: PollFailure) {
  switch (reason) {
    case "not_found":
      return problem("That poll no longer exists", 404);
    case "forbidden":
      return problem("Only the poll's author or the wiki's moderators can do that", 403);
    case "poll_closed":
      return problem("This poll is closed", 409);
    case "invalid_vote":
      return problem("Choose one of the poll's options");
    case "no_new_options":
      return problem("This poll doesn't take new options", 409);
    case "options_full":
      return problem("This poll has as many options as it can hold", 409);
  }
}
