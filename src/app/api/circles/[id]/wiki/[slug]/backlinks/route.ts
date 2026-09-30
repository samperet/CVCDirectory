import { NextResponse } from "next/server";
import { getPage, isSlug } from "@/lib/wiki/store";
import { backlinksTo } from "@/lib/wiki/backlinks";
import { wikiContext, wikiProblem } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

/** The pages, in this wiki and others, that link to this one. */
export async function GET(_request: Request, { params }: { params: { id: string; slug: string } }) {
  const ctx = await wikiContext(params.id);
  if ("error" in ctx) return ctx.error;
  const page = isSlug(params.slug) ? await getPage(params.id, params.slug) : null;
  if (!page) return wikiProblem("not_found");
  const backlinks = await backlinksTo(params.id, page.id, page.title, ctx.directory.circles);
  return NextResponse.json({ backlinks }, { headers: { "Cache-Control": "private, no-store" } });
}
