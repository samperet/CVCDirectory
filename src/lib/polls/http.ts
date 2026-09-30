import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { isAdmin } from "@/lib/auth/admins";
import { problem } from "@/lib/http";
import type { PollFailure } from "./circle";

/**
 * Who does what in a circle's Polls section. Everyone signed in sees the
 * polls. Anyone asks on the Community page; elsewhere the circle's members,
 * the Board, and admins do. Admins — and, outside Community, the circle's
 * editors — can close or delete anyone's poll.
 */
export async function pollsContext(circleId: string, { write = false } = {}) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const enabled = featureEnabled(circle, "polls");
  if (write && !enabled) return { error: problem(`${circle.name} doesn't have polls turned on`, 409, "Conflict") };
  const community = circleId === "community";
  const editor = canUploadTo(ctx.user, ctx.directory, circleId);
  const personId = ctx.user.personId ?? null;
  return {
    user: ctx.user,
    circle,
    enabled,
    canCreate: enabled && editor,
    canModerate: isAdmin(ctx.user) || (!community && editor),
    /** Whether you can vote in a members-only poll. */
    isMember: community || (!!personId && circle.seats.some((seat) => seat.personId === personId)),
    memberIds: circle.seats.map((seat) => seat.personId),
  };
}

/** Map a poll failure to an HTTP problem response. */
export function pollProblem(reason: PollFailure) {
  switch (reason) {
    case "not_found":
      return problem("That poll no longer exists", 404, "Not Found");
    case "forbidden":
      return problem("Only the poll's author or the circle's moderators can do that", 403, "Forbidden");
    case "poll_closed":
      return problem("This poll is closed", 409, "Conflict");
    case "invalid_vote":
      return problem("Choose one of the poll's options");
    case "no_new_options":
      return problem("This poll doesn't take new options", 409, "Conflict");
    case "options_full":
      return problem("This poll has as many options as it can hold", 409, "Conflict");
  }
}
