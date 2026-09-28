import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deleteReply, editReply, replyUpdateSchema } from "@/lib/forum/store";
import { forumProblem } from "@/lib/forum/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; replyId: string } };

/** Edit your own reply. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to edit", 401, "Unauthorized");

  const parsed = replyUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  const result = await editReply(params.id, user.id, params.replyId, parsed.data.body);
  return result.ok ? NextResponse.json(result.doc) : forumProblem(result.reason);
}

/** Delete your own reply (a placeholder remains if others replied to it). */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to delete", 401, "Unauthorized");

  const result = await deleteReply(params.id, user.id, params.replyId);
  return result.ok ? NextResponse.json(result.doc) : forumProblem(result.reason);
}
