import { NextResponse } from "next/server";
import { pageContext, perspectiveProblem } from "@/lib/wiki/http";
import { catchUp } from "@/lib/wiki/perspectives";

export const dynamic = "force-dynamic";

/**
 * Bring the page's changes since your version started into it: where you
 * both changed the same passage, yours stays, and how many such clashes
 * there were is said.
 */
export async function POST(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const result = await catchUp(ctx.page.id, params.id, ctx.actor, ctx.page);
  if (!result.ok) return perspectiveProblem(result.reason);
  return NextResponse.json({
    perspective: result.value.perspective,
    clashes: result.value.conflicts.length,
  });
}
