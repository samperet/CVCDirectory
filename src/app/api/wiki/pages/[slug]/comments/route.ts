import { NextRequest, NextResponse } from "next/server";
import { addComment, commentInputSchema, listComments } from "@/lib/wiki/comments";
import { commentProblem, pageAudience, pageContext } from "@/lib/wiki/http";
import { getHistory } from "@/lib/wiki/store";
import { excerpt, notify } from "@/lib/push/notify";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/** A page's comments, oldest first. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    { comments: await listComments(ctx.page.id) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Comment on a passage of the page (`quote`), or reply in a thread (`parentId`): anyone who can see it. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "wiki-comment");
  if (limited) return limited;
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, commentInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addComment(ctx.page.id, ctx.actor, parsed.data);
  if (!result.ok) return commentProblem(result.reason);

  // Tell the people who wrote the page, and the others in this thread (who can still see it).
  const history = await getHistory(ctx.page.id);
  const writers = new Set([
    ctx.page.createdBy.userId,
    ctx.page.updatedBy.userId,
    ...history.map((version) => version.editedBy.userId),
  ]);
  const inThread = result.thread.map((entry) => entry.authorId);
  const audience = await pageAudience(ctx.directory, ctx.page);
  const recipients = Array.from(new Set([...writers, ...inThread])).filter(
    (id) => !audience || audience.includes(id)
  );
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
