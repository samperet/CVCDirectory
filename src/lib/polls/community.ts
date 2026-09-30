import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";
import type { Poll } from "./shared";
import { PollInput, castVote, newPoll, pollInputSchema, withClosed } from "./server";

/**
 * Polls on the Community page: any resident asks the whole community a
 * question. They live in one document, newest last, capped so it stays
 * small. Their author or an admin can close, reopen, or delete them.
 */

export interface CommunityPoll {
  id: string;
  question: string;
  details: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  poll: Poll;
}

export const communityPollInputSchema = z.object({
  question: z.string().trim().min(3, "Ask a question (at least 3 characters)").max(160, "Questions must be 160 characters or fewer"),
  details: z.string().trim().max(1000, "Details must be 1000 characters or fewer").optional().transform((value) => value || null),
  poll: pollInputSchema,
});

const KEY = "community/polls.json";
const MAX_POLLS = 200;

function normalize(raw: unknown): CommunityPoll[] {
  const polls = (raw as { polls?: unknown } | null)?.polls;
  return Array.isArray(polls) ? (polls as CommunityPoll[]) : [];
}

/** Newest first. */
export async function listCommunityPolls(): Promise<CommunityPoll[]> {
  return normalize(await readJson(KEY)).slice().reverse();
}

type Failure = "not_found" | "forbidden" | "poll_closed" | "invalid_vote";
export type PollResult = { ok: true; poll: CommunityPoll | null } | { ok: false; reason: Failure };

async function mutate(change: (polls: CommunityPoll[]) => { polls: CommunityPoll[]; poll: CommunityPoll | null } | Failure): Promise<PollResult> {
  return enqueue<PollResult>(KEY, async () => {
    const result = change(normalize(await readJson(KEY)));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(KEY, { polls: result.polls });
    return { ok: true, poll: result.poll };
  });
}

export async function createCommunityPoll(author: { id: string; name: string }, input: { question: string; details: string | null; poll: PollInput }) {
  const poll: CommunityPoll = {
    id: randomUUID(),
    question: input.question,
    details: input.details,
    authorId: author.id,
    authorName: author.name,
    createdAt: new Date().toISOString(),
    poll: newPoll(input.poll),
  };
  await mutate((polls) => ({ polls: [...polls, poll].slice(-MAX_POLLS), poll }));
  return poll;
}

/** Apply a change to one poll. */
function update(id: string, change: (entry: CommunityPoll) => CommunityPoll | Failure) {
  return mutate((polls) => {
    const entry = polls.find((candidate) => candidate.id === id);
    if (!entry) return "not_found";
    const next = change(entry);
    if (typeof next === "string") return next;
    return { polls: polls.map((candidate) => (candidate.id === id ? next : candidate)), poll: next };
  });
}

export function voteInCommunityPoll(id: string, user: { id: string; name: string }, optionIds: string[]) {
  return update(id, (entry) => {
    const poll = castVote(entry.poll, user, optionIds);
    return typeof poll === "string" ? poll : { ...entry, poll };
  });
}

const mayChange = (entry: CommunityPoll, actor: { id: string; admin: boolean }) => actor.admin || entry.authorId === actor.id;

export function setCommunityPollClosed(id: string, actor: { id: string; admin: boolean }, closed: boolean) {
  return update(id, (entry) => (mayChange(entry, actor) ? { ...entry, poll: withClosed(entry.poll, closed) } : "forbidden"));
}

export function deleteCommunityPoll(id: string, actor: { id: string; admin: boolean }) {
  return mutate((polls) => {
    const entry = polls.find((candidate) => candidate.id === id);
    if (!entry) return "not_found";
    if (!mayChange(entry, actor)) return "forbidden";
    return { polls: polls.filter((candidate) => candidate.id !== id), poll: null };
  });
}
