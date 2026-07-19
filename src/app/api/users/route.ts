import { NextRequest, NextResponse } from "next/server";
import { createUser, listUsers, toPublicUser } from "@/lib/auth/users";
import { createSessionValue, sessionCookieOptions } from "@/lib/auth/session";
import { createUserSchema } from "@/lib/auth/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const parsed = createUserSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const { user, conflict } = await createUser(parsed.data.name);
  if (conflict || !user) {
    return problem("That name is already taken — select it from the list instead", 409, "Conflict");
  }

  const response = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set(name, createSessionValue(user.id), options);
  return response;
}
