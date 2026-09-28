import { NextRequest, NextResponse } from "next/server";
import { readDirectory } from "@/lib/directory/store";
import { phoneMatches } from "@/lib/auth/phone";
import { clearFailures, lockedForMs, recordFailure } from "@/lib/auth/lockout";
import { recordSignIn } from "@/lib/auth/sign-in-log";
import { toPublicUser, userForPerson } from "@/lib/auth/users";
import { createSessionValue, sessionCookieOptions } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MISMATCH = "That phone number doesn't match our records for this name";

/**
 * Sign in by choosing your name and entering your phone number. Formatting is
 * ignored (dashes, dots, spaces, parentheses, a leading +1). Five wrong
 * attempts lock the account for 15 minutes.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit(`login:${request.ip ?? "anonymous"}`)) {
    return problem("Too many sign-in attempts. Please wait a minute.", 429, "Too Many Requests");
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const directory = await readDirectory();
  if (!directory) {
    return problem("Sign-in is unavailable until the resident directory is imported", 503, "Service Unavailable");
  }

  const person = directory.people.find((entry) => entry.id === parsed.data.personId);
  if (!person || !(person.phone || person.landline)) {
    return problem(MISMATCH, 401, "Unauthorized");
  }

  const lockedMs = await lockedForMs(person.id);
  if (lockedMs > 0) {
    const minutes = Math.ceil(lockedMs / 60000);
    return problem(
      `Too many incorrect attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
      "Too Many Requests"
    );
  }

  if (!phoneMatches(parsed.data.phone, [person.phone, person.landline])) {
    await recordFailure(person.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return problem(MISMATCH, 401, "Unauthorized");
  }

  await clearFailures(person.id);
  const user = await userForPerson(person);
  let session: string;
  try {
    session = createSessionValue(user.id);
  } catch {
    console.error("[auth] cannot sign sessions: set AUTH_SECRET");
    return problem("Sign-in is temporarily unavailable", 503, "Service Unavailable");
  }
  await recordSignIn(person);
  const response = NextResponse.json({ user: toPublicUser(user) });
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set(name, session, options);
  return response;
}
