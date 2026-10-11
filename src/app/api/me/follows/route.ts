import { NextResponse } from "next/server";
import { pagesFollowedBy } from "@/lib/wiki/follows";
import { readPages } from "@/lib/wiki/store";
import { reader } from "@/lib/me/http";

export const dynamic = "force-dynamic";

/** The pages you follow (those still there), by title — for your notification settings. */
export async function GET() {
  const ctx = await reader();
  if ("error" in ctx) return ctx.error;
  const [ids, pages] = await Promise.all([pagesFollowedBy(ctx.user.id), readPages()]);
  const followed = pages
    .filter((page) => ids.includes(page.id))
    .map((page) => ({ id: page.id, slug: page.slug, title: page.title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return NextResponse.json(
    { pages: followed },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
