import { NextRequest, NextResponse } from "next/server";
import { pageContext, perspectiveProblem } from "@/lib/wiki/http";
import { listPerspectives, startPerspective, startSchema } from "@/lib/wiki/perspectives";
import { isLive, summaryOf } from "@/lib/wiki/perspectives-shared";
import { problem, readBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/** A page's alternative versions: those still being worked on first, then the rest, newest first. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const list = (await listPerspectives(ctx.page.id)).sort(
    (a, b) => Number(isLive(b)) - Number(isLive(a)) || b.updatedAt.localeCompare(a.updatedAt)
  );
  return NextResponse.json(
    {
      perspectives: list.map((perspective) => summaryOf(perspective, ctx.page.updatedAt)),
      canStart: !ctx.page.meetingDate,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Start your own version of a page (any resident): a copy of it as it is now. Not of a meeting's notes. */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  if (!rateLimit(`perspective-start:${ctx.user.id}`, 10))
    return problem("That's a lot of versions at once — wait a minute", 429);
  if (ctx.page.meetingDate)
    return problem("A meeting's notes are its record: edit them instead of writing a version");
  const parsed = await readBody(request, startSchema);
  if ("error" in parsed) return parsed.error;
  const result = await startPerspective(ctx.page, ctx.actor, parsed.data);
  if (!result.ok) return perspectiveProblem(result.reason);
  return NextResponse.json({ perspective: result.value }, { status: 201 });
}
