import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getProposal } from "@/lib/proposals/content";
import { computeReviewWindow, summarizeExtension } from "@/lib/proposals/logic";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalState, readProposalState } from "@/lib/proposals/store";
import { extendInputSchema } from "@/lib/proposals/validation";
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

  const parsed = extendInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const current = await readProposalState(proposal.slug);
  const extension = summarizeExtension(current.extensionClicks.length, proposal.maxExtraDays);
  if (extension.atMaxExtension) {
    return problem("The review period has reached its maximum extension", 409, "Conflict");
  }
  if (computeReviewWindow(proposal, extension.extraDays).closed) {
    return problem("The review period has already closed", 409, "Conflict");
  }

  const state = await mutateProposalState(proposal.slug, (draft) => ({
    ...draft,
    extensionClicks: [
      ...draft.extensionClicks,
      { id: randomUUID(), name: parsed.data.name, createdAt: new Date().toISOString() },
    ],
  }));

  return NextResponse.json(buildStateResponse(proposal, state), { status: 201 });
}
