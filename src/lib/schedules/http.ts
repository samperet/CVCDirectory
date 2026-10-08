import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { forbidden, problem } from "@/lib/http";
import { scheduleAccess } from "./access";
import { dailyCountOf } from "./rotation";
import { readSchedule } from "./store";
import type { Failure } from "./egg-store";
import type { ReaderFailure } from "./egg-reader";

/**
 * Who may see and record a schedule's daily count (the eggs). Everyone
 * signed in sees the counts; those who may change days on the rotation —
 * its households, the circle's members, the Board, and admins — record them
 * (`scheduleAccess().canChangeDays`). A circle without a schedule, or whose
 * schedule counts nothing, has no counts: 404.
 */
export async function eggContext(circleId: string, { record = false } = {}) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const schedule = await readSchedule(circleId);
  const label = schedule ? dailyCountOf(schedule) : null;
  if (!schedule || !label) return { error: problem("This circle doesn't keep a daily count", 404) };
  const { canChangeDays } = scheduleAccess(ctx.user, ctx.directory, circleId, schedule);
  if (record && !canChangeDays)
    return {
      error: forbidden(
        `Only households on the rotation, the circle, and the Board can record ${label.toLowerCase()}`
      ),
    };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  return { actor: ctx.actor, circle, schedule, label, canRecord: canChangeDays };
}

export function eggProblem(reason: Failure) {
  switch (reason) {
    case "future":
      return problem("Counts can only be recorded for today and days gone by");
    case "too_old":
      return problem("That's too long ago to record");
  }
}

/** What to tell someone whose photo wasn't read: plainly, and that typing the counts in still works. */
export function readerProblem(reason: ReaderFailure) {
  switch (reason) {
    case "not_configured":
      return problem("Reading photos isn't set up yet — type the counts in", 503);
    case "busy":
      return problem(
        "Lots of photos are being read just now — try again in a minute, or type the counts in",
        503
      );
    case "timeout":
      return problem("Reading the photo took too long — try again, or type the counts in", 502);
    case "unreadable":
      return problem(
        "The counts couldn't be read from that photo — try a sharper photo of the whole page, or type them in",
        502
      );
    case "failed":
      return problem("The photo couldn't be read just now — try again, or type the counts in", 502);
  }
}
