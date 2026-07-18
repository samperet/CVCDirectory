import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { computeReviewWindow, summarizeExtension } from "@/lib/proposals/logic";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalDocument, readProposalDocument } from "@/lib/proposals/store";
import { extendInputSchema } from "@/lib/proposals/validation";
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

  const parsed = extendInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const extension = summarizeExtension(
    existing.state.extensionClicks.length,
    existing.content.maxExtraDays
  );
  if (extension.atMaxExtension) {
    return problem("The review period has reached its maximum extension", 409, "Conflict");
  }
  if (computeReviewWindow(existing.content, extension.extraDays).closed) {
    return problem("The review period has already closed", 409, "Conflict");
  }

  const doc = await mutateProposalDocument(params.slug, (current) => ({
    ...current,
    state: {
      ...current.state,
      extensionClicks: [
        ...current.state.extensionClicks,
        { id: randomUUID(), name: parsed.data.name, createdAt: new Date().toISOString() },
      ],
    },
  }));

  if (!doc) {
    return problem("Proposal not found", 404, "Not Found");
  }

  return NextResponse.json(buildStateResponse(doc), { status: 201 });
}
