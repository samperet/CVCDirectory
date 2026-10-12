import { NextRequest } from "next/server";
import { feedOwner, findBackup } from "@/lib/backups/store";
import { serveBackup } from "@/lib/backups/serve";
import { notFound, problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A backup's zip (`file=zip`) or proof (`file=ots`) from a feed: its token is the key. */
export async function GET(request: NextRequest) {
  const limited = throttled(request, "backups-feed-read", "Too many requests — wait a minute", 20);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const token = params.get("token") ?? "";
  const owner = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await feedOwner(token) : null;
  if (!owner) return problem("That feed isn't there — make a new one on the backups page", 404);
  const backup = await findBackup(params.get("id") ?? "");
  if (!backup) return notFound("Backup");
  const file = params.get("file") === "ots" ? "ots" : "zip";
  if (file === "ots" && !backup.timestamped) return notFound("Proof");
  return serveBackup(backup, file);
}
