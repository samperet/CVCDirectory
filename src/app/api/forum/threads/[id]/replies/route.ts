import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { excerpt, notify } from "@/lib/push/notify";
import { addReply, replyInputSchema } from "@/lib/forum/store";
import { forumProblem } from "@/lib/forum/http";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const limited = throttled(request, "forum");
  if (limited) return limited;

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to reply", 401);
  }

  const parsed = await readBody(request, replyInputSchema);
  if ("error" in parsed) return parsed.error;

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
