import { NextRequest, NextResponse } from "next/server";
import { emailConfigured } from "@/lib/email/send";
import { problem, readBody, throttled } from "@/lib/http";
import { sendInvitationEmail } from "@/lib/onboarding/email";
import { onboardingProblem, secretaryContext, toListing, welcomeLink } from "@/lib/onboarding/http";
import { welcomeResources } from "@/lib/onboarding/resources";
import {
  createInvitation,
  invitationInputSchema,
  listInvitations,
  markSent,
} from "@/lib/onboarding/store";

export const dynamic = "force-dynamic";

/** The Secretary's invitations to new members, newest first, and whether email can be sent. */
export async function GET() {
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  const invitations = await listInvitations();
  return NextResponse.json(
    {
      invitations: invitations.map((invitation) => toListing(invitation, ctx.directory.people)),
      emailReady: emailConfigured(),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Invite a new member by email (`name` optional): the invitation is saved,
 * then emailed with the link to their welcome form. If email isn't set up, or
 * it doesn't go, the invitation stays and its link can be copied and sent
 * another way (`emailed: false`).
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "secretary");
  if (limited) return limited;
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, invitationInputSchema);
  if ("error" in parsed) return parsed.error;
  const created = await createInvitation(ctx.actor, parsed.data);
  if (!created.ok) return onboardingProblem(created.reason);
  let invitation = created.invitation;
  const emailed =
    emailConfigured() &&
    (await sendInvitationEmail({
      to: invitation.email,
      name: invitation.name,
      secretary: ctx.actor.name,
      link: welcomeLink(invitation.id),
      resources: (await welcomeResources()).map((resource) => resource.title),
    }));
  if (emailed) {
    const sent = await markSent(invitation.id);
    if (!sent.ok) return problem("The invitation was removed while it was being sent", 409);
    invitation = sent.invitation;
  }
  return NextResponse.json(
    { invitation: toListing(invitation, ctx.directory.people), emailed },
    { status: 201 }
  );
}
