import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, readJson, writeJson } from "@/lib/storage";
import type { Poll, VoteFailure } from "./shared";
import { PollInput, castVote, newPoll, pollInputSchema, withClosed } from "./server";

/**
 * Polls in a circle's Polls section: on the Community page any resident asks
 * everyone a question; elsewhere a circle's members ask — everyone, or only
 * the circle's members (`membersOnly`). Each circle's live in one document,
 * newest last, capped so it stays small.
 */

export interface CirclePoll {
  id: string;
  question: string;
  details: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  /** Only the circle's members vote (everyone still sees the results). */
  membersOnly?: boolean;
  poll: Poll;
}

export const circlePollInputSchema = z.object({
  question: z.string().trim().min(3, "Ask a question (at least 3 characters)").max(160, "Questions must be 160 characters or fewer"),
  details: z.string().trim().max(1000, "Details must be 1000 characters or fewer").optional().transform((value) => value || null),
  membersOnly: z.boolean().default(false),
  poll: pollInputSchema,
});

// The Community page's polls keep the address they've always had.
const key = (circleId: string) => (circleId === "community" ? "community/polls.json" : `circle-polls/${circleId}.json`);
const MAX_POLLS = 200;

function normalize(raw: unknown): CirclePoll[] {
  const polls = (raw as { polls?: unknown } | null)?.polls;
  return Array.isArray(polls) ? (polls as CirclePoll[]) : [];
}

/** Newest first. */
export async function listCirclePolls(circleId: string): Promise<CirclePoll[]> {
  return normalize(await readJson(key(circleId))).slice().reverse();
}

export async function getCirclePoll(circleId: string, id: string): Promise<CirclePoll | null> {
  return normalize(await readJson(key(circleId))).find((entry) => entry.id === id) ?? null;
}

export type PollFailure = "not_found" | "forbidden" | VoteFailure;
export type PollResult = { ok: true; poll: CirclePoll | null } | { ok: false; reason: PollFailure };

function mutate(circleId: string, change: (polls: CirclePoll[]) => { polls: CirclePoll[]; poll: CirclePoll | null } | PollFailure): Promise<PollResult> {
  return enqueue<PollResult>(key(circleId), async () => {
    const result = change(normalize(await readJson(key(circleId))));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(key(circleId), { polls: result.polls });
    return { ok: true, poll: result.poll };
  });
}

export async function createCirclePoll(
  circleId: string,
  author: { id: string; name: string },
  input: { question: string; details: string | null; membersOnly: boolean; poll: PollInput }
) {
  const poll: CirclePoll = {
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
function update(circleId: string, id: string, change: (entry: CirclePoll) => CirclePoll | PollFailure) {
  return mutate(circleId, (polls) => {
    const entry = polls.find((candidate) => candidate.id === id);
    if (!entry) return "not_found";
    const next = change(entry);
    if (typeof next === "string") return next;
    return { polls: polls.map((candidate) => (candidate.id === id ? next : candidate)), poll: next };
  });
}

export function voteInCirclePoll(circleId: string, id: string, user: { id: string; name: string }, optionIds: string[], newOption?: string) {
  return update(circleId, id, (entry) => {
    const poll = castVote(entry.poll, user, optionIds, newOption);
    return typeof poll === "string" ? poll : { ...entry, poll };
  });
}

/** Its author may close, reopen, or delete a poll — and so may those who moderate the section. */
const mayChange = (entry: CirclePoll, actor: { id: string; canModerate: boolean }) => actor.canModerate || entry.authorId === actor.id;

export function setCirclePollClosed(circleId: string, id: string, actor: { id: string; canModerate: boolean }, closed: boolean) {
  return update(circleId, id, (entry) => (mayChange(entry, actor) ? { ...entry, poll: withClosed(entry.poll, closed) } : "forbidden"));
}

export function deleteCirclePoll(circleId: string, id: string, actor: { id: string; canModerate: boolean }) {
  return mutate(circleId, (polls) => {
    const entry = polls.find((candidate) => candidate.id === id);
    if (!entry) return "not_found";
    if (!mayChange(entry, actor)) return "forbidden";
    return { polls: polls.filter((candidate) => candidate.id !== id), poll: null };
  });
}

/** Remove a circle's polls (when the circle is deleted). */
export function deleteCirclePolls(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
