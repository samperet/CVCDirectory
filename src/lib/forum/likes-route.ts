import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { setLike } from "@/lib/forum/store";
import { forumProblem } from "@/lib/forum/http";
import { problem } from "@/lib/http";

/** Shared handler for the like routes: PUT likes a post, DELETE takes the like back. */
export async function likeHandler(threadId: string, replyId: string | null, liked: boolean) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to like posts", 401);
  const result = await setLike(threadId, replyId, actorOf(user), liked);
  return result.ok ? NextResponse.json(result.doc) : forumProblem(result.reason);
}
