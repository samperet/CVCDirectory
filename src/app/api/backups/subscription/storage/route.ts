import { NextRequest, NextResponse } from "next/server";
import { dropStorage, setStorage, storageSchema, viewOf } from "@/lib/backups/store";
import { backupContext, personOf } from "@/lib/backups/http";
import { seal } from "@/lib/backups/secret";
import { testStorage } from "@/lib/backups/deliver";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * PUT: your own storage for a copy of each backup (any S3-compatible
 * bucket). CVC writes a small note there first and keeps the settings only
 * if that works; the secret is sealed and never shown again. DELETE: stop.
 */
export async function PUT(request: NextRequest) {
  const limited = throttled(request, "backups-storage", "Too many tries — wait a minute", 10);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, storageSchema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const failed = await testStorage({
    endpoint: input.endpoint,
    region: input.region || "auto",
    bucket: input.bucket,
    prefix: input.prefix,
    accessKeyId: input.accessKeyId,
    secret: seal(input.secretAccessKey),
  });
  if (failed) return problem(`CVC couldn't write to that storage — ${failed}`, 400);
  const subscriber = await setStorage(personOf(ctx), input);
  return NextResponse.json({ subscription: viewOf(subscriber) });
}

export async function DELETE(request: NextRequest) {
  const limited = throttled(request, "backups-storage", "Too many changes — wait a minute", 10);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const subscriber = await dropStorage(personOf(ctx));
  return NextResponse.json({ subscription: viewOf(subscriber) });
}
