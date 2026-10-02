import { NextRequest, NextResponse } from "next/server";
import { deleteProposal, editProposal, proposalUpdateSchema, readCircleMeetings, startReview, withdrawProposal } from "@/lib/meetings/store";
import { announceConsents, editProblem, meetingsContext, meetingsProblem, memberUserIds, proposalUrl } from "@/lib/meetings/http";
import { summarizeMeeting } from "@/lib/meetings/shared";
import { notify } from "@/lib/push/notify";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; proposalId: string } };

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/** A proposal with its review (comments, objections, history), the meeting it came from, and what you can do. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  await announceConsents(ctx.circle);
  const { meetings, proposals } = await readCircleMeetings(params.id);
  const proposal = proposals.find((entry) => entry.id === params.proposalId);
  if (!proposal) return meetingsProblem("not_found");
  const meeting = meetings.find((entry) => entry.id === proposal.meetingId);
  return NextResponse.json(
    { proposal, meeting: meeting ? summarizeMeeting(meeting) : null, canEdit: ctx.canEdit, canReview: ctx.canReview, admin: ctx.admin },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Reword it, send it for review, or withdraw it (the circle's members, the Board, admins). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposal-edit");
  if (limited) return limited;
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = await readBody(request, proposalUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const result =
    "action" in input
      ? input.action === "start-review"
        ? await startReview(params.id, params.proposalId, ctx.actor)
        : await withdrawProposal(params.id, params.proposalId, ctx.actor)
      : await editProposal(params.id, params.proposalId, ctx.actor, input);
  if (!result.ok) return meetingsProblem(result.reason);
  const proposal = result.value;
  if ("action" in input && input.action === "start-review") {
    await notify({
      topic: "proposals",
      title: `For review: ${proposal.title}`,
      body: `${ctx.circle.name}: log any tensions or objections by ${longDate(proposal.review!.deadline!)}.`,
      url: proposalUrl(params.id, proposal.id),
      tag: `proposal-${proposal.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: await memberUserIds(ctx.circle),
    });
  }
  return NextResponse.json({ proposal });
}

/** Delete a draft that never went for review. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const result = await deleteProposal(params.id, params.proposalId);
  return result.ok ? NextResponse.json({ ok: true }) : meetingsProblem(result.reason);
}
