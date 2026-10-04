import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { groupContext, groupProblem, shareGroupPost } from "@/lib/groups/http";
import { getGroupPoll } from "@/lib/groups/polls";
import { addPost, getThread, postInputSchema, removeThread } from "@/lib/groups/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: { id: string; threadId: string } };

/** A conversation: its messages, its poll, and what you can do. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const [doc, poll] = await Promise.all([
    getThread(params.id, params.threadId),
    getGroupPoll(params.id, params.threadId),
  ]);
  if (!doc) return problem("That conversation no longer exists", 404);
  return NextResponse.json(
    {
      thread: doc.thread,
      posts: doc.posts,
      poll: poll?.poll ?? null,
      pollAuthorPersonId: poll?.authorPersonId ?? null,
      circle: { id: ctx.circle.id, name: ctx.circle.name },
      address: ctx.address,
      canPost: ctx.canPost,
      canModerate: ctx.canModerate,
      personId: ctx.personId,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Reply; the reply is emailed to the circle's members. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "groups");
  if (limited) return limited;
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canPost) return problem(`Only ${ctx.circle.name}'s members reply here`, 403);
  const parsed = await readBody(request, postInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addPost(
    params.id,
    params.threadId,
    { userId: ctx.user.id, personId: ctx.personId, name: ctx.actor.name },
    { body: parsed.data.body, via: "web" }
  );
  if (!result.ok) return groupProblem(result.reason);
  const doc = await getThread(params.id, params.threadId);
  const emailed = await shareGroupPost(
    ctx.circle,
    result.thread,
    result.post,
    doc?.posts[0] ?? null,
    {
      exceptUserId: ctx.user.id,
    }
  );
  return NextResponse.json({ post: result.post, emailed }, { status: 201 });
}

/** Remove a whole conversation (the circle's members, the Board, admins). */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canModerate) return problem("Only the circle's members can remove a conversation", 403);
  if (!(await getThread(params.id, params.threadId)))
    return problem("That conversation no longer exists", 404);
  await removeThread(params.id, params.threadId);
  return NextResponse.json({ ok: true });
}
