import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { notify } from "@/lib/push/notify";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Send yourself a test notification on every device you've turned them on for. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "push-test");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  await notify({
    topic: "discussions",
    title: "Notifications are working",
    body: `You'll hear from CVC Directory here, ${user.name.split(" ")[0]}.`,
    url: "/profile",
    tag: "test",
    exceptUserId: null,
    onlyUserIds: [user.id],
    ignorePreferences: true,
  });
  return NextResponse.json({ ok: true });
}
