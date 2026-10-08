import type { Actor } from "@/lib/auth/actor";
import { canManageCircle } from "@/lib/circles/icons";
import { isCommunity } from "@/lib/circles/ids";
import type { FinanceViewers } from "@/lib/circles/layout";
import type { Circle } from "@/lib/circles/types";
import type { DirectoryDocument } from "@/lib/directory/types";

/**
 * Who may see and change a circle's finances. Its members, the Board, and
 * admins keep them: add, change and delete expenses, set budgets, mark
 * what's been paid back. That's never everyone — on the Community circle,
 * which has no members, it's the Board and admins. Who can see them is the
 * Finances module's setting: everyone at CVC, or only those who keep them.
 */

/** Whether someone keeps the circle's finances: its members, the Board, admins. */
export function canEditFinances(
  viewer: Pick<Actor, "personId" | "admin">,
  directory: DirectoryDocument,
  circleId: string
) {
  return (
    viewer.admin || (!!viewer.personId && canManageCircle(directory, circleId, viewer.personId))
  );
}

/** Whether someone can see the circle's finances: anyone, unless the module keeps them to those who keep them. */
export const canSeeFinances = (view: FinanceViewers, canEdit: boolean) =>
  view === "everyone" || canEdit;

/** What someone who can't see a circle's finances is told instead. */
export const hiddenFinances = (circle: Pick<Circle, "id" | "name">) =>
  isCommunity(circle.id)
    ? "Only the Board can see Community's finances."
    : `Only ${circle.name}'s members and the Board can see its finances.`;
