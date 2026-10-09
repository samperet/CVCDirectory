import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { listDocuments } from "@/lib/documents/store";
import { canEditProposal, canPropose } from "@/lib/proposals/access";
import {
  deleteProposal,
  getProposal,
  proposalUpdateSchema,
  updateProposal,
} from "@/lib/proposals/store";
import {
  announceProposal,
  checkDocuments,
  ensureSnapshots,
  proposalProblem,
  proposalSession,
  syncDocuments,
  viewOf,
} from "@/lib/proposals/http";
import { discardSnapshots } from "@/lib/proposals/snapshots";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function load(id: string) {
  const ctx = await proposalSession();
  if ("error" in ctx) return { error: ctx.error };
  const proposal = isId(id) ? await getProposal(id) : null;
  if (!proposal) return { error: proposalProblem("not_found") };
  return { ...ctx, proposal };
}

/** A proposal: its documents, the pages that hold it, and what you may do with it. */
export async function GET(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  return NextResponse.json(
    { proposal: viewOf(found.proposal, found, pages, documents) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Change a proposal that hasn't been consented — its title, text, circle
 * (one you can propose to), documents, the day to decide — or withdraw it,
 * or propose a withdrawn one again (whoever proposed it, the circle's
 * members, the Board, admins). A document taken off takes its snapshot with
 * it; one added has its snapshot taken. Proposing again tells the circle
 * again.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposals");
  if (limited) return limited;
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const { proposal, user, directory } = found;
  if (!canEditProposal(user, directory, proposal))
    return problem(
      "Only whoever proposed it, the circle's members, and the Board can change it",
      403
    );
  const parsed = await readBody(request, proposalUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const update = parsed.data;
  if (update.circleId && update.circleId !== proposal.circleId) {
    if (!directory.circles.some((entry) => entry.id === update.circleId))
      return problem("That circle doesn't exist", 404);
    if (!canPropose(user, directory, update.circleId))
      return problem("You can't put proposals to that circle", 403);
  }
  if (update.documents) {
    const bad = await checkDocuments(update.documents, found);
    if (bad) return bad;
  }
  const result = await updateProposal(proposal.id, found.actor, update);
  if (!result.ok) return proposalProblem(result.reason);
  await discardSnapshots(
    (proposal.snapshots ?? []).filter(
      (old) => !result.proposal.snapshots?.some((kept) => kept.snapshotId === old.snapshotId)
    )
  );
  const updated = await ensureSnapshots(result.proposal, found.actor);
  await syncDocuments([...proposal.documents, ...updated.documents]);
  if (proposal.status === "withdrawn" && updated.status === "proposed")
    await announceProposal(updated, found);
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  return NextResponse.json({ proposal: viewOf(updated, found, pages, documents) });
}

/** Delete a proposal that was never consented (whoever can change it), and its snapshots. Pages holding it show it's gone. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (!canEditProposal(found.user, found.directory, found.proposal))
    return problem(
      "Only whoever proposed it, the circle's members, and the Board can delete it",
      403
    );
  const result = await deleteProposal(found.proposal.id);
  if (!result.ok) return proposalProblem(result.reason);
  await discardSnapshots(result.proposal.snapshots ?? []);
  await syncDocuments(found.proposal.documents);
  return NextResponse.json({ ok: true });
}
