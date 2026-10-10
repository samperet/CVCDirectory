import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { canConsentProposal } from "@/lib/proposals/access";
import { consentInputSchema, getProposal, withdrawConsent } from "@/lib/proposals/store";
import {
  giveConsent,
  proposalProblem,
  proposalSession,
  resolveMeeting,
  shownProposal,
  syncDocuments,
  unmarkVersions,
} from "@/lib/proposals/http";
import { checkChosen } from "@/lib/proposals/shared";

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
 * are now (those changed since are snapshotted again first). For a page
 * with alternative versions put forward, `chosen` says which the meeting
 * consented to: that version is made the page first (consent is then to the
 * page as it is), and the others are set aside. The circle, whoever
 * proposed it, and the versions' authors hear.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposals");
  if (limited) return limited;
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const parsed = await readBody(request, consentInputSchema);
  if ("error" in parsed) return parsed.error;
  if (found.proposal.status !== "proposed") return proposalProblem("not_open");
  const unchosen = checkChosen(found.proposal.versions ?? [], parsed.data.chosen);
  if (unchosen) return problem(unchosen);
  const meeting = await resolveMeeting(
    parsed.data.meeting,
    found.proposal.circleId,
    parsed.data.present,
    found
  );
  if ("error" in meeting) return problem(meeting.error);
  const given = await giveConsent(found.proposal, parsed.data, meeting, found);
  if ("error" in given) return given.error;
  return NextResponse.json({ proposal: await shownProposal(given.proposal, found) });
}

/**
 * Withdraw the record of consent (recorded by mistake): the proposal is
 * waiting for consent again, and its versions are open again (a page made
 * from one keeps its text; its history has the text before).
 */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const result = await withdrawConsent(found.proposal.id, found.actor);
  if (!result.ok) return proposalProblem(result.reason);
  await unmarkVersions(found.proposal);
  await syncDocuments(result.proposal.documents);
  return NextResponse.json({ proposal: await shownProposal(result.proposal, found) });
}
