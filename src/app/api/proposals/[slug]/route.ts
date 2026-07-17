import { NextRequest, NextResponse } from "next/server";
import { getProposal } from "@/lib/proposals/content";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { readProposalState } from "@/lib/proposals/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const proposal = getProposal(params.slug);
  if (!proposal) {
    return problem("Proposal not found", 404, "Not Found");
  }

  const state = await readProposalState(proposal.slug);
  return NextResponse.json(buildStateResponse(proposal, state));
}
