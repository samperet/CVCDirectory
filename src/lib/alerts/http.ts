import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { hasAlert } from "@/lib/circles/features";
import { problem } from "@/lib/http";
import type { Failure } from "./store";

/**
 * A circle's alerts, for its Alert module and the dashboard: every signed-in
 * resident can read them and send one (to the circle's members, or to
 * everyone) — but only from a circle with an Alert module, which only admins
 * add (`PATCH /api/circles/[id]`).
 */
export async function alertsContext(circleId: string) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  if (!hasAlert(circle)) return { error: problem(`${circle.name} has no alert button`, 404) };
  return { actor: ctx.actor, circle, directory: ctx.directory, canSend: !!ctx.user.personId };
}

export function alertsProblem(reason: Failure) {
  switch (reason) {
    case "too_soon":
      return problem("You sent an alert a moment ago: wait a minute before sending another", 429);
  }
}
