import { isAdmin } from "./admins";
import type { CommunityUser } from "./users";

/**
 * Who is doing something, as the stores see them: their account, the
 * resident they are (null for a legacy name-only account), their name for
 * bylines, and whether they're a site admin. Routes build one with
 * `actorOf(user)` (or take `ctx.actor` from a context helper); a store takes
 * the fields it needs — `Pick<Actor, "userId" | "admin">`, say — so every
 * ownership check reads the same way: `actor.admin || authorId === actor.userId`.
 *
 * What a store writes down about who did something (`createdBy`, `uploadedBy`,
 * `proposer`…) is picked out field by field, never spread from the actor, so
 * `admin` is never stored.
 */
export interface Actor {
  userId: string;
  personId: string | null;
  name: string;
  admin: boolean;
}

export function actorOf(user: Pick<CommunityUser, "id" | "personId" | "name">): Actor {
  return {
    userId: user.id,
    personId: user.personId ?? null,
    name: user.name,
    admin: isAdmin(user),
  };
}
