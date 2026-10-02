import { isAdmin } from "@/lib/auth/admins";
import type { DirectoryDocument } from "@/lib/directory/types";
import { canManageCircle } from "./icons";

/**
 * Who records a circle's consent — to a written page or an uploaded file —
 * and withdraws it: anyone in that circle, anyone on the Board (for any
 * circle), and admins. The Community circle has no members, so the Board
 * records its consent.
 */
export function canRecordConsent(
  user: { personId?: string | null },
  directory: DirectoryDocument,
  circleId: string
) {
  if (isAdmin(user)) return true;
  return !!user.personId && canManageCircle(directory, circleId, user.personId);
}
