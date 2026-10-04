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
  return NextResponse.json(await view(saved.invitation), { headers });
}
