import { NextRequest, NextResponse } from "next/server";
import { getRealSessionUser, getViewAs } from "@/lib/auth/session";
import { markTourSeen } from "@/lib/auth/users";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * The welcome tour is done (finished or skipped): it won't open by itself
 * again, on any device. It can still be taken from the account menu.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "tour");
  if (limited) return limited;
  const user = await getRealSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (await getViewAs()) return problem("You're viewing the app as someone else", 403);
  await markTourSeen(user.id);
  return NextResponse.json({ ok: true });
}
