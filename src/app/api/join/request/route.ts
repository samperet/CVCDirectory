import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readDirectory } from "@/lib/directory/store";
import { emailConfigured } from "@/lib/email/send";
import { isEmailAddress } from "@/lib/email/shared";
import { problem, readBody } from "@/lib/http";
import { sendInvitationEmail, sendSignInReadyEmail } from "@/lib/onboarding/email";
import { boardSecretary, welcomeLink } from "@/lib/onboarding/http";
import { welcomeResources } from "@/lib/onboarding/resources";
import { markSent, requestToJoin } from "@/lib/onboarding/store";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(isEmailAddress, "Enter your email address"),
  name: z.string().trim().min(2, "Enter your name").max(80, "Names must be 80 characters or fewer"),
});

/** Ask the same address again at most this often (the email goes again). */
const RESEND_AFTER_MS = 10 * 60 * 1000;

/**
 * "I'm new here" on the sign-in page: someone not in the directory asks to
 * join. They're emailed the same welcome form the Board Secretary's
 * invitations link to (so the address is proved theirs); their answers go to
 * the Secretary page, where the Secretary adds them. An address already in
 * the directory is emailed how to sign in instead. The answer is the same
 * whatever the address, so the form can't be used to find out who lives
 * here; a few asks a minute from one place, and one email per address every
 * ten minutes, at most.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit(`join-request:${request.ip ?? "anonymous"}`, 5))
    return problem("Too many requests. Please wait a minute.", 429);
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  if (!emailConfigured())
    return problem("We can't send email just now — ask the Board Secretary to add you.", 503);
  const directory = await readDirectory();
  if (!directory) return problem("Joining isn't open yet", 503);
  const { email, name } = parsed.data;
  const done = NextResponse.json({ sentTo: email });

  const resident = directory.people.find((person) => person.email?.trim().toLowerCase() === email);
  if (resident) {
    await sendSignInReadyEmail({ to: email, name: resident.displayName });
    return done;
  }

  const secretary = boardSecretary(directory);
  const asked = await requestToJoin(secretary ?? { personId: null, name: "The Board Secretary" }, {
    email,
    name,
  });
  if (!asked.ok)
    return problem(
      "There are a lot of open requests right now — ask the Board Secretary to add you.",
      409
    );
  const invitation = asked.invitation;
  const lastSent = invitation.sentAt ? new Date(invitation.sentAt).getTime() : 0;
  if (asked.existing && Date.now() - lastSent < RESEND_AFTER_MS) return done;
  const emailed = await sendInvitationEmail({
    to: email,
    name: invitation.name ?? name,
    secretary: secretary?.name ?? null,
    link: welcomeLink(invitation.id),
    resources: (await welcomeResources()).map((resource) => resource.title),
  });
  if (!emailed) return problem("We couldn't send the email just now. Please try again.", 503);
  await markSent(invitation.id);
  return done;
}
