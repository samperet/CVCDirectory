import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * The community directory — residents' contact details, circles, and carshed
 * allocations — for signed-in residents only. Confirms the account itself,
 * not just the cookie the middleware checked.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to view the directory", 401);
  }
  const directory = await readDirectory();
  if (!directory) {
    return problem("The directory hasn't been imported yet", 503);
  }
  // Applications to join a circle are for that circle's members (GET /api/circles/<id>/applications).
  const circles = directory.circles.map(({ applications: _applications, ...circle }) => circle);
  return NextResponse.json({ ...directory, circles }, { headers: { "Cache-Control": "private, no-store" } });
}
