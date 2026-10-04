import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canManageCircle } from "@/lib/circles/icons";
import { isCommunity } from "@/lib/circles/ids";
import { userIdsForPeople } from "@/lib/auth/users";
import { mailDomain } from "@/lib/email/deliver";
import { notify, excerpt } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import type { Circle } from "@/lib/circles/types";
import { emailGroupPost } from "./send";
import { groupAddress, type GroupPost, type GroupThread } from "./shared";
import type { Failure } from "./store";

/**
 * Who may do what in a circle's Forum. Every signed-in resident reads it.
 * The circle's members, the Board, and admins start conversations, reply,
 * answer its polls, approve held messages, and delete any message (authors
 * edit and delete their own). Community is everyone and has no group email.
 */
export async function groupContext(circleId: string) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  if (isCommunity(circleId))
    return { error: problem("Community conversations are in the Forum", 404) };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const member = ctx.actor.admin || canManageCircle(ctx.directory, circleId, ctx.personId);
  return {
    ...ctx,
    circle,
    canPost: member,
    canModerate: member,
    address: groupAddress(circle, mailDomain()),
  };
}

export function groupProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
    case "unknown_parent":
      return problem("That conversation or message no longer exists", 404);
    case "forbidden":
      return problem("You can't change that message", 403);
    case "full":
      return problem("This conversation is full; start a new one", 409);
  }
}

/**
 * After a message is saved: email it to the circle's members and push it to
 * those who use notifications (never twice by email). Both never throw.
 */
export async function shareGroupPost(
  circle: Circle,
  thread: GroupThread,
  post: GroupPost,
  opening: GroupPost | null,
  options: { exceptUserId: string | null; alreadyAddressed?: Set<string> }
) {
  const memberUsers = await userIdsForPeople(circle.seats.map((seat) => seat.personId));
  const [emailed] = await Promise.all([
    emailGroupPost({ circle, thread, post, opening, alreadyAddressed: options.alreadyAddressed }),
    notify({
      topic: "groups",
      title: `${circle.name}: ${thread.title}`,
      body: `${post.authorName}: ${excerpt(post.body)}`,
      url: `/circles/${circle.id}/forum/${thread.id}`,
      tag: `group-${thread.id}`,
      exceptUserId: options.exceptUserId,
      onlyUserIds: memberUsers,
      skipEmail: true,
    }),
  ]);
  return emailed;
}
