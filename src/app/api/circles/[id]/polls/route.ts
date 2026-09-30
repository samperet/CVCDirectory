import { NextRequest, NextResponse } from "next/server";
import { circlePollInputSchema, createCirclePoll, listCirclePolls } from "@/lib/polls/circle";
import { pollsContext } from "@/lib/polls/http";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's polls, newest first, and what you can do with them. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pollsContext(params.id);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    { polls: await listCirclePolls(params.id), enabled: ctx.enabled, canCreate: ctx.canCreate, canModerate: ctx.canModerate, isMember: ctx.isMember },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Ask a question: anyone, on the Community page; the circle's members, the Board, and admins elsewhere. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`circle-poll:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await pollsContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  if (!ctx.canCreate) return problem(`Only ${ctx.circle.name}'s members, the Board, and admins can ask here`, 403, "Forbidden");
  const parsed = circlePollInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const membersOnly = params.id !== "community" && parsed.data.membersOnly;
  const poll = await createCirclePoll(params.id, { id: ctx.user.id, name: ctx.user.name }, { ...parsed.data, membersOnly });
  await notify({
    topic: "polls",
    title: params.id === "community" ? `New poll: ${poll.question}` : `New ${ctx.circle.name} poll: ${poll.question}`,
    body: `${ctx.user.name} asks: ${poll.poll.options.map((option) => option.text).join(" · ")}`,
    url: `/circles/${params.id}#polls`,
    tag: `circle-poll-${poll.id}`,
    exceptUserId: ctx.user.id,
    ...(membersOnly ? { onlyUserIds: await userIdsForPeople(ctx.memberIds) } : {}),
  });
  return NextResponse.json({ poll }, { status: 201 });
}
