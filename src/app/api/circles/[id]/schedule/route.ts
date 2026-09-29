import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { deleteSchedule, readSchedule, saveSchedule, scheduleSetupSchema } from "@/lib/schedules/store";
import { scheduleAccess } from "@/lib/schedules/access";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's duty schedule (null if it has none), and what the viewer may change. */
export async function GET(_request: Request, { params }: Params) {
  const context = await circleContext({ circleId: params.id });
  if ("error" in context) return context.error;
  const schedule = await readSchedule(params.id);
  return NextResponse.json(
    { schedule, ...scheduleAccess(context.user, context.directory, params.id, schedule) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Change the rotation: the circle's members, the Board, or an admin. Only a
 * circle that already has a duty schedule (the Chicken Tenders) can change
 * one; schedules aren't something every circle sets up. One-off changes are kept.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const context = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in context) return context.error;
  if (!(await readSchedule(params.id))) return problem("This circle doesn't have a duty schedule", 404, "Not Found");
  const parsed = scheduleSetupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const schedule = await saveSchedule(params.id, parsed.data);
  return NextResponse.json({ schedule, ...scheduleAccess(context.user, context.directory, params.id, schedule) });
}

/** Remove the circle's schedule. */
export async function DELETE(_request: Request, { params }: Params) {
  const context = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in context) return context.error;
  await deleteSchedule(params.id);
  return NextResponse.json({ ok: true });
}
