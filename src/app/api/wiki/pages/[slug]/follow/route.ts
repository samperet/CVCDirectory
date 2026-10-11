import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pageContext } from "@/lib/wiki/http";
import { setFollowing } from "@/lib/wiki/follows";
import { problem, readBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

const schema = z.object({ following: z.boolean() });

/** Follow a page (anyone who can see it — everyone), to hear when it changes; or stop. */
export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  if (!rateLimit(`follow:${ctx.user.id}`, 60)) return problem("Too many changes at once", 429);
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  await setFollowing(ctx.page.id, ctx.user.id, parsed.data.following);
  return NextResponse.json({ following: parsed.data.following });
}
