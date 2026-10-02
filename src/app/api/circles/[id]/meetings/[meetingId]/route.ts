import { NextRequest, NextResponse } from "next/server";
import {
  deleteMeeting,
  meetingUpdateSchema,
  readCircleMeetings,
  updateMeeting,
} from "@/lib/meetings/store";
import {
  announceConsents,
  editProblem,
  meetingsContext,
  meetingsProblem,
} from "@/lib/meetings/http";
import { summarizeProposal } from "@/lib/meetings/shared";
import { readBody, throttled } from "@/lib/http";

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
      proposals: proposals
        .filter((proposal) => proposal.meetingId === meeting.id)
        .map(summarizeProposal),
      canEdit: ctx.canEdit,
      canReview: ctx.canReview,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Change the title, date, who was there, or the notes (merged with anyone else's changes to them). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "meeting-edit");
  if (limited) return limited;
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = await readBody(request, meetingUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await updateMeeting(params.id, params.meetingId, ctx.actor, parsed.data);
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
