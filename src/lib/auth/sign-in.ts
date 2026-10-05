import { NextResponse } from "next/server";
import { readDirectory } from "@/lib/directory/store";
import { button, emailLayout, PALETTE, paragraphs } from "@/lib/email/templates/layout";
import { sendDirectEmail } from "@/lib/email/send";
import { isEmailAddress } from "@/lib/email/shared";
import { problem } from "@/lib/http";
import { siteUrl } from "@/lib/site-url";
import { createSessionValue, sessionCookieOptions } from "./session";
import { recordSignIn } from "./sign-in-log";
import { LINK_TTL_MS } from "./sign-in-links";
import { toPublicUser, userForPerson } from "./users";

/**
 * Signing in by email: who can (residents with an email address in the
 * directory), the email with the link and code, and the response that
 * starts a session once a link or code has been used.
 */

export const signInEmailOf = (person: { email: string | null }) => {
  const email = person.email?.trim().toLowerCase();
  return email && isEmailAddress(email) ? email : null;
};

/** "a•••@example.org": enough to recognise, not enough to collect. */
export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
};

export async function findSignInPerson(personId: string) {
  const directory = await readDirectory();
  if (!directory) return null;
  return directory.people.find((person) => person.id === personId) ?? null;
}

/** Email someone their link and code: whether it went, and why each sender refused if not. */
export function sendSignInEmail(
  person: { displayName: string },
  to: string,
  token: string,
  code: string
) {
  const link = `${siteUrl()}/login/${token}`;
  const minutes = LINK_TTL_MS / 60_000;
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const hello = `Hello ${person.displayName.split(/\s+/)[0]},`;
  const note = `The link and code work once, for ${minutes} minutes. If you didn't ask to sign in, you can ignore this email — nobody can sign in without it.`;
  return sendDirectEmail("sign-in", {
    to,
    subject: `Sign in to Common Pastures (code ${spaced})`,
    text: [
      hello,
      "",
      "Open this link to sign in to Common Pastures:",
      link,
      "",
      `Or type this code where you asked to sign in: ${spaced}`,
      "",
      note,
    ].join("\n"),
    html: emailLayout({
      preheader: `Your sign-in code is ${spaced}.`,
      body: `${paragraphs(`${hello}\n\nTap the button to sign in to Common Pastures.`)}${button(
        link,
        "Sign in"
      )}${paragraphs(
        "Or type this code where you asked to sign in — handy on an app added to your home screen:"
      )}<p style="margin:4px 0 20px;font:700 30px/1.2 ui-monospace,Menlo,monospace;letter-spacing:6px;color:${
        PALETTE.text
      }">${spaced}</p>${paragraphs(note)}`,
      footer: "Sent because someone asked to sign in as you on Common Pastures.",
    }),
  });
}

/** Start a session for a resident whose link or code was just used. */
export async function signedIn(person: { id: string; displayName: string }, next?: string) {
  const user = await userForPerson(person);
  let session: string;
  try {
    session = createSessionValue(user.id);
  } catch {
    console.error("[auth] cannot sign sessions: set AUTH_SECRET");
    return problem("Sign-in is temporarily unavailable", 503);
  }
  await recordSignIn(person);
  const response = NextResponse.json({ user: toPublicUser(user), next: next ?? "/" });
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set(name, session, options);
  return response;
}
