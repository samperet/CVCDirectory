import { NextRequest, NextResponse } from "next/server";
import { isSlug, restoreSchema, restoreVersion } from "@/lib/wiki/store";
import { wikiContext, wikiProblem } from "@/lib/wiki/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Bring back an earlier version of a page (`index` in its history). */
export async function POST(request: NextRequest, { params }: { params: { id: string; slug: string } }) {
  const ctx = await wikiContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  if (!isSlug(params.slug)) return wikiProblem("not_found");
  const parsed = restoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Choose a version to restore");
  const result = await restoreVersion(params.id, params.slug, { userId: ctx.user.id, name: ctx.user.name }, parsed.data.index);
  return result.ok ? NextResponse.json({ page: result.page }) : wikiProblem(result.reason);
}
