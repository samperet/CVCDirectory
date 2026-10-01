import { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { problem } from "@/lib/http";
import { isAdmin } from "@/lib/auth/admins";
import { getPin, removePin } from "@/lib/pins/store";
import { canPinTo, resolveTarget } from "@/lib/pins/server";

export const dynamic = "force-dynamic";

/** Unpin: whoever pinned it, anyone who can pin to the same place, or an admin. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const pin = await getPin(ctx.directory.circles, params.id);
  if (!pin) return problem("That pin is already gone", 404, "Not Found");
  const resolved = await resolveTarget(ctx.directory, pin.target);
  const allowed = isAdmin(ctx.user) || pin.pinnedBy.personId === ctx.personId || (!!resolved && canPinTo(ctx.user, ctx.directory, resolved));
  if (!allowed) return problem("You can't unpin that", 403, "Forbidden");
  await removePin(ctx.directory.circles, pin.id);
  return NextResponse.json({ ok: true });
}
