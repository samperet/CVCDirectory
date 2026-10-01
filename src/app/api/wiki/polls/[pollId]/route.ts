import { NextRequest, NextResponse } from "next/server";
import { getWikiPoll, pollAccess, pollProblem, setWikiPollClosed, voteInWikiPoll, type WikiPoll } from "@/lib/polls/wiki";
import { pollUpdateSchema, voteSchema } from "@/lib/polls/server";
import { wikiSession } from "@/lib/wiki/http";
import type { DirectoryDocument } from "@/lib/directory/types";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { pollId: string } };

const withAccess = (user: { id: string; personId?: string | null }, directory: DirectoryDocument, poll: WikiPoll | null) => {
  if (!poll) return null;
  const { memberIds: _members, ...access } = pollAccess(user, directory, poll);
  return { ...poll, ...access };
};

/**
 * Vote (`optionIds`), replacing your earlier vote; an empty list takes it
 * back. `newOption` adds an option of your own and votes for it, where the
 * poll allows that. Members-only polls take only its circle's members' votes.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const entry = await getWikiPoll(params.pollId);
  if (!entry) return pollProblem("not_found");
  const access = pollAccess(ctx.user, ctx.directory, entry);
  if (!access.canVote) return problem(`Only ${access.circleName}'s members can vote in this poll`, 403, "Forbidden");
  const result = await voteInWikiPoll(params.pollId, { id: ctx.user.id, name: ctx.user.name }, parsed.data.optionIds, parsed.data.newOption);
  return result.ok ? NextResponse.json({ poll: withAccess(ctx.user, ctx.directory, result.poll) }) : pollProblem(result.reason);
}

/** Close or reopen (`closed`): the poll's author, its circle's members, or admins. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const parsed = pollUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Say whether the poll is closed");
  const entry = await getWikiPoll(params.pollId);
  if (!entry) return pollProblem("not_found");
  const result = await setWikiPollClosed(params.pollId, { id: ctx.user.id, canModerate: pollAccess(ctx.user, ctx.directory, entry).canClose }, parsed.data.closed);
  return result.ok ? NextResponse.json({ poll: withAccess(ctx.user, ctx.directory, result.poll) }) : pollProblem(result.reason);
}
