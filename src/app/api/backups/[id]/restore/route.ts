import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findBackup, noteRestore, storageSchema } from "@/lib/backups/store";
import { backupContext } from "@/lib/backups/http";
import { restoreBackup } from "@/lib/backups/restore";
import { isOwnBucket } from "@/lib/backups/zip-index";
import { forbidden, notFound, problem, readBody, throttled } from "@/lib/http";
import { r2Config } from "@/lib/storage";

export const dynamic = "force-dynamic";
// Every file in the backup is read and written again, into the new bucket.
export const maxDuration = 300;

const targetSchema = storageSchema.pick({
  endpoint: true,
  region: true,
  bucket: true,
  accessKeyId: true,
  secretAccessKey: true,
});

/**
 * Admins: restore a backup into a new, empty bucket (`lib/backups/restore.ts`)
 * and say how it went. The key in the body is used for this and never kept
 * or logged; the log (`backups/restores.json`) notes only where and how it went.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const limited = throttled(request, "backups-restore", "Too many restores — wait a minute", 10);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  if (!ctx.actor.admin) return forbidden("Only admins can test a restore");
  const backup = await findBackup(params.id, { admin: true });
  if (!backup) return notFound("Backup");
  const parsed = await readBody(request, targetSchema);
  if ("error" in parsed) return parsed.error;
  const target = parsed.data;
  if (isOwnBucket(target, r2Config()))
    return problem("That's CVC's own bucket — restore into a new, empty one", 400);
  const outcome = await restoreBackup(backup, { ...target, region: target.region || "auto" });
  const where = `${new URL(target.endpoint).host}/${target.bucket}`;
  await noteRestore({
    at: new Date().toISOString(),
    by: ctx.actor.name,
    backupId: backup.id,
    target: where,
    ok: "report" in outcome && outcome.report.ok,
    objects: "report" in outcome ? outcome.report.objects : 0,
    ...("refused" in outcome
      ? { problem: outcome.refused }
      : outcome.report.ok
        ? {}
        : { problem: outcome.report.checks.find((check) => !check.ok)?.label }),
  });
  if ("refused" in outcome) return problem(outcome.refused, 400);
  return NextResponse.json({ report: outcome.report });
}
