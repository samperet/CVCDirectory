import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { addReply, replyInputSchema } from "@/lib/forum/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(`forum:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in to reply", 401, "Unauthorized");
  }

  const parsed = replyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const result = await addReply(params.id, { id: user.id, name: user.name }, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") return problem("Discussion not found", 404, "Not Found");
    if (result.reason === "unknown_parent") return problem("The reply you're responding to no longer exists");
    return problem("This discussion has reached its reply limit", 409, "Conflict");
  }
  return NextResponse.json(result.doc, { status: 201 });
}
