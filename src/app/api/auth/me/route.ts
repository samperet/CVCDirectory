import { NextResponse } from "next/server";
import { getSessionUser, getViewAs } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth/users";
import { readProfiles } from "@/lib/profiles/store";
import { isAdmin } from "@/lib/auth/admins";
import { canManageDirectory } from "@/lib/directory/access";
import { readDirectory } from "@/lib/directory/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewAs = await getViewAs();
  const user = viewAs?.user ?? (await getSessionUser());
  if (!user) return NextResponse.json({ user: null, viewAs: null });
  const [profiles, directory] = await Promise.all([readProfiles(), readDirectory()]);
  const photo = user.personId ? profiles[user.personId]?.photo : null;
  const photoUrl = photo && user.personId ? `/api/profiles/${user.personId}/photo?v=${encodeURIComponent(photo.updatedAt)}` : null;
  return NextResponse.json({
    user: { ...toPublicUser(user), photoUrl, isAdmin: isAdmin(user), canManageDirectory: directory ? canManageDirectory(user, directory) : false },
    // While an admin views as this resident: who is really signed in.
    viewAs: viewAs ? { by: viewAs.admin.name } : null,
  });
}
