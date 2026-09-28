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
    return problem("Sign in to view the directory", 401, "Unauthorized");
  }
  const directory = await readDirectory();
  if (!directory) {
    return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  }
  return NextResponse.json(directory, { headers: { "Cache-Control": "private, no-store" } });
}
