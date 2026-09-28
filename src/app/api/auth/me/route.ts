import { NextResponse } from "next/server";
import { getSessionUser, getViewAs } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth/users";
import { readProfiles } from "@/lib/profiles/store";
import { isAdmin } from "@/lib/auth/admins";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewAs = await getViewAs();
  const user = viewAs?.user ?? (await getSessionUser());
  if (!user) return NextResponse.json({ user: null, viewAs: null });
  const photo = user.personId ? (await readProfiles())[user.personId]?.photo : null;
  const photoUrl = photo && user.personId ? `/api/profiles/${user.personId}/photo?v=${encodeURIComponent(photo.updatedAt)}` : null;
  return NextResponse.json({
    user: { ...toPublicUser(user), photoUrl, isAdmin: isAdmin(user) },
    // While an admin views as this resident: who is really signed in.
    viewAs: viewAs ? { by: viewAs.admin.name } : null,
  });
}
