import { NextRequest, NextResponse } from "next/server";
import { getUser, toPublicUser } from "@/lib/auth/users";
import { createSessionValue, sessionCookieOptions } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const user = await getUser(parsed.data.userId);
  if (!user) {
    return problem("User not found", 404, "Not Found");
  }

  const response = NextResponse.json({ user: toPublicUser(user) });
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set(name, createSessionValue(user.id), options);
  return response;
}
