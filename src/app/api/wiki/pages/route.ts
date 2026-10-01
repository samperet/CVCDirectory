import { NextRequest, NextResponse } from "next/server";
import { createPage, getPageById, listPages, pageInputSchema } from "@/lib/wiki/store";
import { canEditPage, circlesYouKeep, visiblePages } from "@/lib/wiki/access";
import { wikiProblem, wikiSession } from "@/lib/wiki/http";
import { COMMUNITY_ID } from "@/lib/circles/store";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The pages you can see (most recently edited first), and the circles you could make a new page's keeper. */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    { pages: visiblePages(ctx.user, ctx.directory, await listPages()), keepers: circlesYouKeep(ctx.user, ctx.directory) },
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
  const parsed = pageInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const { from, keeper: asked, ...input } = parsed.data;
  const source = from && !asked ? await getPageById(from) : null;
  const keeper = asked ?? (source && canEditPage(ctx.user, ctx.directory, source) ? source.keeper : COMMUNITY_ID);
  if (!ctx.directory.circles.some((circle) => circle.id === keeper)) return problem("Choose the circle that keeps it", 404, "Not Found");
  // Your own circles' — or, started from a page you can edit, that page's circle.
  if (!canUploadTo(ctx.user, ctx.directory, keeper) && !(source && source.keeper === keeper)) {
    return problem("You can only start pages kept by your own circles", 403, "Forbidden");
  }
  const result = await createPage({ userId: ctx.user.id, name: ctx.user.name }, { ...input, keeper });
  return result.ok ? NextResponse.json({ page: result.page }, { status: 201 }) : wikiProblem(result.reason);
}
