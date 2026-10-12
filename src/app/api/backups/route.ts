import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { listBackups, listSubscribers, subscriptionOf } from "@/lib/backups/store";
import { backupContext } from "@/lib/backups/http";
import { makeBackup } from "@/lib/backups/make";
import { sendBackup } from "@/lib/backups/send";
import { forbidden, problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";
// Every stored object is read and written again, into the zip.
export const maxDuration = 300;

/**
 * GET: the backups kept, your sign-up, and (for admins) how many are signed
 * up and whether the weekly one is scheduled. POST (admins): make one now —
 * kept with the others and sent to everyone signed up, as the weekly one is.
 */
export async function GET() {
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const [backups, subscription, subscribers] = await Promise.all([
    listBackups(),
    subscriptionOf(ctx.actor.personId),
    ctx.actor.admin ? listSubscribers() : Promise.resolve([]),
  ]);
  return NextResponse.json(
    {
      backups,
      subscription,
      isAdmin: ctx.actor.admin,
      ...(ctx.actor.admin
        ? { signedUp: subscribers.length, scheduled: !!process.env.CRON_SECRET }
        : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const limited = throttled(request, "backups-make", "Too many backups at once — wait a minute", 3);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  if (!ctx.actor.admin) return forbidden("Only admins can make a backup now");
  try {
    const backup = await makeBackup(ctx.actor.name);
    waitUntil(sendBackup(backup));
    return NextResponse.json({ backup });
  } catch (error) {
    console.error("[backups] couldn't make one", error instanceof Error ? error.name : "error");
    return problem("The backup couldn't be made — try again in a while", 500);
  }
}
