import { getSessionUser, getViewAs } from "@/lib/auth/session";
import { toPublicUser, type PublicUser } from "@/lib/auth/users";
import { readProfiles } from "@/lib/profiles/store";
import { isAdmin } from "@/lib/auth/admins";
import { canManageDirectory } from "@/lib/directory/access";
import { readDirectory } from "@/lib/directory/store";

export interface SessionPayload {
  user: (PublicUser & { photoUrl: string | null; isAdmin: boolean; canManageDirectory: boolean }) | null;
  /** While an admin views as this resident: who is really signed in. */
  viewAs: { by: string } | null;
}

/**
 * Who's signed in, as the browser sees it: served by /api/auth/me, and put
 * into the page on its first load so the app renders the right layout
 * straight away instead of waiting to ask.
 */
export async function sessionPayload(): Promise<SessionPayload> {
  const viewAs = await getViewAs();
  const user = viewAs?.user ?? (await getSessionUser());
  if (!user) return { user: null, viewAs: null };
  const [profiles, directory] = await Promise.all([readProfiles(), readDirectory()]);
  const photo = user.personId ? profiles[user.personId]?.photo : null;
  const photoUrl = photo && user.personId ? `/api/profiles/${user.personId}/photo?v=${encodeURIComponent(photo.updatedAt)}` : null;
  return {
    user: { ...toPublicUser(user), photoUrl, isAdmin: isAdmin(user), canManageDirectory: directory ? canManageDirectory(user, directory) : false },
    viewAs: viewAs ? { by: viewAs.admin.name } : null,
  };
}
