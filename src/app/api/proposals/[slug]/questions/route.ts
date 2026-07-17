import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getProposal } from "@/lib/proposals/content";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalState } from "@/lib/proposals/store";
import { questionInputSchema } from "@/lib/proposals/validation";
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

  const parsed = questionInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  if (!proposal.sections.some((section) => section.id === parsed.data.sectionId)) {
    return problem("Unknown proposal section");
  }

  const state = await mutateProposalState(proposal.slug, (current) => ({
    ...current,
    questions: [
      ...current.questions,
      {
        id: randomUUID(),
        sectionId: parsed.data.sectionId,
        authorName: parsed.data.authorName,
        body: parsed.data.body,
        createdAt: new Date().toISOString(),
        responses: [],
      },
    ],
  }));

  return NextResponse.json(buildStateResponse(proposal, state), { status: 201 });
}
