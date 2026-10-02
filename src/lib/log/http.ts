import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { anyonePostsToLog, hasLog } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";
import type { Failure } from "./store";

/**
 * Who may read and write a circle's Log. Every signed-in resident reads it
 * and can reply. Updates are posted by the circle's members, the Board, and
 * admins (anyone, for the Community circle) — or by any resident, if the
 * circle's Log module says so. Writing needs a Log module on the circle's
 * page. Its members, the Board, and admins can delete anyone's update.
 */
export async function logContext(circleId: string, { write = false } = {}) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const enabled = hasLog(circle);
  if (write && !enabled) return { error: problem(`${circle.name} has no log`, 409) };
  const member = canUploadTo(ctx.user, ctx.directory, circleId);
  return {
    actor: ctx.actor,
    circle,
    canPost: enabled && (member || anyonePostsToLog(circle)),
    canReply: enabled && !!ctx.user.personId,
    canModerate: member || ctx.actor.admin,
  };
}

export function logProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
    case "unknown_parent":
      return problem("That update no longer exists", 404);
    case "forbidden":
      return problem("You can't change that update", 403);
    case "full":
      return problem("This log is full", 409);
  }
}
