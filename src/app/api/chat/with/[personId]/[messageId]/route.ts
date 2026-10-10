import { NextResponse } from "next/server";
import { chatContext, chatProblem, otherPerson } from "@/lib/chat/http";
import { deleteMessage } from "@/lib/chat/store";
import { notFound } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Delete one of your own messages. */
export async function DELETE(
  _request: Request,
  { params }: { params: { personId: string; messageId: string } }
) {
  const ctx = await chatContext();
  if ("error" in ctx) return ctx.error;
  const other = await otherPerson(params.personId, ctx.me);
  if (!other) return notFound("Person");
  const result = await deleteMessage(ctx.actor, other, params.messageId);
  return result.ok ? NextResponse.json({ ok: true }) : chatProblem(result.reason);
}
