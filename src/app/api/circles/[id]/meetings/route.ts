import { NextRequest, NextResponse } from "next/server";
import { createMeeting, meetingCreateSchema, readCircleMeetings } from "@/lib/meetings/store";
import {
  announceConsents,
  editProblem,
  meetingsContext,
  meetingsProblem,
} from "@/lib/meetings/http";
import { summarizeMeeting, summarizeProposal } from "@/lib/meetings/shared";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The circle's meetings and proposals (newest first), and what you can do with them. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  await announceConsents(ctx.circle);
  const { meetings, proposals } = await readCircleMeetings(params.id);
  return NextResponse.json(
    {
      meetings: meetings.map(summarizeMeeting),
      proposals: proposals.map(summarizeProposal),
      canEdit: ctx.canEdit,
      canReview: ctx.canReview,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Start a meeting's minutes (the circle's members, the Board, admins). */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "meeting");
  if (limited) return limited;
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = await readBody(request, meetingCreateSchema, {});
  if ("error" in parsed) return parsed.error;
  const result = await createMeeting(params.id, ctx.circle.name, ctx.actor, parsed.data);
  return result.ok
    ? NextResponse.json({ meeting: result.value }, { status: 201 })
    : meetingsProblem(result.reason);
}
