import { NextRequest, NextResponse } from "next/server";
import { commentUpdateSchema, deleteComment, editComment, setResolved } from "@/lib/wiki/comments";
import { commentProblem, pageContext } from "@/lib/wiki/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string; commentId: string } };

/** Edit your comment (`body`), or resolve / reopen a thread (`resolved`: its author, the page's editors, admins). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const parsed = commentUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Give the comment's text, or whether it's resolved");
  const result =
    "body" in parsed.data
      ? await editComment(
          ctx.page.id,
          params.commentId,
          { ...ctx.actor, canModerate: ctx.actor.admin },
          parsed.data.body
        )
      : await setResolved(
          ctx.page.id,
          params.commentId,
          { ...ctx.actor, canModerate: ctx.canEdit || ctx.actor.admin },
          parsed.data.resolved
        );
  return result.ok ? NextResponse.json({ comment: result.comment }) : commentProblem(result.reason);
}

/** Delete a comment: its author or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const result = await deleteComment(ctx.page.id, params.commentId, {
    ...ctx.actor,
    canModerate: ctx.actor.admin,
  });
  return result.ok ? NextResponse.json({ ok: true }) : commentProblem(result.reason);
}
