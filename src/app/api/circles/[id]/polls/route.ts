import { NextRequest, NextResponse } from "next/server";
import { createWikiPoll, listWikiPolls, pollsContext, wikiPollInputSchema } from "@/lib/polls/wiki";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's wiki polls, and what you can do with them. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pollsContext(params.id);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    { polls: await listWikiPolls(params.id), canCreate: ctx.canCreate, canModerate: ctx.canModerate, isMember: ctx.isMember },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Add a poll, to place in a wiki page (`::poll{id="…"}`): whoever edits the
 * circle's wiki. It's announced when the page holding it is saved.
 */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`wiki-poll:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await pollsContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canCreate) return problem(`Only those who edit ${ctx.circle.name}'s wiki can add polls to it`, 403, "Forbidden");
  const parsed = wikiPollInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const membersOnly = params.id !== "community" && parsed.data.membersOnly;
  const poll = await createWikiPoll(params.id, { id: ctx.user.id, name: ctx.user.name }, { ...parsed.data, membersOnly });
  return NextResponse.json({ poll }, { status: 201 });
}
