import { NextRequest, NextResponse } from "next/server";
import { readDirectory } from "@/lib/directory/store";
import { problem, readBody, throttled } from "@/lib/http";
import { joinContext, onboardingProblem } from "@/lib/onboarding/http";
import { welcomeResources } from "@/lib/onboarding/resources";
import {
  invitationStatus,
  linkExpired,
  type Invitation,
  type WelcomeView,
} from "@/lib/onboarding/shared";
import { answersSchema, saveAnswers } from "@/lib/onboarding/store";
import { intakeManagers } from "@/lib/onboarding/http";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

type Params = { params: { token: string } };

/** What a new member's welcome page shows. Their resources only while the link works. */
async function view(invitation: Invitation): Promise<WelcomeView> {
  const expired = linkExpired(invitation);
  const [resources, directory] = await Promise.all([
    expired ? [] : welcomeResources(),
    invitation.personId ? readDirectory() : null,
  ]);
  const answered = invitation.answers
    ? `${invitation.answers.firstName} ${invitation.answers.lastName}`.trim()
    : null;
  return {
    name: answered ?? invitation.name,
    email: invitation.email,
    invitedBy: invitation.invitedBy.name,
    selfRequested: !!invitation.selfRequested,
    status: invitationStatus(invitation),
    expired,
    answers: expired ? null : invitation.answers,
    signInName:
      directory?.people.find((person) => person.id === invitation.personId)?.displayName ?? null,
    signInUrl: `${siteUrl()}/login`,
    resources,
  };
}

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

/** A new member's welcome page, from the token in their link (no account needed). */
export async function GET(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "join");
  if (limited) return limited;
  const ctx = await joinContext(params.token);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await view(ctx.invitation), { headers });
}

/** Push (and email, for those who chose it) to the people who add new members. */
async function announceAnswers(invitation: Invitation) {
  const directory = await readDirectory();
  if (!directory) return;
  const userIds = await userIdsForPeople(intakeManagers(directory));
  if (!userIds.length) return;
  const name = invitation.answers
    ? `${invitation.answers.firstName} ${invitation.answers.lastName}`.trim()
    : invitation.email;
  await notify({
    topic: "circles",
    title: invitation.selfRequested
      ? `${name} asked to join CVC`
      : `${name} sent their welcome form`,
    body: "Their answers are on the Secretary page, ready to add to the directory.",
    url: "/secretary",
    tag: `intake-${invitation.id}`,
    exceptUserId: null,
    onlyUserIds: userIds,
  });
}

/** Send (or change) their answers: a short bio, their name, mobile number, and unit. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "join");
  if (limited) return limited;
  const ctx = await joinContext(params.token);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, answersSchema);
  if ("error" in parsed) return parsed.error;
  const saved = await saveAnswers(ctx.invitation.id, parsed.data);
  if (!saved.ok && saved.reason === "already_added")
    return problem("You're already in the directory, so you can sign in now", 409);
  if (!saved.ok) return onboardingProblem(saved.reason);
  // Their first answers: tell the Board Secretary (and admins) there's someone to add.
  if (!ctx.invitation.answers) await announceAnswers(saved.invitation);
  return NextResponse.json(await view(saved.invitation), { headers });
}
