import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { listThreads, topicOf } from "@/lib/forum/store";
import { createTopic, listTopics, topicInputSchema } from "@/lib/forum/topics";
import { topicProblem } from "@/lib/forum/topics-http";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The forum's topics, each with how many discussions it holds and its most recent one. */
export async function GET() {
  const [topics, threads] = await Promise.all([listTopics(), listThreads()]);
  const known = new Set(topics.map((topic) => topic.id));
  return NextResponse.json({
    topics: topics.map((topic) => {
      const inTopic = threads.filter((thread) => topicOf(thread, known) === topic.id);
      const latest = inTopic[0] ?? null; // most recently active first
      return {
        ...topic,
        threadCount: inTopic.length,
        lastActivityAt: latest?.lastActivityAt ?? null,
        latest: latest ? { id: latest.id, title: latest.title } : null,
      };
    }),
  });
}

/** Add a topic (admins). */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!isAdmin(user)) return problem("Only admins can add forum topics", 403);
  const parsed = await readBody(request, topicInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await createTopic(parsed.data);
  return result.ok ? NextResponse.json({ topic: result.value }, { status: 201 }) : topicProblem(result.reason);
}
