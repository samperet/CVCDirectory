import { NextRequest, NextResponse } from "next/server";
import { deleteProposalComment, editProposalComment, proposalCommentUpdateSchema, setTensionAddressed, withdrawObjection } from "@/lib/meetings/store";
import { meetingsContext, meetingsProblem, memberUserIds, reviewProblem } from "@/lib/meetings/http";
import { formatDuration, proposalHref, proposalState, reviewTimeLeft } from "@/lib/meetings/shared";
import { notify } from "@/lib/push/notify";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; proposalId: string; commentId: string } };

/**
 * Change what you wrote; mark a tension addressed (the circle's members); or
 * withdraw an objection (its author, or an admin) — with none left open, the
 * review carries on.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposal-comment-edit");
  if (limited) return limited;
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, proposalCommentUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  if ("withdrawn" in input) {
    const result = await withdrawObjection(params.id, params.proposalId, params.commentId, { ...ctx.actor, admin: ctx.admin }, input.note);
    if (!result.ok) return meetingsProblem(result.reason);
    const { proposal } = result.value;
    const resumed = proposalState(proposal) === "review";
    await notify({
      topic: "proposals",
      title: resumed ? `Review resumed: ${proposal.title}` : `Objection withdrawn: ${proposal.title}`,
      body: resumed
        ? `${ctx.user.name} withdrew their objection; ${formatDuration(reviewTimeLeft(proposal) ?? 0)} of the review left.`
        : `${ctx.user.name} withdrew an objection; the review stays paused for the others.`,
      url: proposalHref(params.id, proposal.id),
      tag: `proposal-${proposal.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: [...(await memberUserIds(ctx.circle)), proposal.proposer.userId],
    });
    return NextResponse.json(result.value);
  }
  if ("addressed" in input) {
    if (!ctx.canReview && !ctx.admin) return reviewProblem();
    const result = await setTensionAddressed(params.id, params.proposalId, params.commentId, ctx.actor, input.addressed);
    return result.ok ? NextResponse.json(result.value) : meetingsProblem(result.reason);
  }
  const result = await editProposalComment(params.id, params.proposalId, params.commentId, ctx.actor, input.body);
  return result.ok ? NextResponse.json(result.value) : meetingsProblem(result.reason);
}

/** Delete a tension or reply (its author, or an admin). Objections are withdrawn instead. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  const result = await deleteProposalComment(params.id, params.proposalId, params.commentId, { userId: ctx.user.id, admin: ctx.admin });
  return result.ok ? NextResponse.json(result.value) : meetingsProblem(result.reason);
}
