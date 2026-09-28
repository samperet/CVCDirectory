import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth/users";
import { readProfiles } from "@/lib/profiles/store";
import { isAdmin } from "@/lib/auth/admins";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  const photo = user.personId ? (await readProfiles())[user.personId]?.photo : null;
  const photoUrl = photo && user.personId ? `/api/profiles/${user.personId}/photo?v=${encodeURIComponent(photo.updatedAt)}` : null;
  return NextResponse.json({ user: { ...toPublicUser(user), photoUrl, isAdmin: isAdmin(user) } });
}
