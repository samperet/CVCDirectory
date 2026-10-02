import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { excerpt, notify } from "@/lib/push/notify";
import { createThread, listThreads, threadInputSchema, topicOf } from "@/lib/forum/store";
import { getTopic, listTopics } from "@/lib/forum/topics";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Discussions, most recently active first; `topic` narrows them to one topic. */
export async function GET(request: NextRequest) {
  const topic = request.nextUrl.searchParams.get("topic");
  const [threads, topics] = await Promise.all([listThreads(), listTopics()]);
  const known = new Set(topics.map((entry) => entry.id));
  return NextResponse.json({
    threads: topic ? threads.filter((thread) => topicOf(thread, known) === topic) : threads,
  });
}

export async function POST(request: NextRequest) {
  const limited = throttled(request, "forum");
  if (limited) return limited;

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to start a discussion", 401);
  }

  const parsed = await readBody(request, threadInputSchema);
  if ("error" in parsed) return parsed.error;

  const topic = await getTopic(parsed.data.topicId);
  if (!topic) return problem("That topic no longer exists", 404);

  const doc = await createThread({ id: user.id, name: user.name }, parsed.data);
  await notify({
    topic: "discussions",
    title: `New discussion in ${topic.name}: ${doc.thread.title}`,
    body: `${user.name}: ${excerpt(doc.thread.body)}`,
    url: `/forum/${doc.thread.id}`,
    tag: `forum-${doc.thread.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json(doc, { status: 201 });
}
