import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { listSignIns } from "@/lib/auth/sign-in-log";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The sign-in log, newest first — for app admins only. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  if (!isAdmin(user)) return problem("Only admins can view the sign-in log", 403, "Forbidden");
  return NextResponse.json({ entries: await listSignIns() }, { headers: { "Cache-Control": "private, no-store" } });
}
