import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getProposal } from "@/lib/proposals/content";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalState } from "@/lib/proposals/store";
import { meetingRequestInputSchema } from "@/lib/proposals/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const proposal = getProposal(params.slug);
  if (!proposal) {
    return problem("Proposal not found", 404, "Not Found");
  }

  const parsed = meetingRequestInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const state = await mutateProposalState(proposal.slug, (draft) => ({
    ...draft,
    meetingRequests: [
      ...draft.meetingRequests,
      {
        id: randomUUID(),
        name: parsed.data.name,
        note: parsed.data.note,
        createdAt: new Date().toISOString(),
      },
    ],
  }));

  return NextResponse.json(buildStateResponse(proposal, state), { status: 201 });
}
