import { NextResponse } from "next/server";
import { buildWikiGraph } from "@/lib/pins/graph";
import { wikiSession } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

/** The wiki map: how the pages you can see connect — to their circles, their links, and where they're pinned. */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await buildWikiGraph(ctx.directory, ctx.user), { headers: { "Cache-Control": "private, no-store" } });
}
