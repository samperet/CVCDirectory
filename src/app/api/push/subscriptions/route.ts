import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { removeSubscriptions, saveSubscription, subscriptionSchema } from "@/lib/push/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Turn on notifications for this device. */
export async function POST(request: NextRequest) {
  if (!rateLimit(`push:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("That notification subscription isn't valid");
  await saveSubscription(user.id, parsed.data);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Turn off notifications for this device. */
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Say which device to turn off");
  await removeSubscriptions([parsed.data.endpoint], user.id);
  return NextResponse.json({ ok: true });
}
