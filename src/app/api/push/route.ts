import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { preferencesFor, TOPICS } from "@/lib/push/store";
import { vapidKeys } from "@/lib/push/vapid";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** What a device needs to subscribe, and what you've chosen to be notified about. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const [{ publicKey }, preferences] = await Promise.all([vapidKeys(), preferencesFor(user.id)]);
  return NextResponse.json(
    { publicKey, preferences, topics: TOPICS },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
