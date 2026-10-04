import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { problem, readBody } from "@/lib/http";
import { groupContext } from "@/lib/groups/http";
import { publishHeld } from "@/lib/groups/inbound";
import { takeHeld } from "@/lib/groups/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: { id: string; heldId: string } };

const schema = z.object({ approve: z.boolean() });

/** A held message: post it (and send it on), or reject it quietly — the circle's members, the Board, admins. */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await groupContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canModerate) return problem("Only the circle's members approve messages", 403);
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const held = await takeHeld(params.id, params.heldId);
  if (!held) return problem("That message was already dealt with", 404);
  const outcome = parsed.data.approve ? await publishHeld(ctx.circle, held) : "rejected";
  return NextResponse.json({ ok: true, outcome });
}
