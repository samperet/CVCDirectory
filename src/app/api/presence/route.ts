import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealSessionUser, getSessionUser } from "@/lib/auth/session";
import { checkIn, onlineNow } from "@/lib/presence/store";
import { readIndex } from "@/lib/chat/store";
import { directoryPeople } from "@/lib/chat/http";
import { latestChange, unreadCount, type PresenceView } from "@/lib/chat/shared";
import { problem, readBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "private, no-store" } };

/** Who's online (person ids) — for the green dots, and while viewing the app as someone. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to continue", 401);
  return NextResponse.json({ online: await onlineNow() }, noStore);
}

const checkInSchema = z.object({ away: z.boolean().optional() });

/**
 * An open tab checks in each minute (or, `away`, as it closes): who's online,
 * and how many of your conversations have unread messages. Never fails
 * because the check-in couldn't be written. (Refused while viewing as
 * someone, by the middleware.)
 */
export async function POST(request: NextRequest) {
  const user = await getRealSessionUser();
  if (!user?.personId) return problem("Sign in to continue", 401);
  // Per account: residents on one network share an address.
  if (!rateLimit(`presence:${user.id}`, 20)) return problem("Too many check-ins", 429);
  const parsed = await readBody(request, checkInSchema, {});
  if ("error" in parsed) return parsed.error;
  const directory = await directoryPeople().catch(() => null);
  const me = directory ? directory.canonical(user.personId) : user.personId;
  const [online, index] = await Promise.all([
    checkIn(me, !parsed.data.away),
    readIndex(me).catch(() => ({})),
  ]);
  const view: PresenceView = {
    online,
    unread: unreadCount(index, me),
    latestAt: latestChange(index),
  };
  return NextResponse.json(view, noStore);
}
