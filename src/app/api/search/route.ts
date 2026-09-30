import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { searchSite, type SearchKind } from "@/lib/site-search";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS: SearchKind[] = ["people", "circles", "wiki", "forum", "documents", "tasks", "resources", "library"];

/** Search the whole site (`q`); `kind` narrows to one kind of result and lists more of them. Residents only. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to search", 401, "Unauthorized");
  if (!rateLimit(`search:${user.id}`)) return problem("Too many searches — try again in a minute", 429, "Too Many Requests");
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const kind = request.nextUrl.searchParams.get("kind") as SearchKind | null;
  if (kind && !KINDS.includes(kind)) return problem("Unknown kind of result");
  const groups = q ? await searchSite(q, directory, kind ? 50 : 5) : [];
  return NextResponse.json({ q, groups: kind ? groups.filter((group) => group.kind === kind) : groups }, { headers: { "Cache-Control": "private, no-store" } });
}
