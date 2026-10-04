import { actorOf } from "@/lib/auth/actor";
import { isAdmin } from "@/lib/auth/admins";
import { getSessionUser } from "@/lib/auth/session";
import { problem } from "@/lib/http";
import type { Failure } from "./store";

/** Any resident sends a report; only admins read and change them. */
export async function feedbackContext({ admin = false } = {}) {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  if (admin && !isAdmin(user))
    return { error: problem("Only admins can read bug reports and requests", 403) };
  return { user, actor: actorOf(user) };
}

export function feedbackProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That report no longer exists", 404);
    case "full":
      return problem("There are too many open reports; an admin needs to clear some", 409);
  }
}
