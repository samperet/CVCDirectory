import { NextRequest, NextResponse } from "next/server";
import { createPage, getPageById, pageInputSchema, pageSummary, readPages } from "@/lib/wiki/store";
import { excerptOf } from "@/lib/wiki/excerpt";
import { canEditPage, circlesYouKeep, visiblePages } from "@/lib/wiki/access";
import { wikiProblem, wikiSession } from "@/lib/wiki/http";
import { COMMUNITY_ID } from "@/lib/circles/store";
import { canUploadTo } from "@/lib/documents/access";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The pages you can see (most recently edited first, each with its opening lines), and the circles you could make a new page's keeper. */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const pages = visiblePages(ctx.user, ctx.directory, await readPages())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((page) => ({ ...pageSummary(page), excerpt: excerptOf(page.body, 300) }));
  return NextResponse.json(
    { pages, keepers: circlesYouKeep(ctx.user, ctx.directory) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Add a page, kept by `keeper` (one of your circles). Started from a link in
 * another page (`from`, its id) that you can edit, it's kept by that page's
 * circle unless you say otherwise; with neither, by Community.
 */
export async function POST(request: NextRequest) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, pageInputSchema);
  if ("error" in parsed) return parsed.error;
  const { from, keeper: asked, ...input } = parsed.data;
  const source = from && !asked ? await getPageById(from) : null;
  const keeper =
    asked ??
    (source && canEditPage(ctx.user, ctx.directory, source) ? source.keeper : COMMUNITY_ID);
  if (!ctx.directory.circles.some((circle) => circle.id === keeper))
    return problem("Choose the circle that keeps it", 404);
  // Your own circles' — or, started from a page you can edit, that page's circle.
  if (!canUploadTo(ctx.user, ctx.directory, keeper) && !(source && source.keeper === keeper)) {
    return problem("You can only start pages kept by your own circles", 403);
  }
  const result = await createPage(ctx.actor, { ...input, keeper });
  return result.ok
    ? NextResponse.json({ page: result.page }, { status: 201 })
    : wikiProblem(result.reason);
}
