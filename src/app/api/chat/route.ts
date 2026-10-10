import { NextResponse } from "next/server";
import { chatContext } from "@/lib/chat/http";
import { readIndex } from "@/lib/chat/store";
import { unreadCount } from "@/lib/chat/shared";

export const dynamic = "force-dynamic";

/** Your conversations, the most recent first, and how many have unread messages. */
export async function GET() {
  const ctx = await chatContext();
  if ("error" in ctx) return ctx.error;
  const index = await readIndex(ctx.me);
  const conversations = Object.values(index).sort((a, b) =>
    (b.lastAt ?? b.changedAt).localeCompare(a.lastAt ?? a.changedAt)
  );
  return NextResponse.json(
    { me: ctx.me, conversations, unread: unreadCount(index, ctx.me) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
