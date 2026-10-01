import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { buildWikiGraph } from "@/lib/pins/graph";

export const dynamic = "force-dynamic";

/** Admins only: how every note connects — to its circle, its links, and where it's pinned. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in first", 401, "Unauthorized");
  if (!isAdmin(user)) return problem("Only admins can see the notes map", 403, "Forbidden");
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  return NextResponse.json(await buildWikiGraph(directory), { headers: { "Cache-Control": "private, no-store" } });
}
