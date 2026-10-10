import { NextResponse } from "next/server";
import { pageContext, perspectiveProblem, wikiProblem } from "@/lib/wiki/http";
import { caughtUp, getPerspective, setOutcome } from "@/lib/wiki/perspectives";
import { isLive, isStale } from "@/lib/wiki/perspectives-shared";
import { updatePage } from "@/lib/wiki/store";
import { notify } from "@/lib/push/notify";
import { notFound, problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Make a version the live page (the page's editors): its text — with the
 * page's changes since it started brought in, if they don't clash — becomes
 * the page, as a new version (the page's history keeps what it replaced).
 * Its author is told.
 */
export async function POST(
  _request: Request,
  { params }: { params: { slug: string; id: string } }
) {
  const ctx = await pageContext(params.slug, "edit");
  if ("error" in ctx) return ctx.error;
  const perspective = await getPerspective(ctx.page.id, params.id);
  if (!perspective) return notFound("Version");
  if (!isLive(perspective)) return perspectiveProblem("closed");
  let body = perspective.body;
  if (isStale(perspective, ctx.page.updatedAt)) {
    const merged = caughtUp(perspective, ctx.page);
    if (merged.conflicts.length)
      return problem(
        "It clashes with changes made to the page since it was started — its author can bring them in first",
        409
      );
    body = merged.text;
  }
  const result = await updatePage(params.slug, ctx.actor, {
    body,
    baseUpdatedAt: ctx.page.updatedAt,
  });
  if (!result.ok) return wikiProblem(result.reason);
  const page = result.page ?? ctx.page;
  await setOutcome(ctx.page.id, perspective.id, {
    kind: "adopted",
    at: new Date().toISOString(),
    by: { name: ctx.user.name },
    pageVersion: page.updatedAt,
  });
  await notify({
    topic: "wiki",
    title: `Your version of “${page.title}” is the page now`,
    body: `${ctx.user.name} made “${perspective.name}” the live page.`,
    url: `/wiki/${page.slug}`,
    tag: `perspective-${perspective.id}`,
    exceptUserId: ctx.user.id,
    onlyUserIds: [perspective.createdBy.userId],
  });
  return NextResponse.json({ page });
}
