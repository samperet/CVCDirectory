import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { problem, readBody } from "@/lib/http";
import {
  emailPreferences,
  emailPreferencesSchema,
  updateEmailPreferences,
} from "@/lib/email/preferences";
import { TOPICS } from "@/lib/push/topics";

export const dynamic = "force-dynamic";

/** What you're emailed about, and the address it goes to (your directory entry's). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!user.personId) return problem("Your account isn't linked to the directory", 400);
  const [preferences, directory] = await Promise.all([
    emailPreferences(user.personId),
    readDirectory(),
  ]);
  const email = directory?.people.find((person) => person.id === user.personId)?.email ?? null;
  return NextResponse.json(
    { preferences, topics: TOPICS, email },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Choose what to be emailed about. */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!user.personId) return problem("Your account isn't linked to the directory", 400);
  const parsed = await readBody(request, emailPreferencesSchema);
  if ("error" in parsed) return parsed.error;
  return NextResponse.json({
    preferences: await updateEmailPreferences(user.personId, parsed.data),
  });
}
