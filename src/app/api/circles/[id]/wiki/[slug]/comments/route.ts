import { NextRequest, NextResponse } from "next/server";
import { featureEnabled } from "@/lib/circles/features";
import { addComment, commentInputSchema, listComments } from "@/lib/wiki/comments";
import { wikiContext, wikiProblem } from "@/lib/wiki/http";
import { getPage, isSlug } from "@/lib/wiki/store";
import { excerpt, notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; slug: string } };

async function load(params: Params["params"]) {
  const ctx = await wikiContext(params.id);
  if ("error" in ctx) return { error: ctx.error };
  const page = isSlug(params.slug) ? await getPage(params.id, params.slug) : null;
  if (!page) return { error: wikiProblem("not_found") };
  return { ...ctx, page };
}

/** A page's comments, oldest first. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ comments: await listComments(params.id, ctx.page.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Comment on the page (optionally on a passage, `quote`), or reply in a thread (`parentId`): any resident. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`wiki-comment:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  if (!featureEnabled(ctx.circle, "wiki")) return problem(`${ctx.circle.name} has turned its wiki off`, 409, "Conflict");
  const parsed = commentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await addComment(params.id, ctx.page.id, { id: ctx.user.id, name: ctx.user.name }, parsed.data);
  if (!result.ok) return result.reason === "unknown_thread" ? problem("That comment thread no longer exists", 404, "Not Found") : problem("This wiki has too many comments", 409, "Conflict");

  // Tell the people who wrote the page, and the others in this thread.
  const writers = new Set([ctx.page.createdBy.userId, ctx.page.updatedBy.userId, ...ctx.page.history.map((version) => version.editedBy.userId)]);
  const inThread = result.thread.map((entry) => entry.authorId);
  const recipients = Array.from(new Set([...writers, ...inThread]));
  await notify({
    topic: "wiki",
    title: `${ctx.user.name} commented on “${ctx.page.title}”`,
    body: excerpt(parsed.data.body),
    url: `/circles/${params.id}/wiki/${ctx.page.slug}#comments`,
    tag: `wiki-comments-${ctx.page.id}`,
    exceptUserId: ctx.user.id,
    onlyUserIds: recipients,
  });
  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
