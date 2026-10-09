import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { problem, readBody, throttled } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { listDocuments } from "@/lib/documents/store";
import { canEditProposal } from "@/lib/proposals/access";
import { getProposal } from "@/lib/proposals/store";
import {
  proposalProblem,
  proposalSession,
  retakeSnapshots,
  syncDocuments,
  viewOf,
} from "@/lib/proposals/http";
import { sameDocument } from "@/lib/proposals/shared";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const retakeSchema = z.object({
  kind: z.enum(["page", "file"]),
  id: z.string().regex(/^[0-9a-f-]{36}$/i, "That isn't a document"),
});

/**
 * Take a document's snapshot again from its current version — "use the
 * current version" — while the proposal waits for consent (whoever can
 * change the proposal). What's proposed is then the document as it is now.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposals");
  if (limited) return limited;
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const proposal = /^[0-9a-f-]{36}$/i.test(params.id) ? await getProposal(params.id) : null;
  if (!proposal) return proposalProblem("not_found");
  if (!canEditProposal(ctx.user, ctx.directory, proposal))
    return problem(
      "Only whoever proposed it, the circle's members, and the Board can change it",
      403
    );
  const parsed = await readBody(request, retakeSchema);
  if ("error" in parsed) return parsed.error;
  const ref = { kind: parsed.data.kind, id: parsed.data.id.toLowerCase() };
  if (proposal.status === "consented") return proposalProblem("consented");
  if (!proposal.documents.some((entry) => sameDocument(entry, ref)))
    return proposalProblem("not_attached");
  const result = await retakeSnapshots(proposal, ctx.actor, [ref]);
  if (!result.ok) return proposalProblem(result.reason);
  await syncDocuments([ref]);
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  return NextResponse.json({ proposal: viewOf(result.proposal, ctx, pages, documents) });
}
