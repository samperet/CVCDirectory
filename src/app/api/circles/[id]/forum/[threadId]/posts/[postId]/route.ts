import { NextRequest, NextResponse } from "next/server";
import { readBody } from "@/lib/http";
import { groupContext, groupProblem } from "@/lib/groups/http";
import { deletePost, editPost, postInputSchema } from "@/lib/groups/store";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; threadId: string; postId: string } };

/** Edit your own message (on the web; emails already sent stay as they were). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, postInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await editPost(
    params.id,
    params.threadId,
    params.postId,
    { userId: ctx.user.id, personId: ctx.personId, name: ctx.actor.name, canModerate: false },
    parsed.data.body
  );
  return result.ok ? NextResponse.json({ ok: true }) : groupProblem(result.reason);
}

/** Delete your own message — or any, for the circle's members, the Board, and admins. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const result = await deletePost(params.id, params.threadId, params.postId, {
    userId: ctx.user.id,
    personId: ctx.personId,
    name: ctx.actor.name,
    canModerate: ctx.canModerate,
  });
  return result.ok ? NextResponse.json({ ok: true }) : groupProblem(result.reason);
}
