import { NextRequest, NextResponse } from "next/server";
import { pageContext, perspectiveProblem } from "@/lib/wiki/http";
import {
  caughtUp,
  getPerspective,
  isAuthor,
  listPerspectives,
  savePerspective,
  saveSchema,
  withdrawPerspective,
} from "@/lib/wiki/perspectives";
import { isLive, isStale, summaryOf } from "@/lib/wiki/perspectives-shared";
import { notFound, problem, readBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string; id: string } };

/**
 * An alternative version, with the page as it is now — and, if the page has
 * moved on since it started, the version with the page's changes brought in
 * (and where they clash), to compare with the page now. Also: the page's
 * other versions still being worked on, and what you can do.
 */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const list = await listPerspectives(ctx.page.id);
  const perspective = list.find((entry) => entry.id === params.id);
  if (!perspective) return notFound("Version");
  const stale = isStale(perspective, ctx.page.updatedAt);
  const live = isLive(perspective);
  const merged = stale && live ? caughtUp(perspective, ctx.page) : null;
  return NextResponse.json(
    {
      perspective,
      page: {
        id: ctx.page.id,
        slug: ctx.page.slug,
        title: ctx.page.title,
        body: ctx.page.body,
        keeper: ctx.page.keeper,
        updatedAt: ctx.page.updatedAt,
      },
      stale,
      caughtUp: merged ? { body: merged.text, clashes: merged.conflicts.length } : null,
      others: list
        .filter((entry) => entry.id !== perspective.id && isLive(entry))
        .map((entry) => summaryOf(entry, ctx.page.updatedAt)),
      canEdit: live && isAuthor(perspective, ctx.actor),
      // Its editors can make it the page — once it has the page's latest changes without clashing.
      canAdopt: live && ctx.canEdit && (!merged || merged.conflicts.length === 0),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Save your version (as you type): its name and/or text, against its last save. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  if (!rateLimit(`perspective-save:${ctx.user.id}`, 120))
    return problem("Too many saves at once — wait a moment", 429);
  const parsed = await readBody(request, saveSchema);
  if ("error" in parsed) return parsed.error;
  const result = await savePerspective(ctx.page.id, params.id, ctx.actor, parsed.data);
  if (!result.ok) {
    if (result.reason === "conflict")
      return NextResponse.json(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "It was saved somewhere else since — reload it to carry on",
          perspective: await getPerspective(ctx.page.id, params.id),
        },
        { status: 409 }
      );
    return perspectiveProblem(result.reason);
  }
  return NextResponse.json({ perspective: result.value });
}

/** Withdraw your version (it's kept, read-only). */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const result = await withdrawPerspective(ctx.page.id, params.id, ctx.actor);
  return result.ok
    ? NextResponse.json({ perspective: result.value })
    : perspectiveProblem(result.reason);
}
