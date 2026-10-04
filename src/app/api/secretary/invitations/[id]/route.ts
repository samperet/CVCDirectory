import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findPerson } from "@/lib/directory/manage";
import { notFound, problem, readBody, throttled } from "@/lib/http";
import { sendSignInReadyEmail } from "@/lib/onboarding/email";
import { onboardingProblem, secretaryContext, toListing } from "@/lib/onboarding/http";
import { getInvitation, markAdded, removeInvitation } from "@/lib/onboarding/store";
import { updateProfile } from "@/lib/profiles/store";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const addedSchema = z.object({ personId: z.string().regex(/^[a-f0-9]{12}$/, "Choose a resident") });

/**
 * They're in the directory now (`personId`: just added, or already there):
 * the invitation is done, their bio goes on their profile if it has none,
 * and they're emailed that they can sign in (`emailed`).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "secretary");
  if (limited) return limited;
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, addedSchema);
  if ("error" in parsed) return parsed.error;
  const person = findPerson(ctx.directory, parsed.data.personId);
  if (!person) return problem("They aren't in the directory", 404);
  const invitation = await getInvitation(params.id);
  if (!invitation) return notFound("Invitation");
  const added = await markAdded(invitation.id, person.id);
  if (!added.ok) return onboardingProblem(added.reason);
  if (invitation.answers?.bio && !person.bio)
    await updateProfile(person.id, { bio: invitation.answers.bio });
  const emailed = await sendSignInReadyEmail({ to: invitation.email, name: person.displayName });
  return NextResponse.json({
    invitation: toListing(added.invitation, ctx.directory.people),
    emailed,
  });
}

/** Remove an invitation: its link stops working. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "secretary");
  if (limited) return limited;
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  if (!(await removeInvitation(params.id))) return notFound("Invitation");
  return NextResponse.json({ ok: true });
}
