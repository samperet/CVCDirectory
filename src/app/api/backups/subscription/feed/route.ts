import { NextRequest, NextResponse } from "next/server";
import { dropFeed, makeFeed, subscriptionOf } from "@/lib/backups/store";
import { backupContext, personOf } from "@/lib/backups/http";
import { throttled } from "@/lib/http";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * POST: a new feed address (any old one stops working), shown this once —
 * only its hash is kept. DELETE: stop the feed.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "backups-feed", "Too many new feeds — wait a minute", 10);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const token = await makeFeed(personOf(ctx));
  return NextResponse.json(
    {
      url: `${siteUrl()}/api/backups/feed?token=${token}`,
      subscription: await subscriptionOf(ctx.actor.personId),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function DELETE(request: NextRequest) {
  const limited = throttled(request, "backups-feed", "Too many changes — wait a minute", 10);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  await dropFeed(personOf(ctx));
  return NextResponse.json({ subscription: await subscriptionOf(ctx.actor.personId) });
}
