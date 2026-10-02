import { isAdmin } from "@/lib/auth/admins";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import type { DirectoryDocument } from "@/lib/directory/types";
import { problem } from "@/lib/http";
import { sitsOnBoard } from "@/lib/circles/ids";

/** Homes for sale are managed by admins and the Board. */
export function canManageHomes(user: { personId?: string | null }, directory: DirectoryDocument | null) {
  if (isAdmin(user)) return true;
  return sitsOnBoard(directory?.circles ?? [], user.personId);
}

/** The signed-in admin or Board member, or the response refusing everyone else. */
export async function homesManager() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) } as const;
  if (!canManageHomes(user, await readDirectory())) return { error: problem("Only admins and the Board can manage homes for sale", 403) } as const;
  return { user } as const;
}
