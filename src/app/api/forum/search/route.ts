import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { searchForum } from "@/lib/forum/search";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Search the forum's discussions and replies (`q`), best match first. */
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return problem("Sign in to continue", 401);
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const hits = q ? await searchForum(q) : [];
  return NextResponse.json({ threads: hits.slice(0, 50), total: hits.length }, { headers: { "Cache-Control": "private, no-store" } });
}
