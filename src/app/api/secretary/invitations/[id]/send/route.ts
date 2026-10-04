import { NextRequest, NextResponse } from "next/server";
import { emailConfigured } from "@/lib/email/send";
import { notFound, problem, throttled } from "@/lib/http";
import { sendInvitationEmail } from "@/lib/onboarding/email";
import { onboardingProblem, secretaryContext, toListing, welcomeLink } from "@/lib/onboarding/http";
import { welcomeResources } from "@/lib/onboarding/resources";
import { getInvitation, markSent } from "@/lib/onboarding/store";

export const dynamic = "force-dynamic";

/** Email the welcome link again; it then works for another `LINK_DAYS` from now. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const limited = throttled(request, "secretary");
  if (limited) return limited;
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  const invitation = await getInvitation(params.id);
  if (!invitation) return notFound("Invitation");
  if (invitation.personId) return onboardingProblem("already_added");
  if (!emailConfigured())
    return problem("Email isn't set up yet: copy the link and send it yourself", 503);
  const emailed = await sendInvitationEmail({
    to: invitation.email,
    name: invitation.name,
    secretary: ctx.actor.name,
    link: welcomeLink(invitation.id),
    resources: (await welcomeResources()).map((resource) => resource.title),
  });
  if (!emailed) return problem("The email couldn't be sent; try again, or copy the link", 502);
  const sent = await markSent(invitation.id);
  if (!sent.ok) return onboardingProblem(sent.reason);
  return NextResponse.json({ invitation: toListing(sent.invitation, ctx.directory.people) });
}
