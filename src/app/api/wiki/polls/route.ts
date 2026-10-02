import { NextRequest, NextResponse } from "next/server";
import { createWikiPoll, listWikiPolls, pollAccess, wikiPollInputSchema } from "@/lib/polls/wiki";
import { pageContext, wikiSession } from "@/lib/wiki/http";
import { problem, throttled } from "@/lib/http";
import { isCommunity } from "@/lib/circles/ids";

export const dynamic = "force-dynamic";

/** The wiki's polls, each with what you can do with it (vote, close) and its circle's name. */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const polls = (await listWikiPolls()).map((poll) => {
    const { memberIds: _members, ...access } = pollAccess(ctx.user, ctx.directory, poll);
    return { ...poll, ...access };
  });
  return NextResponse.json({ polls }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Add a poll, to place in a page (`page`, its slug; then `::poll{id="…"}`):
 * whoever can edit that page. It belongs to the page's keeper circle — whose
 * members alone vote, if it's members-only. It's announced when the page
 * holding it is saved.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "wiki-poll");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { page?: unknown } | null;
  const ctx = await pageContext(typeof body?.page === "string" ? body.page : "", "edit");
  if ("error" in ctx) return ctx.error;
  const parsed = wikiPollInputSchema.safeParse(body);
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const membersOnly = !isCommunity(ctx.page.keeper) && parsed.data.membersOnly;
  const poll = await createWikiPoll(ctx.page.keeper, ctx.actor, { ...parsed.data, membersOnly });
  return NextResponse.json(
    { poll: { ...poll, ...pollAccess(ctx.user, ctx.directory, poll), memberIds: undefined } },
    { status: 201 }
  );
}
