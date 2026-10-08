import { NextRequest, NextResponse } from "next/server";
import { problem, readBody, throttled } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { listDocuments } from "@/lib/documents/store";
import { searchTerms, snippetFor } from "@/lib/search";
import { canConsentProposal, canPropose } from "@/lib/proposals/access";
import {
  consentInputSchema,
  consentToProposal,
  createProposal,
  listProposals,
  proposalInputSchema,
} from "@/lib/proposals/store";
import {
  announceConsent,
  announceProposal,
  checkDocuments,
  documentVersions,
  listingOf,
  memberIdsOf,
  proposalProblem,
  proposalScore,
  proposalSession,
  resolveMeeting,
  savePresent,
  syncDocuments,
  viewOf,
} from "@/lib/proposals/http";
import { byDecision, markMembers } from "@/lib/proposals/shared";

export const dynamic = "force-dynamic";

/**
 * Proposals: every one, as a list (open ones first, the soonest to be
 * decided first; then the rest, the latest changed first) — filtered by
 * `circle` and `status`, or searched with `q` (words in the title or text,
 * best match first) — and the circles you can put one to (alone, with
 * `only=circles`).
 */
export async function GET(request: NextRequest) {
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const params = request.nextUrl.searchParams;
  const canProposeTo = ctx.directory.circles
    .filter((entry) => canPropose(ctx.user, ctx.directory, entry.id))
    .map((entry) => ({ id: entry.id, name: entry.name }));
  // Just the circles (for a form).
  if (params.get("only") === "circles") return NextResponse.json({ proposals: [], canProposeTo });
  const circle = params.get("circle");
  const status = params.get("status");
  const terms = searchTerms((params.get("q") ?? "").slice(0, 200));
  const all = (await listProposals()).filter(
    (proposal) =>
      (!circle || proposal.circleId === circle) && (!status || proposal.status === status)
  );
  const listed = terms.length
    ? all
        .map((proposal) => ({
          proposal,
          score: proposalScore(proposal, terms),
        }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((hit) => listingOf(hit.proposal, ctx.directory, snippetFor(hit.proposal.body, terms)))
    : [
        ...all.filter((proposal) => proposal.status === "proposed").sort(byDecision),
        ...all
          .filter((proposal) => proposal.status !== "proposed")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ].map((proposal) => listingOf(proposal, ctx.directory));
  return NextResponse.json(
    {
      proposals: listed,
      canProposeTo,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const createSchema = proposalInputSchema.extend({
  /** Consented already, at a meeting (recording a decision made there): the circle's members, the Board, admins. */
  consent: consentInputSchema.optional(),
});

/**
 * Put a proposal to a circle (those who can start the circle's documents);
 * its members hear about it. With `consent`, the circle has already
 * consented at a meeting: it's recorded straight away (by its members, the
 * Board, or an admin), and they hear that instead.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "proposals");
  if (limited) return limited;
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, createSchema);
  if ("error" in parsed) return parsed.error;
  const { consent, ...input } = parsed.data;
  if (!ctx.directory.circles.some((entry) => entry.id === input.circleId))
    return problem("That circle doesn't exist", 404);
  if (!canPropose(ctx.user, ctx.directory, input.circleId))
    return problem("Only the circle's members, the Board, and admins put proposals to it", 403);
  if (consent && !canConsentProposal(ctx.user, ctx.directory, input))
    return problem("Only the circle's members and the Board can record its consent", 403);
  const bad = await checkDocuments(input.documents, ctx);
  if (bad) return bad;
  // The meeting is checked (or its notes started) before anything is saved.
  const meeting = consent
    ? await resolveMeeting(consent.meeting, input.circleId, consent.present, ctx)
    : null;
  if (meeting && "error" in meeting) return problem(meeting.error);

  const created = await createProposal(ctx.actor, input);
  if (!created.ok) return proposalProblem(created.reason);
  let proposal = created.proposal;
  if (consent && meeting) {
    const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
    const result = await consentToProposal(proposal.id, {
      meeting: meeting.meeting,
      present: markMembers(meeting.present, memberIdsOf(ctx.directory, proposal.circleId)),
      note: consent.note,
      submittedBy: ctx.actor,
      documents: documentVersions(proposal.documents, pages, documents),
    });
    if (!result.ok) return proposalProblem(result.reason);
    proposal = result.proposal;
    await savePresent(meeting, ctx);
  }
  await syncDocuments(proposal.documents);
  if (proposal.status === "consented") await announceConsent(proposal, ctx);
  else await announceProposal(proposal, ctx);
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  return NextResponse.json({ proposal: viewOf(proposal, ctx, pages, documents) }, { status: 201 });
}
