import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { problem, readBody, throttled } from "@/lib/http";
import { readDirectory } from "@/lib/directory/store";
import { publishHeld } from "@/lib/groups/inbound";
import { listHeld, takeHeld } from "@/lib/groups/store";
import { readConfirmToken } from "@/lib/groups/tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ token: z.string().max(400) });

/**
 * "Yes, I sent it": a member confirms, from the email sent to their
 * directory address, a message of theirs that was held because it couldn't
 * be verified. No sign-in — the signed link (which only they were sent) is
 * the proof. GET-safe: only this POST (the page's button) acts.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "group-confirm");
  if (limited) return limited;
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const claim = readConfirmToken(parsed.data.token);
  if (!claim) return problem("That link doesn't work", 400);
  const waiting = (await listHeld(claim.circleId)).find((entry) => entry.id === claim.heldId);
  if (!waiting || waiting.reason !== "unverified")
    return problem("That message was already posted or has expired", 404);
  const circle = (await readDirectory())?.circles.find((entry) => entry.id === claim.circleId);
  if (!circle) return problem("That circle no longer exists", 404);
  const held = await takeHeld(claim.circleId, claim.heldId);
  if (!held) return problem("That message was already posted", 404);
  const outcome = await publishHeld(circle, held);
  return NextResponse.json({ ok: true, outcome, circleId: circle.id, circleName: circle.name });
}
