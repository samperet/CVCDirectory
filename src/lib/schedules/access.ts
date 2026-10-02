import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle } from "@/lib/circles/icons";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { DutySchedule } from "./rotation";

/**
 * Who may change a circle's duty schedule. Setting up the rotation is for the
 * circle's members, the Board, and admins; recording a swap or cover for a
 * day is also open to anyone in one of the rotation's households.
 */
export function scheduleAccess(
  user: { personId?: string | null },
  directory: DirectoryDocument,
  circleId: string,
  schedule: DutySchedule | null
) {
  const personId = user.personId ?? null;
  const canEdit = isAdmin(user) || (!!personId && canManageCircle(directory, circleId, personId));
  const inRotation =
    !!personId &&
    !!schedule?.households.some((household) =>
      household.members.some((member) => member.personId === personId)
    );
  return { canEdit, canChangeDays: canEdit || inRotation };
}
