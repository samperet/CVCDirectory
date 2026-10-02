import { NextRequest, NextResponse } from "next/server";
import { addProposal, proposalInputSchema } from "@/lib/meetings/store";
import { editProblem, meetingsContext, meetingsProblem } from "@/lib/meetings/http";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; meetingId: string } };

/** Bring a proposal to a meeting (as a draft, until it's sent for review). */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`proposal:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = proposalInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await addProposal(params.id, params.meetingId, ctx.actor, parsed.data);
  return result.ok ? NextResponse.json({ proposal: result.value }, { status: 201 }) : meetingsProblem(result.reason);
}
