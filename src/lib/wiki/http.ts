import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";

/**
 * Who may read and edit a circle's wiki. Every signed-in resident reads it;
 * those who can add the circle's documents — its members, the Board, and
 * admins (anyone, for the Community circle) — edit it, while the circle has
 * its wiki turned on.
 */
export async function wikiContext(circleId: string, { edit = false } = {}) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  if (edit) {
    if (!featureEnabled(circle, "wiki")) return { error: problem(`${circle.name} has turned its wiki off`, 409, "Conflict") };
    if (!canUploadTo(ctx.user, ctx.directory, circleId)) {
      return { error: problem("Only this circle's members, the Board, and admins can edit its wiki", 403, "Forbidden") };
    }
  }
  return { user: ctx.user, directory: ctx.directory, circle, canEdit: featureEnabled(circle, "wiki") && canUploadTo(ctx.user, ctx.directory, circleId) };
}

export function wikiProblem(reason: "not_found" | "exists" | "full" | "no_version") {
  switch (reason) {
    case "not_found":
      return problem("That page no longer exists", 404, "Not Found");
    case "exists":
      return problem("A page with that title already exists", 409, "Conflict");
    case "full":
      return problem("This wiki has as many pages as it can hold", 409, "Conflict");
    case "no_version":
      return problem("That version no longer exists", 404, "Not Found");
  }
}
