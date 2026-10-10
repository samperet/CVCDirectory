import { NextRequest, NextResponse } from "next/server";
import { wikiSession } from "@/lib/wiki/http";
import { canManagePage } from "@/lib/wiki/access";
import { listTrash, restoreFromTrash } from "@/lib/wiki/trash";
import { BOARD_ID } from "@/lib/circles/ids";
import { notFound, problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Bring a page back from the trash (whoever could delete it: its circle, the
 * Board, admins). If another page took its title meanwhile it comes back as
 * "Title (restored)"; if its circle is gone, the Board keeps it.
 */
export async function POST(request: NextRequest, { params }: { params: { pageId: string } }) {
  const limited = throttled(request, "wiki-trash");
  if (limited) return limited;
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const entry = (await listTrash()).find((candidate) => candidate.page.id === params.pageId);
  if (!entry) return notFound("Page in the trash");
  if (!canManagePage(ctx.user, ctx.directory, entry.page))
    return problem("Only the circle that kept this page (or the Board) can restore it", 403);
  const circleGone = !ctx.directory.circles.some((circle) => circle.id === entry.page.keeper);
  const result = await restoreFromTrash(entry.page.id, circleGone ? { keeper: BOARD_ID } : {});
  if (!result.ok)
    return result.reason === "full"
      ? problem("The wiki has as many pages as it can hold", 409)
      : notFound("Page in the trash");
  return NextResponse.json({ page: result.page });
}
