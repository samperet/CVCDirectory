import { NextRequest, NextResponse } from "next/server";
import { deleteCirclePoll, getCirclePoll, setCirclePollClosed, voteInCirclePoll } from "@/lib/polls/circle";
import { pollUpdateSchema, voteSchema } from "@/lib/polls/server";
import { pollProblem, pollsContext } from "@/lib/polls/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; pollId: string } };

/**
 * Vote (`optionIds`), replacing your earlier vote; an empty list takes it
 * back. `newOption` adds an option of your own and votes for it, where the
 * poll allows that. Members-only polls take only the circle's members' votes.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await pollsContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const entry = await getCirclePoll(params.id, params.pollId);
  if (!entry) return pollProblem("not_found");
  if (entry.membersOnly && !ctx.isMember) return problem(`Only ${ctx.circle.name}'s members can vote in this poll`, 403, "Forbidden");
  const result = await voteInCirclePoll(params.id, params.pollId, { id: ctx.user.id, name: ctx.user.name }, parsed.data.optionIds, parsed.data.newOption);
  return result.ok ? NextResponse.json({ poll: result.poll }) : pollProblem(result.reason);
}

/** Close or reopen (`closed`): the poll's author, or the section's moderators. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await pollsContext(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = pollUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Say whether the poll is closed");
  const result = await setCirclePollClosed(params.id, params.pollId, { id: ctx.user.id, canModerate: ctx.canModerate }, parsed.data.closed);
  return result.ok ? NextResponse.json({ poll: result.poll }) : pollProblem(result.reason);
}

/** Delete a poll: its author, or the section's moderators. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await pollsContext(params.id);
  if ("error" in ctx) return ctx.error;
  const result = await deleteCirclePoll(params.id, params.pollId, { id: ctx.user.id, canModerate: ctx.canModerate });
  return result.ok ? NextResponse.json({ ok: true }) : pollProblem(result.reason);
}
