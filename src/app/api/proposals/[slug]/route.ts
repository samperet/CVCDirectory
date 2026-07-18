import { NextRequest, NextResponse } from "next/server";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalDocument, readProposalDocument } from "@/lib/proposals/store";
import { proposalContentUpdateSchema } from "@/lib/proposals/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const doc = await readProposalDocument(params.slug);
  if (!doc) {
    return problem("Proposal not found", 404, "Not Found");
  }
  return NextResponse.json(buildStateResponse(doc));
}

export async function PATCH(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const parsed = proposalContentUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  // Editable fields only — the review clock (reviewStartedAt, baseReviewDays,
  // maxExtraDays, meetingRequestThreshold) and slug stay fixed so edits can't
  // game the consent process.
  const doc = await mutateProposalDocument(params.slug, (current) => ({
    ...current,
    content: {
      ...current.content,
      title: parsed.data.title,
      summary: parsed.data.summary,
      proposer: parsed.data.proposer,
      circle: parsed.data.circle,
      sections: parsed.data.sections,
    },
  }));

  if (!doc) {
    return problem("Proposal not found", 404, "Not Found");
  }

  return NextResponse.json(buildStateResponse(doc));
}
