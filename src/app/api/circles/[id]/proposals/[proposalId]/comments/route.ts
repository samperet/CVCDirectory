import { NextRequest, NextResponse } from "next/server";
import { addProposalComment, proposalCommentSchema } from "@/lib/meetings/store";
import { meetingsContext, meetingsProblem, memberUserIds, proposalUrl, reviewProblem } from "@/lib/meetings/http";
import { formatDuration, reviewTimeLeft } from "@/lib/meetings/shared";
import { excerpt, notify } from "@/lib/push/notify";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; proposalId: string } };

/** Log a tension, raise a Reasoned Objection (which pauses the review), or reply: the circle's members. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "proposal-comment");
  if (limited) return limited;
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canReview) return reviewProblem();
  const parsed = await readBody(request, proposalCommentSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addProposalComment(params.id, params.proposalId, ctx.actor, parsed.data);
  if (!result.ok) return meetingsProblem(result.reason);
  const { proposal, comment } = result.value;
  const url = proposalUrl(params.id, proposal.id);
  if (comment!.kind === "objection" && comment!.parentId === null) {
    // Everyone in the circle, and whoever brought it.
    const left = reviewTimeLeft(proposal);
    await notify({
      topic: "proposals",
      title: `Objection: ${proposal.title}`,
      body: `${ctx.user.name} objected, pausing the review${left ? ` (${formatDuration(left)} left)` : ""}: ${excerpt(comment!.body)}`,
      url,
      tag: `proposal-${proposal.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: [...(await memberUserIds(ctx.circle)), proposal.proposer.userId],
    });
  } else {
    // Whoever brought it, and those in the conversation.
    const root = comment!.parentId ? proposal.comments.find((entry) => entry.id === comment!.parentId) : null;
    const thread = root ? proposal.comments.filter((entry) => entry.id === root.id || entry.parentId === root.id).map((entry) => entry.authorId) : [];
    await notify({
      topic: "proposals",
      title: `${ctx.user.name} on ${proposal.title}`,
      body: excerpt(comment!.body),
      url,
      exceptUserId: ctx.user.id,
      onlyUserIds: [proposal.proposer.userId, ...thread],
    });
  }
  return NextResponse.json(result.value, { status: 201 });
}
