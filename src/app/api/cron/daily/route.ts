import { NextRequest, NextResponse } from "next/server";
import { sendSummaries } from "@/lib/groups/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Once a day (Vercel's cron, which sends `Authorization: Bearer
 * $CRON_SECRET`): the morning summary of circle messages that didn't fit in
 * the free plan's quota when they were written.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json({ summaries: await sendSummaries() });
}
