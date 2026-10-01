import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admins";
import { commentUpdateSchema, deleteComment, editComment, setResolved } from "@/lib/wiki/comments";
import { pageContext } from "@/lib/wiki/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string; commentId: string } };

function commentProblem(reason: "not_found" | "forbidden" | "full" | "unknown_thread") {
  if (reason === "forbidden") return problem("You can't change that comment", 403, "Forbidden");
  return problem("That comment no longer exists", 404, "Not Found");
}

/** Edit your comment (`body`), or resolve / reopen a thread (`resolved`: its author, the page's editors, admins). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const parsed = commentUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Give the comment's text, or whether it's resolved");
  const result =
    "body" in parsed.data
      ? await editComment(ctx.page.id, params.commentId, { id: ctx.user.id }, parsed.data.body)
      : await setResolved(ctx.page.id, params.commentId, { id: ctx.user.id, name: ctx.user.name, canModerate: ctx.canEdit || isAdmin(ctx.user) }, parsed.data.resolved);
  return result.ok ? NextResponse.json({ comment: result.comment }) : commentProblem(result.reason);
}

/** Delete a comment: its author or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const result = await deleteComment(ctx.page.id, params.commentId, { id: ctx.user.id, admin: isAdmin(ctx.user) });
  return result.ok ? NextResponse.json({ ok: true }) : commentProblem(result.reason);
}
