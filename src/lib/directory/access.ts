import { isAdmin } from "@/lib/auth/admins";
import { BOARD_ID } from "@/lib/circles/store";
import type { DirectoryDocument } from "./types";

/**
 * Who manages the directory — adds, edits, and removes people: admins, and
 * whoever holds the Secretary seat on the Board (so it follows the role as
 * the Board changes).
 */
export function canManageDirectory(user: { personId?: string | null }, directory: DirectoryDocument) {
  if (isAdmin(user)) return true;
  if (!user.personId) return false;
  const board = directory.circles.find((circle) => circle.id === BOARD_ID);
  return !!board?.seats.some((seat) => seat.personId === user.personId && /secretary/i.test(seat.position ?? ""));
}
