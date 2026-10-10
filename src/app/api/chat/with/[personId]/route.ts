import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatContext, otherPerson } from "@/lib/chat/http";
import { markRead, readIndex, readMessages, sendMessage } from "@/lib/chat/store";
import { MAX_MESSAGE, conversationId, type ConversationView } from "@/lib/chat/shared";
import { userIdsForPeople } from "@/lib/auth/users";
import { excerpt, notify } from "@/lib/push/notify";
import { notFound, problem, readBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { personId: string } };

/**
 * Your conversation with someone: its messages, and your entry for it. With
 * `known` (your entry's `changedAt` from the last poll) and nothing new, just
 * the entry; with `read=1`, it's marked read.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await chatContext();
  if ("error" in ctx) return ctx.error;
  if (!rateLimit(`chat-read:${ctx.user.id}`, 120)) return problem("Too many requests", 429);
  const other = await otherPerson(params.personId, ctx.me);
  if (!other) return notFound("Person");
  const search = request.nextUrl.searchParams;
  let entry = (await readIndex(ctx.me))[other] ?? null;
  if (search.get("read") === "1" && entry) entry = (await markRead(ctx.me, other)) ?? entry;
  const known = search.get("known");
  const headers = { headers: { "Cache-Control": "private, no-store" } };
  if (known && entry && known === entry.changedAt)
    return NextResponse.json({ with: other, entry, unchanged: true }, headers);
  const view: ConversationView = {
    with: other,
    entry,
    messages: await readMessages(ctx.me, other),
  };
  return NextResponse.json(view, headers);
}

const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(MAX_MESSAGE, `Messages must be ${MAX_MESSAGE.toLocaleString()} characters or fewer`),
});

/** Send someone a message; they're told by push notification. */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await chatContext();
  if ("error" in ctx) return ctx.error;
  if (!rateLimit(`chat-send:${ctx.user.id}`, 30))
    return problem("That's a lot of messages at once — wait a minute", 429);
  const other = await otherPerson(params.personId, ctx.me, true);
  if (!other) return notFound("Person");
  const parsed = await readBody(request, messageSchema);
  if ("error" in parsed) return parsed.error;
  const message = await sendMessage(ctx.actor, other, parsed.data.body);
  await notify({
    topic: "messages",
    title: ctx.directory.name(ctx.me) ?? ctx.user.name,
    body: excerpt(parsed.data.body),
    url: `/messages/${ctx.me}`,
    tag: `chat-${conversationId(ctx.me, other)}`,
    exceptUserId: ctx.user.id,
    onlyUserIds: await userIdsForPeople([other]),
    skipEmail: true,
  });
  return NextResponse.json({ message }, { status: 201 });
}
