import { NextRequest, NextResponse } from "next/server";
import { addProposal, proposalInputSchema } from "@/lib/meetings/store";
import { editProblem, meetingsContext, meetingsProblem } from "@/lib/meetings/http";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; meetingId: string } };

/** Bring a proposal to a meeting (as a draft, until it's sent for review). */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposal");
  if (limited) return limited;
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = await readBody(request, proposalInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addProposal(params.id, params.meetingId, ctx.actor, parsed.data);
  return result.ok
    ? NextResponse.json({ proposal: result.value }, { status: 201 })
    : meetingsProblem(result.reason);
}
