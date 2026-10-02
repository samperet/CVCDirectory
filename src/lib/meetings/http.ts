import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canManageCircle } from "@/lib/circles/icons";
import { isAdmin } from "@/lib/auth/admins";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import type { Circle } from "@/lib/directory/types";
import { claimConsents, type Failure, type ProposalActor } from "./store";

/**
 * Who may do what with a circle's meetings. Every signed-in resident reads
 * them. The circle's members, the Board, and admins take the minutes (and
 * bring proposals); only the circle's own members review proposals — log
 * tensions and raise objections. Admins can withdraw objections and remove
 * comments, as moderators.
 */
export async function meetingsContext(circleId: string) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const admin = isAdmin(ctx.user);
  const member = circle.seats.some((seat) => seat.personId === ctx.personId);
  const actor: ProposalActor = { userId: ctx.user.id, personId: ctx.personId, name: ctx.user.name };
  return {
    user: ctx.user,
    directory: ctx.directory,
    circle,
    actor,
    admin,
    canEdit: admin || canManageCircle(ctx.directory, circleId, ctx.personId),
    canReview: member,
  };
}

export function meetingsProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That meeting, proposal, or comment no longer exists", 404, "Not Found");
    case "forbidden":
      return problem("You can't change that", 403, "Forbidden");
    case "full":
      return problem("There's no room for more here", 409, "Conflict");
    case "closed":
      return problem("This proposal's review is over", 409, "Conflict");
    case "not_in_review":
      return problem("Objections are raised once a proposal is sent for review", 409, "Conflict");
    case "has_proposals":
      return problem("This meeting has proposals that went for review, so it's kept", 409, "Conflict");
    case "unknown_thread":
      return problem("That comment no longer exists", 404, "Not Found");
    case "too_short":
      return problem("Give the reason for your objection", 400, "Bad Request");
  }
}

export const editProblem = () => problem("Only this circle's members, the Board, and admins can take its minutes", 403, "Forbidden");
export const reviewProblem = () => problem("Only this circle's members review its proposals", 403, "Forbidden");

export const proposalUrl = (circleId: string, proposalId: string) => `/circles/${circleId}/proposals/${proposalId}`;

/** The circle's members' accounts. */
export const memberUserIds = (circle: Circle) => userIdsForPeople(circle.seats.map((seat) => seat.personId));

/** Tell the circle's members about proposals whose review has just run its course (each once). */
export async function announceConsents(circle: Circle) {
  const fresh = await claimConsents(circle.id);
  if (!fresh.length) return;
  const members = await memberUserIds(circle);
  await Promise.all(
    fresh.map((proposal) =>
      notify({
        topic: "proposals",
        title: `Consented: ${proposal.title}`,
        body: `${circle.name}'s proposal finished its review with no objections.`,
        url: proposalUrl(circle.id, proposal.id),
        tag: `proposal-${proposal.id}`,
        exceptUserId: null,
        onlyUserIds: members,
      })
    )
  );
}
