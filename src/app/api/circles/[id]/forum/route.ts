import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { problem, readBody, throttled } from "@/lib/http";
import { readDirectory } from "@/lib/directory/store";
import { pollInputSchema } from "@/lib/polls/server";
import { allDeliveries, deliveryOf, setDelivery } from "@/lib/groups/delivery";
import { groupContext, groupProblem, shareGroupPost } from "@/lib/groups/http";
import { createGroupPoll } from "@/lib/groups/polls";
import { groupRecipients } from "@/lib/groups/recipients";
import { groupEmailOn } from "@/lib/groups/send";
import {
  listHeld,
  listThreads,
  setThreadHasPoll,
  startThread,
  threadInputSchema,
} from "@/lib/groups/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: { id: string } };

/**
 * A circle's Forum: its conversations (latest first), its email address,
 * how you get its messages, who a new message would reach by email, and —
 * for its members — messages waiting for approval.
 */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const [threads, deliveries, held, directory] = await Promise.all([
    listThreads(params.id),
    allDeliveries(),
    ctx.canModerate ? listHeld(params.id) : Promise.resolve([]),
    readDirectory(),
  ]);
  const reach = groupRecipients({
    memberIds: ctx.circle.seats.map((seat) => seat.personId),
    people: directory?.people ?? [],
    deliveryOf: (personId) => deliveryOf(deliveries, personId, params.id),
    exceptPersonId: null,
  });
  const member = ctx.circle.seats.some((seat) => seat.personId === ctx.personId);
  return NextResponse.json(
    {
      threads,
      address: ctx.address,
      emailOn: groupEmailOn(ctx.circle),
      canPost: ctx.canPost,
      canModerate: ctx.canModerate,
      member,
      myDelivery: deliveryOf(deliveries, ctx.personId, params.id),
      reach: { email: reach.to.length, webOnly: reach.webOnly, noEmail: reach.noEmail },
      held,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const startSchema = threadInputSchema.extend({ poll: pollInputSchema.optional() });

/** Start a conversation (the circle's members, the Board, admins); it's emailed to the members. */
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
    { title: parsed.data.title, body: parsed.data.body, via: "web" }
  );
  if (!result.ok) return groupProblem(result.reason);
  if (parsed.data.poll) {
    await createGroupPoll(params.id, result.thread.id, parsed.data.poll, ctx.personId);
    await setThreadHasPoll(params.id, result.thread.id);
  }
  const emailed = await shareGroupPost(ctx.circle, result.thread, result.post, null, {
    exceptUserId: ctx.user.id,
  });
  return NextResponse.json({ thread: result.thread, emailed }, { status: 201 });
}

const deliverySchema = z.object({ delivery: z.enum(["each", "web"]) });

/** Choose how you get this circle's messages: each by email, or on the web only. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, deliverySchema);
  if ("error" in parsed) return parsed.error;
  return NextResponse.json({
    myDelivery: await setDelivery(ctx.personId, params.id, parsed.data.delivery),
  });
}
