import { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { listTasks } from "@/lib/tasks/store";

export const dynamic = "force-dynamic";

/** The unfinished tasks you own, in every circle with tasks turned on — soonest due first. */
export async function GET() {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const circles = ctx.directory.circles.filter((circle) => featureEnabled(circle, "tasks"));
  const lists = await Promise.all(
    circles.map(async (circle) =>
      (await listTasks(circle.id))
        .filter((task) => task.ownerId === ctx.personId && task.status !== "done")
        .map(({ activity: _activity, description: _description, ...task }) => ({ ...task, circleId: circle.id, circleName: circle.name }))
    )
  );
  const tasks = lists.flat().sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt));
  return NextResponse.json({ tasks }, { headers: { "Cache-Control": "private, no-store" } });
}
