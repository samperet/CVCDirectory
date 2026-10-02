import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { preferencesSchema, updatePreferences } from "@/lib/push/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Choose what to be notified about (applies to all your devices). */
export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Unknown notification setting");
  return NextResponse.json({ preferences: await updatePreferences(user.id, parsed.data) });
}
