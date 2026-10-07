import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { pollInputSchema } from "@/lib/polls/server";
import { groupContext, groupProblem, shareGroupPost } from "@/lib/groups/http";
import { createGroupPoll } from "@/lib/groups/polls";
import { listThreads, setThreadHasPoll, startThread, threadInputSchema } from "@/lib/groups/store";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's Forum: its conversations (latest first), and what you may do in it. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const member = ctx.circle.seats.some((seat) => seat.personId === ctx.personId);
  return NextResponse.json(
    {
      threads: await listThreads(params.id),
      canPost: ctx.canPost,
      canModerate: ctx.canModerate,
      member,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const startSchema = threadInputSchema.extend({ poll: pollInputSchema.optional() });

/**
 * Start a conversation (the circle's members, the Board, admins), with a
 * poll if wanted; the members get an app notification.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "groups");
  if (limited) return limited;
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canPost)
    return problem(`Only ${ctx.circle.name}'s members start conversations here`, 403);
  const parsed = await readBody(request, startSchema);
  if ("error" in parsed) return parsed.error;
  const result = await startThread(
    params.id,
    { userId: ctx.user.id, personId: ctx.personId, name: ctx.actor.name },
    { title: parsed.data.title, body: parsed.data.body }
  );
  if (!result.ok) return groupProblem(result.reason);
  if (parsed.data.poll) {
    await createGroupPoll(params.id, result.thread.id, parsed.data.poll, ctx.personId);
    await setThreadHasPoll(params.id, result.thread.id);
  }
  await shareGroupPost(ctx.circle, result.thread, result.post, { exceptUserId: ctx.user.id });
  return NextResponse.json({ thread: result.thread }, { status: 201 });
}
