import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setEmail, viewOf } from "@/lib/backups/store";
import { backupContext, personOf } from "@/lib/backups/http";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.boolean() });

/** Get an email when each backup is ready, or stop them. */
export async function PATCH(request: NextRequest) {
  const limited = throttled(request, "backups-subscription");
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const subscriber = await setEmail(personOf(ctx), parsed.data.email);
  return NextResponse.json({ subscription: viewOf(subscriber) });
}
