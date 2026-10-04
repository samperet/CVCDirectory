import { mutateJson, readJson } from "@/lib/storage";
import { castVote, newPoll, withClosed, type PollInput } from "@/lib/polls/server";
import type { VoteFailure } from "@/lib/polls/shared";
import type { GroupPoll } from "./shared";

/**
 * A conversation's poll, in a document of its own
 * (`groups/<circleId>/polls/<threadId>.json`) so many people answering at
 * once never compete with replies. Votes are keyed by directory person id
 * — the same whether someone answers in the app or with a link in an email —
 * and answering again changes the answer.
 */

const key = (circleId: string, threadId: string) => `groups/${circleId}/polls/${threadId}.json`;

const normalize = (raw: unknown): GroupPoll | null => {
  const value = raw as GroupPoll | null;
  return value?.poll && Array.isArray(value.poll.options) ? value : null;
};

export async function getGroupPoll(circleId: string, threadId: string) {
  return normalize(await readJson(key(circleId, threadId)));
}

export function createGroupPoll(
  circleId: string,
  threadId: string,
  input: PollInput,
  authorPersonId: string | null
) {
  return mutateJson<GroupPoll>(key(circleId, threadId), (raw) => {
    const existing = normalize(raw);
    if (existing) return { write: false, result: existing };
    const created: GroupPoll = { threadId, circleId, poll: newPoll(input), authorPersonId };
    return { value: created, result: created };
  });
}

/** Record a person's answer (replacing an earlier one); empty takes it back. */
export function voteInGroupPoll(
  circleId: string,
  threadId: string,
  voter: { personId: string; name: string },
  optionIds: string[]
) {
  return mutateJson<GroupPoll | VoteFailure | "not_found">(key(circleId, threadId), (raw) => {
    const current = normalize(raw);
    if (!current) return { write: false, result: "not_found" };
    const poll = castVote(current.poll, { userId: voter.personId, name: voter.name }, optionIds);
    if (typeof poll === "string") return { write: false, result: poll };
    const next = { ...current, poll };
    return { value: next, result: next };
  });
}

export function setGroupPollClosed(circleId: string, threadId: string, closed: boolean) {
  return mutateJson<GroupPoll | "not_found">(key(circleId, threadId), (raw) => {
    const current = normalize(raw);
    if (!current) return { write: false, result: "not_found" };
    const next = { ...current, poll: withClosed(current.poll, closed) };
    return { value: next, result: next };
  });
}
