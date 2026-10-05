import { NextRequest, NextResponse } from "next/server";
import { createSignInLink } from "@/lib/auth/sign-in-links";
import { findSignInPerson, maskEmail, sendSignInEmail, signInEmailOf } from "@/lib/auth/sign-in";
import { linkRequestSchema } from "@/lib/auth/validation";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Ask for a sign-in link: chosen by name, it goes to that resident's address
 * in the directory (never one typed here), with a code to type instead.
 * Answers with the address half-hidden, so they know where to look.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "sign-in-link", "Too many requests. Please wait a minute.");
  if (limited) return limited;
  const parsed = await readBody(request, linkRequestSchema);
  if ("error" in parsed) return parsed.error;
  const person = await findSignInPerson(parsed.data.personId);
  const email = person && signInEmailOf(person);
  if (!person || !email)
    return problem(
      "We don't have an email address for you — ask the Board Secretary to add one",
      404
    );
  const link = await createSignInLink(person.id, parsed.data.next);
  if (link === "too-many")
    return problem(
      "You've asked for several links in the last hour — use the newest one, or try again later",
      429,
      "Too Many Requests"
    );
  if (!(await sendSignInEmail(person, email, link.token, link.code)))
    return problem("We couldn't send the email just now. Please try again in a few minutes.", 503);
  return NextResponse.json({ sentTo: maskEmail(email) });
}
