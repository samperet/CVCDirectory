import { NextRequest, NextResponse } from "next/server";
import { addComment, commentInputSchema, listComments } from "@/lib/wiki/comments";
import { pageAudience, pageContext } from "@/lib/wiki/http";
import { getHistory } from "@/lib/wiki/store";
import { excerpt, notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/** A page's comments, oldest first. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ comments: await listComments(ctx.page.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Comment on the page (optionally on a passage, `quote`), or reply in a thread (`parentId`): anyone who can see it. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`wiki-comment:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const parsed = commentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await addComment(ctx.page.id, { id: ctx.user.id, name: ctx.user.name }, parsed.data);
  if (!result.ok) return result.reason === "unknown_thread" ? problem("That comment thread no longer exists", 404, "Not Found") : problem("This page has too many comments", 409, "Conflict");

  // Tell the people who wrote the page, and the others in this thread (who can still see it).
  const history = await getHistory(ctx.page.id);
  const writers = new Set([ctx.page.createdBy.userId, ctx.page.updatedBy.userId, ...history.map((version) => version.editedBy.userId)]);
  const inThread = result.thread.map((entry) => entry.authorId);
  const audience = await pageAudience(ctx.directory, ctx.page);
  const recipients = Array.from(new Set([...writers, ...inThread])).filter((id) => !audience || audience.includes(id));
  await notify({
    topic: "wiki",
    title: `${ctx.user.name} commented on “${ctx.page.title}”`,
    body: excerpt(parsed.data.body),
    url: `/wiki/${ctx.page.slug}#comments`,
    tag: `wiki-comments-${ctx.page.id}`,
    exceptUserId: ctx.user.id,
    onlyUserIds: recipients,
  });
  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
