import { NextRequest, NextResponse } from "next/server";
import { createPage, listPages, pageInputSchema } from "@/lib/wiki/store";
import { wikiContext, wikiProblem } from "@/lib/wiki/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's wiki pages, most recently edited first, and whether you can edit them. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await wikiContext(params.id);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ pages: await listPages(params.id), canEdit: ctx.canEdit }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Add a page. */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await wikiContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  const parsed = pageInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await createPage(params.id, { userId: ctx.user.id, name: ctx.user.name }, parsed.data);
  return result.ok ? NextResponse.json({ page: result.page }, { status: 201 }) : wikiProblem(result.reason);
}
