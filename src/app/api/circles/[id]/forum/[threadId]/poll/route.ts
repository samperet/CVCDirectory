import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { pollUpdateSchema } from "@/lib/polls/server";
import { z } from "zod";
import { groupContext } from "@/lib/groups/http";
import { setGroupPollClosed, voteInGroupPoll, getGroupPoll } from "@/lib/groups/polls";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; threadId: string } };

const voteSchema = z.object({ optionIds: z.array(z.string().uuid()).max(30) });

const voteProblem = (reason: string) =>
  reason === "poll_closed"
    ? problem("This poll has closed", 409)
    : reason === "not_found"
      ? problem("That poll no longer exists", 404)
      : problem("That isn't one of the poll's options");

/** Answer the conversation's poll (the circle's members); answering again changes it. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "poll-vote");
  if (limited) return limited;
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canPost) return problem(`Only ${ctx.circle.name}'s members answer this poll`, 403);
  const parsed = await readBody(request, voteSchema);
  if ("error" in parsed) return parsed.error;
  const result = await voteInGroupPoll(
    params.id,
    params.threadId,
    { personId: ctx.personId, name: ctx.actor.name },
    parsed.data.optionIds
  );
  return typeof result === "string"
    ? voteProblem(result)
    : NextResponse.json({ poll: result.poll });
}

/** Close or reopen the poll (whoever asked it, or the circle's members). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const current = await getGroupPoll(params.id, params.threadId);
  if (!current) return problem("That poll no longer exists", 404);
  if (!ctx.canModerate && current.authorPersonId !== ctx.personId)
    return problem("Only whoever asked can close this poll", 403);
  const parsed = await readBody(request, pollUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await setGroupPollClosed(params.id, params.threadId, parsed.data.closed);
  return typeof result === "string"
    ? voteProblem(result)
    : NextResponse.json({ poll: result.poll });
}
