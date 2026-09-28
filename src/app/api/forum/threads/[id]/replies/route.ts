import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { excerpt, notify } from "@/lib/push/notify";
import { addReply, replyInputSchema } from "@/lib/forum/store";
import { forumProblem } from "@/lib/forum/http";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(`forum:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to reply", 401, "Unauthorized");
  }

  const parsed = replyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const result = await addReply(params.id, { id: user.id, name: user.name }, parsed.data);
  if (!result.ok) return forumProblem(result.reason);
  // Tell the people in this discussion: whoever started it and everyone who has replied.
  const { thread, replies } = result.doc;
  const participants = Array.from(new Set([thread.authorId, ...replies.filter((reply) => !reply.deletedAt).map((reply) => reply.authorId)]));
  await notify({
    topic: "replies",
    title: `${user.name} replied in “${thread.title}”`,
    body: excerpt(parsed.data.body),
    url: `/forum/${thread.id}`,
    tag: `forum-${thread.id}`,
    exceptUserId: user.id,
    onlyUserIds: participants,
  });
  return NextResponse.json(result.doc, { status: 201 });
}
