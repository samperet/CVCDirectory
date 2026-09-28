import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { readDirectory } from "@/lib/directory/store";
import { readSchedule, saveSchedule, scheduleDocumentSchema } from "@/lib/schedules/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Seed a circle's duty schedule without a resident session. Requires
 * `Authorization: Bearer <ADMIN_TOKEN>`. GET lists circles (id and name) and
 * which have a schedule; PUT takes `{ circleId, setup, overrides? }` and
 * replaces that circle's schedule.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const directory = await readDirectory();
  const circles = await Promise.all(
    (directory?.circles ?? []).map(async (circle) => ({ id: circle.id, name: circle.name, schedule: !!(await readSchedule(circle.id)) }))
  );
  return NextResponse.json({ circles });
}

export async function PUT(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { circleId?: unknown } | null;
  const circleId = typeof body?.circleId === "string" ? body.circleId : "";
  const directory = await readDirectory();
  if (!directory?.circles.some((circle) => circle.id === circleId)) return problem("Circle not found", 404, "Not Found");
  const parsed = scheduleDocumentSchema.safeParse(body);
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const schedule = await saveSchedule(circleId, parsed.data.setup, parsed.data.overrides ?? {});
  return NextResponse.json({
    circleId,
    households: schedule.households.length,
    changes: Object.keys(schedule.overrides).length,
  });
}
