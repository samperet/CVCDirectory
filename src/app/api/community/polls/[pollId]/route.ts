import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { deleteCommunityPoll, setCommunityPollClosed, voteInCommunityPoll } from "@/lib/polls/community";
import { pollUpdateSchema, voteSchema } from "@/lib/polls/server";
import { problem } from "@/lib/http";
import { pollProblem } from "@/lib/polls/http";

export const dynamic = "force-dynamic";

type Params = { params: { pollId: string } };

/** Vote (`optionIds`), replacing your earlier vote; an empty list takes it back. */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to vote", 401, "Unauthorized");
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Choose one of the poll's options");
  const result = await voteInCommunityPoll(params.pollId, { id: user.id, name: user.name }, parsed.data.optionIds);
  return result.ok ? NextResponse.json({ poll: result.poll }) : pollProblem(result.reason);
}

/** Close or reopen (`closed`): the poll's author or an admin. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  const parsed = pollUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Say whether the poll is closed");
  const result = await setCommunityPollClosed(params.pollId, { id: user.id, admin: isAdmin(user) }, parsed.data.closed);
  return result.ok ? NextResponse.json({ poll: result.poll }) : pollProblem(result.reason);
}

/** Delete a poll: its author or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  const result = await deleteCommunityPoll(params.pollId, { id: user.id, admin: isAdmin(user) });
  return result.ok ? NextResponse.json({ ok: true }) : pollProblem(result.reason);
}
