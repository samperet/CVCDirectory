import { NextRequest, NextResponse } from "next/server";
import { restoreSchema, restoreVersion } from "@/lib/wiki/store";
import { pageContext, wikiProblem } from "@/lib/wiki/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Bring back an earlier version of a page (`index` in its history): its editors. */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const ctx = await pageContext(params.slug, "edit");
  if ("error" in ctx) return ctx.error;
  const parsed = restoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Choose a version to restore");
  const result = await restoreVersion(params.slug, ctx.actor, parsed.data.index);
  return result.ok ? NextResponse.json({ page: result.page }) : wikiProblem(result.reason);
}
