import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { moveTopicThreads } from "@/lib/forum/store";
import { GENERAL_TOPIC_ID, deleteTopic, isTopicId, updateTopic, topicUpdateSchema } from "@/lib/forum/topics";
import { topicProblem } from "@/lib/forum/topics-http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { topicId: string } };

async function adminOnly() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  if (!isAdmin(user)) return problem("Only admins can change forum topics", 403, "Forbidden");
  return null;
}

/** Rename a topic or change its description (admins). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const denied = await adminOnly();
  if (denied) return denied;
  if (!isTopicId(params.topicId)) return topicProblem("not_found");
  const parsed = topicUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await updateTopic(params.topicId, parsed.data);
  return result.ok ? NextResponse.json({ topic: result.value }) : topicProblem(result.reason);
}

/** Remove a topic (admins); its discussions move to General. */
export async function DELETE(_request: Request, { params }: Params) {
  const denied = await adminOnly();
  if (denied) return denied;
  if (!isTopicId(params.topicId)) return topicProblem("not_found");
  const result = await deleteTopic(params.topicId);
  if (!result.ok) return topicProblem(result.reason);
  const moved = await moveTopicThreads(params.topicId, GENERAL_TOPIC_ID);
  return NextResponse.json({ ok: true, moved });
}
