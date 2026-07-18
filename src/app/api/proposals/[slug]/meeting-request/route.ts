import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalDocument } from "@/lib/proposals/store";
import { meetingRequestInputSchema } from "@/lib/proposals/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const parsed = meetingRequestInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const doc = await mutateProposalDocument(params.slug, (current) => ({
    ...current,
    state: {
      ...current.state,
      meetingRequests: [
        ...current.state.meetingRequests,
        {
          id: randomUUID(),
          name: parsed.data.name,
          note: parsed.data.note,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  }));

  if (!doc) {
    return problem("Proposal not found", 404, "Not Found");
  }

  return NextResponse.json(buildStateResponse(doc), { status: 201 });
}
