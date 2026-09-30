import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { communityPollInputSchema, createCommunityPoll, listCommunityPolls } from "@/lib/polls/community";
import { notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** The Community page's polls, newest first. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  return NextResponse.json({ polls: await listCommunityPolls() }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Ask the community a question: any resident. */
export async function POST(request: NextRequest) {
  if (!rateLimit(`community-poll:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const user = await getSessionUser();
  if (!user) return problem("Sign in to create a poll", 401, "Unauthorized");
  const parsed = communityPollInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const poll = await createCommunityPoll({ id: user.id, name: user.name }, parsed.data);
  await notify({
    topic: "polls",
    title: `New poll: ${poll.question}`,
    body: `${user.name} asks: ${poll.poll.options.map((option) => option.text).join(" · ")}`,
    url: "/circles/community#polls",
    tag: `community-poll-${poll.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json({ poll }, { status: 201 });
}
