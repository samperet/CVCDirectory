import { NextRequest, NextResponse } from "next/server";
import { peekSignInLink, redeemSignInLink, type LinkFailure } from "@/lib/auth/sign-in-links";
import { findSignInPerson, signedIn } from "@/lib/auth/sign-in";
import { isLinkToken } from "@/lib/auth/validation";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * A sign-in link. Opening it (GET) only says whose it is — mail scanners
 * open links, and must not use them up; the page's button (POST) signs in.
 */

const FAILURES: Record<LinkFailure, string> = {
  unknown: "This sign-in link isn't valid. Ask for a new one.",
  expired: "This sign-in link has expired. Ask for a new one.",
  used: "This sign-in link has already been used. Ask for a new one if you need to sign in again.",
};

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const limited = throttled(request, "sign-in-link-open");
  if (limited) return limited;
  if (!isLinkToken(params.token)) return problem(FAILURES.unknown, 404);
  const link = await peekSignInLink(params.token);
  if (typeof link === "string") return problem(FAILURES[link], 410, "Gone");
  const person = await findSignInPerson(link.personId);
  if (!person) return problem(FAILURES.unknown, 404);
  return NextResponse.json(
    { name: person.displayName },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const limited = throttled(request, "sign-in-link-use");
  if (limited) return limited;
  if (!isLinkToken(params.token)) return problem(FAILURES.unknown, 404);
  const used = await redeemSignInLink(params.token);
  if (typeof used === "string") return problem(FAILURES[used], 410, "Gone");
  const person = await findSignInPerson(used.personId);
  if (!person) return problem(FAILURES.unknown, 404);
  return signedIn(person, used.next);
}
