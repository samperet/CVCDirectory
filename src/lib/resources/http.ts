import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { problem } from "@/lib/http";
import type { Actor, Result } from "./store";

/** The signed-in resident as a resources actor, or an error response. */
export async function resourceActor(): Promise<{ actor: Actor } | { error: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  return {
    actor: {
      userId: user.id,
      personId: user.personId ?? null,
      name: user.name,
      admin: isAdmin(user),
    },
  };
}

/** Answer with the changed recommendation, or the matching problem. */
export function resourceResponse<T>(result: Result<T>, status = 200) {
  if (result.ok) return NextResponse.json({ recommendation: result.value }, { status });
  switch (result.reason) {
    case "not_found":
      return problem("That recommendation or comment no longer exists", 404);
    case "forbidden":
      return problem("You can only change your own posts", 403);
    case "full":
      return problem("There's no room for more here", 409);
  }
}
