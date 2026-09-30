import { isAdmin } from "@/lib/auth/admins";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import type { DirectoryDocument } from "@/lib/directory/types";
import { problem } from "@/lib/http";

/** Homes for sale are managed by admins and the Board. */
export function canManageHomes(user: { personId?: string | null }, directory: DirectoryDocument | null) {
  if (isAdmin(user)) return true;
  const board = directory?.circles.find((circle) => circle.id === "board");
  return !!user.personId && !!board?.seats.some((seat) => seat.personId === user.personId);
}

/** The signed-in admin or Board member, or the response refusing everyone else. */
export async function homesManager() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401, "Unauthorized") } as const;
  if (!canManageHomes(user, await readDirectory())) return { error: problem("Only admins and the Board can manage homes for sale", 403, "Forbidden") } as const;
  return { user } as const;
}
