import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admins";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { canManageCircle } from "@/lib/circles/icons";
import { BOARD_ID, circleInputSchema, createCircle } from "@/lib/circles/store";
import { possessive } from "@/lib/text";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Start a new circle or social club; its founder becomes the first member.
 * Official (sociocratic) circles are the Board's and admins' to form; anyone
 * can start a social club. A sub group of a circle (`parentId`) is started by
 * that circle's members (or the Board), and is of the circle's kind.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "circles");
  if (limited) return limited;
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;

  const parsed = await readBody(request, circleInputSchema);
  if ("error" in parsed) return parsed.error;

  const parent = parsed.data.parentId
    ? ctx.directory.circles.find((circle) => circle.id === parsed.data.parentId)
    : undefined;
  if (parsed.data.parentId) {
    if (!parent) return problem("That circle no longer exists", 404);
    if (!isAdmin(ctx.user) && !canManageCircle(ctx.directory, parent.id, ctx.personId))
      return problem(
        `Only ${possessive(parent.name)} members (or the Board) can start a sub group of it`,
        403
      );
  } else if (
    parsed.data.kind === "circle" &&
    !isAdmin(ctx.user) &&
    !canManageCircle(ctx.directory, BOARD_ID, ctx.personId)
  ) {
    return problem("Only the Board can form an official circle — start a social club instead", 403);
  }

  const founder = ctx.directory.people.find((person) => person.id === ctx.personId);
  const result = await createCircle(ctx.imported, parsed.data, {
    personId: ctx.personId,
    name: founder?.displayName ?? ctx.user.name,
  });
  return result.ok
    ? NextResponse.json({ circle: result.value }, { status: 201 })
    : circleProblem(result.reason);
}
