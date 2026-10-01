import { NextResponse } from "next/server";
import { backlinksTo } from "@/lib/wiki/backlinks";
import { pageContext } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

/** The pages (that you can see) that link to or embed this one. */
export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const backlinks = await backlinksTo(ctx.page, ctx.user, ctx.directory);
  return NextResponse.json({ backlinks }, { headers: { "Cache-Control": "private, no-store" } });
}
