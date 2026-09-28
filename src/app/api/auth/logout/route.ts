import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth/session";
import { VIEW_AS_COOKIE } from "@/lib/auth/secret";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
  response.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
