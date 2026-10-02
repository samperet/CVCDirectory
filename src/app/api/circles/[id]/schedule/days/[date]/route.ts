import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { dayChangeSchema, readSchedule, setDayChange } from "@/lib/schedules/store";
import { scheduleAccess } from "@/lib/schedules/access";
import { isIsoDate } from "@/lib/schedules/rotation";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; date: string } };

async function change(params: Params["params"], body: { householdId: string | null; note?: string | null } | null) {
  const context = await circleContext({ circleId: params.id });
  if ("error" in context) return context.error;
  if (!isIsoDate(params.date)) return problem("Use a date like 2026-09-01");
  const schedule = await readSchedule(params.id);
  if (!schedule) return problem("This circle has no duty schedule", 404);
  const access = scheduleAccess(context.user, context.directory, params.id, schedule);
  if (!access.canChangeDays) {
    return problem("Only households on the rotation, the circle, and the Board can change who's on duty", 403);
  }
  const result = await setDayChange(params.id, params.date, body, context.user.name);
  if (result === "not_found") return problem("This circle has no duty schedule", 404);
  if (result === "unknown_household") return problem("That household isn't on the rotation");
  return NextResponse.json({ schedule: result, ...access });
}

/** Put a different household on duty for this date (a swap or cover), or `householdId: null` if it needs cover. */
export async function PUT(request: NextRequest, { params }: Params) {
  const parsed = await readBody(request, dayChangeSchema);
  if ("error" in parsed) return parsed.error;
  return change(params, { householdId: parsed.data.householdId, note: parsed.data.note ?? null });
}

/** Put this date back to the regular rotation. */
export function DELETE(_request: Request, { params }: Params) {
  return change(params, null);
}
