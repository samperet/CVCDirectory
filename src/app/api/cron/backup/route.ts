import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { makeBackup } from "@/lib/backups/make";
import { sendBackup } from "@/lib/backups/send";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Whether the request carries Vercel Cron's `Authorization: Bearer <CRON_SECRET>`. */
function fromCron(request: NextRequest, secret: string) {
  const given = new Uint8Array(Buffer.from(request.headers.get("authorization") ?? ""));
  const expected = new Uint8Array(Buffer.from(`Bearer ${secret}`));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The weekly backup (`vercel.json`'s cron, Monday mornings): made, kept, and
 * sent to everyone signed up. Only Vercel Cron may call it — it needs
 * CRON_SECRET set, and does nothing without it.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return problem("The weekly backup needs CRON_SECRET set", 503);
  if (!fromCron(request, secret)) return problem("Only the schedule can start this", 401);
  const backup = await makeBackup("the weekly schedule");
  const sent = await sendBackup(backup);
  return NextResponse.json({ backup: { id: backup.id, bytes: backup.bytes }, ...sent });
}
