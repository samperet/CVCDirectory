import { NextRequest, NextResponse } from "next/server";
import { deleteMeeting, meetingUpdateSchema, readCircleMeetings, updateMeeting } from "@/lib/meetings/store";
import { announceConsents, editProblem, meetingsContext, meetingsProblem } from "@/lib/meetings/http";
import { summarizeProposal } from "@/lib/meetings/shared";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; meetingId: string } };

/** A meeting's minutes, with its proposals. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  await announceConsents(ctx.circle);
  const { meetings, proposals } = await readCircleMeetings(params.id);
  const meeting = meetings.find((entry) => entry.id === params.meetingId);
  if (!meeting) return meetingsProblem("not_found");
  return NextResponse.json(
    {
      meeting,
      proposals: proposals.filter((proposal) => proposal.meetingId === meeting.id).map(summarizeProposal),
      canEdit: ctx.canEdit,
      canReview: ctx.canReview,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Change the title, date, who was there, or the notes (merged with anyone else's changes to them). */
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!rateLimit(`meeting-edit:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = meetingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await updateMeeting(params.id, params.meetingId, { userId: ctx.user.id, name: ctx.user.name }, parsed.data);
  return result.ok ? NextResponse.json(result.value) : meetingsProblem(result.reason);
}

/** Delete a meeting (not once any of its proposals has gone for review). */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const result = await deleteMeeting(params.id, params.meetingId);
  return result.ok ? NextResponse.json({ ok: true }) : meetingsProblem(result.reason);
}
