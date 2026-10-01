import { NextRequest, NextResponse } from "next/server";
import { createPage, getPageById, listPages, pageInputSchema } from "@/lib/wiki/store";
import { canEditPage, canViewPage, circlesYouKeep, visiblePages } from "@/lib/wiki/access";
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
 * Add a page. Under another page (`parentId`): whoever can edit that page,
 * and it's kept by the same circle. Otherwise: kept by `keeper` (one of your
 * circles; Community if none is given).
 */
export async function POST(request: NextRequest) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const parsed = pageInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const { parentId, keeper: asked, ...input } = parsed.data;
  let keeper = asked ?? COMMUNITY_ID;
  if (parentId) {
    const parent = await getPageById(parentId);
    if (!parent || !canViewPage(ctx.user, ctx.directory, parent)) return wikiProblem("bad_parent");
    if (!canEditPage(ctx.user, ctx.directory, parent)) return problem("Only those who can edit that page can start pages under it", 403, "Forbidden");
    keeper = asked && canUploadTo(ctx.user, ctx.directory, asked) ? asked : parent.keeper;
  } else {
    if (!ctx.directory.circles.some((circle) => circle.id === keeper)) return problem("Choose the circle that keeps it", 404, "Not Found");
    if (!canUploadTo(ctx.user, ctx.directory, keeper)) return problem("You can only start pages kept by your own circles", 403, "Forbidden");
  }
  const result = await createPage({ userId: ctx.user.id, name: ctx.user.name }, { ...input, keeper, ...(parentId ? { parentId } : {}) });
  return result.ok ? NextResponse.json({ page: result.page }, { status: 201 }) : wikiProblem(result.reason);
}
