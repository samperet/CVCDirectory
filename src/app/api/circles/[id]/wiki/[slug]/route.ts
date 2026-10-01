import { NextRequest, NextResponse } from "next/server";
import { deletePage, getPage, isSlug, pageUpdateSchema, updatePage } from "@/lib/wiki/store";
import { deletePageComments } from "@/lib/wiki/comments";
import { wikiContext, wikiProblem } from "@/lib/wiki/http";
import { problem } from "@/lib/http";
import { removePinsWhere } from "@/lib/pins/store";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; slug: string } };

/** A page, with its earlier versions, and whether you can edit it. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await wikiContext(params.id);
  if ("error" in ctx) return ctx.error;
  const page = isSlug(params.slug) ? await getPage(params.id, params.slug) : null;
  if (!page) return wikiProblem("not_found");
  return NextResponse.json({ page, canEdit: ctx.canEdit }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Save a new version (title and/or body). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await wikiContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  if (!isSlug(params.slug)) return wikiProblem("not_found");
  const parsed = pageUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await updatePage(params.id, params.slug, { userId: ctx.user.id, name: ctx.user.name }, parsed.data);
  if (!result.ok && result.reason === "conflict") {
    const current = await getPage(params.id, params.slug);
    return NextResponse.json(
      { type: "about:blank", title: "Conflict", status: 409, detail: `${current?.updatedBy.name ?? "Someone"} saved this page while you were editing it`, page: current },
      { status: 409 }
    );
  }
  return result.ok ? NextResponse.json({ page: result.page }) : wikiProblem(result.reason);
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await wikiContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  if (!isSlug(params.slug)) return wikiProblem("not_found");
  const page = await getPage(params.id, params.slug);
  const result = await deletePage(params.id, params.slug);
  if (!result.ok) return wikiProblem(result.reason);
  if (page) {
    await deletePageComments(params.id, page.id);
    // A deleted note comes down from everywhere it was pinned.
    await removePinsWhere((pin) => pin.note.circleId === params.id && pin.note.pageId === page.id);
  }
  return NextResponse.json({ ok: true });
}
