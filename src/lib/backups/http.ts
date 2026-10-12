import { getSessionUser } from "@/lib/auth/session";
import { actorOf, type Actor } from "@/lib/auth/actor";
import { problem } from "@/lib/http";

/**
 * Route helpers for backups: any signed-in resident may see the backups and
 * sign up for them (an account with no resident can't sign up — there's no
 * address to send to); only admins make one on demand.
 */

export type BackupContext = { actor: Actor & { personId: string } };

export async function backupContext() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  const actor = actorOf(user);
  if (!actor.personId) return { error: problem("Only residents can sign up for backups", 403) };
  return { actor: { ...actor, personId: actor.personId } } satisfies BackupContext;
}

/** Who a subscriber is, as the store keeps them. */
export const personOf = (ctx: BackupContext) => ({
  personId: ctx.actor.personId,
  name: ctx.actor.name,
});
