import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { excerpt, notify } from "@/lib/push/notify";
import { createThread, listThreads, threadInputSchema, topicOf } from "@/lib/forum/store";
import { getTopic } from "@/lib/forum/topics";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Discussions, most recently active first; `topic` narrows them to one topic. */
export async function GET(request: NextRequest) {
  const topic = request.nextUrl.searchParams.get("topic");
  const threads = await listThreads();
  return NextResponse.json({ threads: topic ? threads.filter((thread) => topicOf(thread) === topic) : threads });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`forum:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to start a discussion", 401, "Unauthorized");
  }

  const parsed = threadInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const topic = await getTopic(parsed.data.topicId);
  if (!topic) return problem("That topic no longer exists", 404, "Not Found");

  const doc = await createThread({ id: user.id, name: user.name }, parsed.data);
  await notify({
    topic: "discussions",
    title: `${doc.thread.poll ? "New poll" : "New discussion"} in ${topic.name}: ${doc.thread.title}`,
    body: doc.thread.poll && !doc.thread.body
      ? `${user.name} asks: ${doc.thread.poll.options.map((option) => option.text).join(" · ")}`
      : `${user.name}: ${excerpt(doc.thread.body)}`,
    url: `/forum/${doc.thread.id}`,
    tag: `forum-${doc.thread.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json(doc, { status: 201 });
}
