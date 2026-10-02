import { isAdmin } from "@/lib/auth/admins";
import { BOARD_ID } from "@/lib/circles/store";
import { holdsSeat } from "@/lib/circles/icons";
import type { DirectoryDocument } from "./types";

/**
 * Who manages the directory — adds, edits, and removes people: admins, and
 * whoever holds the Secretary seat on the Board (so it follows the role as
 * the Board changes).
 */
export function canManageDirectory(
  user: { personId?: string | null },
  directory: DirectoryDocument
) {
  if (isAdmin(user)) return true;
  return !!user.personId && holdsSeat(directory, BOARD_ID, user.personId, /secretary/i);
}
