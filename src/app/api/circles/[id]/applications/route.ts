import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admins";
import { circleContext } from "@/lib/circles/access";
import { canManageCircle } from "@/lib/circles/icons";

export const dynamic = "force-dynamic";

/**
 * Applications to join a circle: all of them for its members, the Board,
 * and admins; for anyone else, just their own (if they've applied).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await circleContext({ circleId: params.id });
  if ("error" in ctx) return ctx.error;
  const circle = ctx.directory.circles.find((entry) => entry.id === params.id)!;
  const applications = circle.applications ?? [];
  const manager = isAdmin(ctx.user) || canManageCircle(ctx.directory, params.id, ctx.personId);
  return NextResponse.json(
    {
      applications: manager ? applications : [],
      mine: applications.find((application) => application.personId === ctx.personId) ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
