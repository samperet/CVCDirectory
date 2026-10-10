import { NextResponse } from "next/server";
import { wikiSession } from "@/lib/wiki/http";
import { canManagePage } from "@/lib/wiki/access";
import { keptUntil, listTrash } from "@/lib/wiki/trash";

export const dynamic = "force-dynamic";

/**
 * The pages in the trash (every resident sees it, as every page is seen by
 * all), most recently deleted first: each with when it's kept until and
 * whether you can restore it (whoever could delete it) — and whether you can
 * delete pages for good (admins).
 */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const trash = await listTrash();
  return NextResponse.json(
    {
      pages: trash.map((entry) => ({
        id: entry.page.id,
        title: entry.page.title,
        body: entry.page.body,
        keeper: entry.page.keeper,
        meetingDate: entry.page.meetingDate ?? null,
        deletedAt: entry.deletedAt,
        deletedBy: entry.deletedBy.name,
        keptUntil: keptUntil(entry),
        canRestore: canManagePage(ctx.user, ctx.directory, entry.page),
      })),
      canDeleteForever: ctx.actor.admin,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
