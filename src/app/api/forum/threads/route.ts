import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createThread, listThreads, threadInputSchema } from "@/lib/forum/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ threads: await listThreads() });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`forum:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to start a discussion", 401, "Unauthorized");
  }

  const parsed = threadInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const doc = await createThread({ id: user.id, name: user.name }, parsed.data);
  return NextResponse.json(doc, { status: 201 });
}
