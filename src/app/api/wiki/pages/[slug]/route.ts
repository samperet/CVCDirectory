import { NextRequest, NextResponse } from "next/server";
import { deleteJson } from "@/lib/storage";
import {
  deletePage,
  getHistory,
  pageUpdateSchema,
  updatePage,
  type WikiPage,
} from "@/lib/wiki/store";
import { deletePageComments } from "@/lib/wiki/comments";
import { pageAudience, pageContext, wikiProblem } from "@/lib/wiki/http";
import { problem, readBody } from "@/lib/http";
import { claimAnnouncements, pollIdsIn } from "@/lib/polls/wiki";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { isCommunity } from "@/lib/circles/ids";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/** A page, its earlier versions, and whether you can edit it or change its settings. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    {
      page: ctx.page,
      history: await getHistory(ctx.page.id),
      canEdit: ctx.canEdit,
      canManage: ctx.canManage,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Save a new version (title and/or body), a new colour (its editors), or
 * its settings — keeper, who sees it, who edits it (its keeper circle).
 * Polls newly in the page are announced.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug, "edit");
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, pageUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const update = parsed.data;
  const settings =
    update.keeper !== undefined || update.view !== undefined || update.edit !== undefined;
  if (settings && !ctx.canManage)
    return problem(
      "Only the circle that keeps this page (or the Board) can change who keeps, sees, or edits it",
      403
    );
  const known = new Set(ctx.directory.circles.map((circle) => circle.id));
  if (update.keeper && !known.has(update.keeper)) return problem("That circle doesn't exist", 404);
  if (update.view?.kind === "circles" && update.view.circles.some((id) => !known.has(id)))
    return problem("One of those circles doesn't exist", 404);

  const before = ctx.page;
  const result = await updatePage(params.slug, ctx.actor, update);
  if (!result.ok && result.reason === "conflict") {
    const current = (await pageContext(params.slug)) as { page?: WikiPage };
    return NextResponse.json(
      {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: `${
          current.page?.updatedBy.name ?? "Someone"
        } saved this page while you were editing it`,
        page: current.page,
      },
      { status: 409 }
    );
  }
  if (!result.ok) return wikiProblem(result.reason);
  if (result.page) {
    const had = new Set(pollIdsIn(before.body));
    const fresh = await claimAnnouncements(
      pollIdsIn(result.page.body).filter((id) => !had.has(id))
    );
    const audience = await pageAudience(ctx.directory, result.page);
    for (const poll of fresh) {
      const circle = ctx.directory.circles.find((entry) => entry.id === poll.circleId);
      const members = poll.membersOnly
        ? await userIdsForPeople(circle?.seats.map((seat) => seat.personId) ?? [])
        : null;
      const only =
        members && audience ? members.filter((id) => audience.includes(id)) : members ?? audience;
      await notify({
        topic: "polls",
        title:
          isCommunity(poll.circleId) || !circle
            ? `New poll: ${poll.question}`
            : `New ${circle.name} poll: ${poll.question}`,
        body: `${poll.authorName} asks: ${poll.poll.options
          .map((option) => option.text)
          .join(" · ")}`,
        url: `/wiki/${result.page.slug}`,
        tag: `wiki-poll-${poll.id}`,
        exceptUserId: ctx.user.id,
        ...(only ? { onlyUserIds: only } : {}),
      });
    }
  }
  return NextResponse.json({ page: result.page });
}

/** Delete a page (its parent circle): its history and comments go too. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug, "manage");
  if ("error" in ctx) return ctx.error;
  const result = await deletePage(params.slug);
  if (!result.ok) return wikiProblem(result.reason);
  await deletePageComments(ctx.page.id);
  await deleteJson(`wiki/history/${ctx.page.id}.json`);
  return NextResponse.json({ ok: true });
}
