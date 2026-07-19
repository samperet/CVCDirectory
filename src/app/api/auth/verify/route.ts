import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/users";
import { createSessionValue, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const origin = process.env.APP_URL ?? request.nextUrl.origin;

  const user = token ? await verifyToken(token) : null;
  if (!user) {
    return NextResponse.redirect(`${origin}/?verification=failed`);
  }

  // A clicked magic link both verifies the account and signs the member in.
  const response = NextResponse.redirect(`${origin}/?verification=success`);
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set(name, createSessionValue(user.id), options);
  return response;
}
