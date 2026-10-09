import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { listDocuments } from "@/lib/documents/store";
import { canConsentProposal } from "@/lib/proposals/access";
import {
  consentInputSchema,
  consentToProposal,
  getProposal,
  withdrawConsent,
} from "@/lib/proposals/store";
import {
  announceConsent,
  changedDocuments,
  consentedVersions,
  ensureSnapshots,
  memberIdsOf,
  proposalProblem,
  proposalSession,
  resolveMeeting,
  retakeSnapshots,
  savePresent,
  syncDocuments,
  viewOf,
} from "@/lib/proposals/http";
import { markMembers } from "@/lib/proposals/shared";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function load(id: string) {
  const ctx = await proposalSession();
  if ("error" in ctx) return { error: ctx.error };
  const proposal = /^[0-9a-f-]{36}$/i.test(id) ? await getProposal(id) : null;
  if (!proposal) return { error: proposalProblem("not_found") };
  if (!canConsentProposal(ctx.user, ctx.directory, proposal))
    return {
      error: problem("Only the circle's members and the Board can record its consent", 403),
    };
  return { ...ctx, proposal };
}

/**
 * Record that the circle consented, at a meeting: its notes or minutes
 * (kept by the circle, dated today or before), or new notes for a meeting
 * that has none yet. Who was there comes from the notes, or from `present`
 * (saved to the notes too); each is marked as in the circle or not. You are
 * recorded as having recorded it. The documents it's about are consented
 * as their snapshots have them — as proposed — or, with `current`, as they
 * are now (those changed since are snapshotted again first). The circle and
 * whoever proposed it hear.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposals");
  if (limited) return limited;
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const parsed = await readBody(request, consentInputSchema);
  if ("error" in parsed) return parsed.error;
  if (found.proposal.status !== "proposed") return proposalProblem("not_open");
  const meeting = await resolveMeeting(
    parsed.data.meeting,
    found.proposal.circleId,
    parsed.data.present,
    found
  );
  if ("error" in meeting) return problem(meeting.error);
  // Documents attached before snapshots were kept are snapshotted now.
  let proposal = await ensureSnapshots(found.proposal, found.actor);
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  const stale = parsed.data.current ? changedDocuments(proposal, pages, documents) : [];
  if (stale.length) {
    const retaken = await retakeSnapshots(proposal, found.actor, stale);
    if (!retaken.ok) return proposalProblem(retaken.reason);
    proposal = retaken.proposal;
  }
  const result = await consentToProposal(proposal.id, {
    meeting: meeting.meeting,
    present: markMembers(meeting.present, memberIdsOf(found.directory, proposal.circleId)),
    note: parsed.data.note,
    submittedBy: found.actor,
    documents: consentedVersions(proposal, pages, documents),
  });
  if (!result.ok) return proposalProblem(result.reason);
  await savePresent(meeting, found);
  await syncDocuments(result.proposal.documents);
  await announceConsent(result.proposal, found);
  return NextResponse.json({
    proposal: viewOf(result.proposal, found, await readPages(), await listDocuments()),
  });
}

/** Withdraw the record of consent (recorded by mistake): the proposal is waiting for consent again. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const result = await withdrawConsent(found.proposal.id, found.actor);
  if (!result.ok) return proposalProblem(result.reason);
  await syncDocuments(result.proposal.documents);
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  return NextResponse.json({ proposal: viewOf(result.proposal, found, pages, documents) });
}
