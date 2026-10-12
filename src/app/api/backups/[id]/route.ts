import { NextRequest } from "next/server";
import { findBackup } from "@/lib/backups/store";
import { backupContext } from "@/lib/backups/http";
import { serveBackup } from "@/lib/backups/serve";
import { notFound } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Download a backup (`?file=zip`, the default) or its OpenTimestamps proof (`?file=ots`). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const backup = await findBackup(params.id);
  if (!backup) return notFound("Backup");
  const file = request.nextUrl.searchParams.get("file") === "ots" ? "ots" : "zip";
  if (file === "ots" && !backup.timestamped) return notFound("Proof");
  return serveBackup(backup, file);
}
