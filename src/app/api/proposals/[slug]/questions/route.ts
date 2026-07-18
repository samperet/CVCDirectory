import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalDocument, readProposalDocument } from "@/lib/proposals/store";
import { questionInputSchema } from "@/lib/proposals/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const existing = await readProposalDocument(params.slug);
  if (!existing) {
    return problem("Proposal not found", 404, "Not Found");
  }

  const parsed = questionInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  if (!existing.content.sections.some((section) => section.id === parsed.data.sectionId)) {
    return problem("Unknown proposal section");
  }

  const doc = await mutateProposalDocument(params.slug, (current) => ({
    ...current,
    state: {
      ...current.state,
      questions: [
        ...current.state.questions,
        {
          id: randomUUID(),
          sectionId: parsed.data.sectionId,
          authorName: parsed.data.authorName,
          body: parsed.data.body,
          createdAt: new Date().toISOString(),
          responses: [],
        },
      ],
    },
  }));

  if (!doc) {
    return problem("Proposal not found", 404, "Not Found");
  }

  return NextResponse.json(buildStateResponse(doc), { status: 201 });
}
