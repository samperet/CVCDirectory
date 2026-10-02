import { NextRequest, NextResponse } from "next/server";
import { createMeeting, meetingCreateSchema, readCircleMeetings } from "@/lib/meetings/store";
import { announceConsents, editProblem, meetingsContext, meetingsProblem } from "@/lib/meetings/http";
import { summarizeMeeting, summarizeProposal } from "@/lib/meetings/shared";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The circle's meetings and proposals (newest first), and what you can do with them. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  await announceConsents(ctx.circle);
  const { meetings, proposals } = await readCircleMeetings(params.id);
  return NextResponse.json(
    { meetings: meetings.map(summarizeMeeting), proposals: proposals.map(summarizeProposal), canEdit: ctx.canEdit, canReview: ctx.canReview },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Start a meeting's minutes (the circle's members, the Board, admins). */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`meeting:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await meetingsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return editProblem();
  const parsed = meetingCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await createMeeting(params.id, ctx.circle.name, { userId: ctx.user.id, name: ctx.user.name }, parsed.data);
  return result.ok ? NextResponse.json({ meeting: result.value }, { status: 201 }) : meetingsProblem(result.reason);
}
