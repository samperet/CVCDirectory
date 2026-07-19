import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
  return response;
}
