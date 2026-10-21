import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { dropKey } from "@/lib/mcp/store";
import { notFound, problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Take one of your keys away: the assistant holding it is shut out at once. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to continue", 401);
  if (!(await dropKey(user.personId, params.id))) return notFound("Key");
  return NextResponse.json({ ok: true });
}
