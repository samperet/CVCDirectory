import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admins";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { canManageCircle } from "@/lib/circles/icons";
import { BOARD_ID, circleInputSchema, createCircle } from "@/lib/circles/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Start a new circle or social club; its founder becomes the first member.
 * Official (sociocratic) circles are the Board's and admins' to form; anyone
 * can start a social club.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit(`circles:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;

  const parsed = circleInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  if (parsed.data.kind === "circle" && !isAdmin(ctx.user) && !canManageCircle(ctx.directory, BOARD_ID, ctx.personId)) {
    return problem("Only the Board can form an official circle — start a social club instead", 403, "Forbidden");
  }

  const founder = ctx.directory.people.find((person) => person.id === ctx.personId);
  const result = await createCircle(ctx.imported, parsed.data, { personId: ctx.personId, name: founder?.displayName ?? ctx.user.name });
  return result.ok ? NextResponse.json({ circle: result.value }, { status: 201 }) : circleProblem(result.reason);
}
