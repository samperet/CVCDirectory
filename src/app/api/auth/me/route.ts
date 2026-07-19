import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user: user ? toPublicUser(user) : null });
}
