import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { pollUpdateSchema, setPollClosed, vote, voteSchema } from "@/lib/forum/store";
import { forumProblem } from "@/lib/forum/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Vote in the discussion's poll (`optionIds`), replacing your earlier vote; an empty list takes it back. */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to vote", 401, "Unauthorized");
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await vote(params.id, { id: user.id, name: user.name }, parsed.data.optionIds, parsed.data.newOption);
  return result.ok ? NextResponse.json(result.doc) : forumProblem(result.reason);
}

/** Close or reopen the poll (`closed`): its author or an admin. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  const parsed = pollUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Say whether the poll is closed");
  const result = await setPollClosed(params.id, { id: user.id, admin: isAdmin(user) }, parsed.data.closed);
  return result.ok ? NextResponse.json(result.doc) : forumProblem(result.reason);
}
