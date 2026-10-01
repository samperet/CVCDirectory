import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkIn, editorsOf, type PageEditor } from "@/lib/wiki/presence";
import { pageContext } from "@/lib/wiki/http";
import type { WikiPage } from "@/lib/wiki/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/** What an open page (or editor) checks every few seconds: when it was last saved, by whom, and who's editing it. */
const state = (page: WikiPage, editors: PageEditor[]) =>
  NextResponse.json({ updatedAt: page.updatedAt, updatedBy: page.updatedBy, editors }, { headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  return state(ctx.page, await editorsOf(ctx.page.id));
}

const checkInSchema = z.object({ editing: z.boolean() });

/** An editor checking in (`editing: true`), or leaving (`false`, sent as the editor closes). */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug, "edit");
  if ("error" in ctx) return ctx.error;
  // Sent with sendBeacon as the page closes, so it may arrive as plain text.
  const parsed = checkInSchema.safeParse(await request.text().then((text) => JSON.parse(text)).catch(() => null));
  if (!parsed.success) return problem("Say whether you're editing");
  return state(ctx.page, await checkIn(ctx.page.id, { userId: ctx.user.id, name: ctx.user.name }, parsed.data.editing));
}
