import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canManageCircle } from "@/lib/circles/icons";
import { isCommunity } from "@/lib/circles/ids";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify, excerpt } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import type { Circle } from "@/lib/circles/types";
import type { GroupPost, GroupThread } from "./shared";
import type { Failure } from "./store";

/**
 * Who may do what in a circle's Forum. Every signed-in resident reads it.
 * The circle's members, the Board, and admins start conversations, reply,
 * answer its polls, and delete any message (authors edit and delete their
 * own). Community's conversations are in the community Forum instead.
 */
export async function groupContext(circleId: string) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  if (isCommunity(circleId))
    return { error: problem("Community conversations are in the Forum", 404) };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const member = ctx.actor.admin || canManageCircle(ctx.directory, circleId, ctx.personId);
  return { ...ctx, circle, canPost: member, canModerate: member };
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
 * After a message is saved: an app notification to the circle's members
 * (the "groups" topic, push only — never emailed). Never throws.
 */
export async function shareGroupPost(
  circle: Circle,
  thread: GroupThread,
  post: GroupPost,
  options: { exceptUserId: string | null }
) {
  const memberUsers = await userIdsForPeople(circle.seats.map((seat) => seat.personId));
  await notify({
    topic: "groups",
    title: `${circle.name}: ${thread.title}`,
    body: `${post.authorName}: ${excerpt(post.body)}`,
    url: `/circles/${circle.id}/forum/${thread.id}`,
    tag: `group-${thread.id}`,
    exceptUserId: options.exceptUserId,
    onlyUserIds: memberUsers,
    skipEmail: true,
  });
}
