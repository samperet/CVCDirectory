import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { addAppreciation, appreciationInputSchema, listAppreciations } from "@/lib/appreciations/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 50;
  return NextResponse.json({ items: await listAppreciations(limit) });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`appreciation:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to share an appreciation", 401, "Unauthorized");
  }

  const parsed = appreciationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const appreciation = await addAppreciation({ id: user.id, name: user.name }, parsed.data);
  return NextResponse.json({ appreciation }, { status: 201 });
}
