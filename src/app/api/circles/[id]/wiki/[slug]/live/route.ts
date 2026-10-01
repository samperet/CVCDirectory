import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPage, isSlug } from "@/lib/wiki/store";
import { checkIn, editorsOf, type PageEditor } from "@/lib/wiki/presence";
import { wikiContext, wikiProblem } from "@/lib/wiki/http";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; slug: string } };

/** What an open page (or editor) checks every few seconds: when it was last saved, by whom, and who's editing it. */
async function state(circleId: string, slug: string, editors: PageEditor[]) {
  const page = await getPage(circleId, slug);
  if (!page) return wikiProblem("not_found");
  return NextResponse.json(
    { updatedAt: page.updatedAt, updatedBy: page.updatedBy, editors },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(_request: Request, { params }: Params) {
  const ctx = await wikiContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!isSlug(params.slug)) return wikiProblem("not_found");
  return state(params.id, params.slug, await editorsOf(params.id, params.slug));
}

const checkInSchema = z.object({ editing: z.boolean() });

/** An editor checking in (`editing: true`), or leaving (`false`, sent as the editor closes). */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await wikiContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  if (!isSlug(params.slug)) return wikiProblem("not_found");
  // Sent with sendBeacon as the page closes, so it may arrive as plain text.
  const parsed = checkInSchema.safeParse(await request.text().then((text) => JSON.parse(text)).catch(() => null));
  if (!parsed.success) return problem("Say whether you're editing");
  const editors = await checkIn(params.id, params.slug, { userId: ctx.user.id, name: ctx.user.name }, parsed.data.editing);
  return state(params.id, params.slug, editors);
}
