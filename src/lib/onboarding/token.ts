import { createHmac, timingSafeEqual } from "crypto";
import { authSecret } from "@/lib/auth/secret";

/**
 * The token in a new member's welcome link (`/join/<token>`): the
 * invitation's id, signed with the app's secret, so a link can't be made up
 * or pointed at someone else's invitation. Removing the invitation, or its
 * link expiring (`linkExpired`), is what stops a link working.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sign = (id: string) =>
  createHmac("sha256", `onboarding-invitation:${authSecret()}`).update(id).digest("base64url");

export const invitationToken = (id: string) => `${id}.${sign(id)}`;

/** The invitation id a token names, or null if it isn't one we signed. */
export function readInvitationToken(token: string): string | null {
  const [id, signature, ...rest] = token.split(".");
  if (rest.length || !id || !signature || !UUID.test(id)) return null;
  const expected = new Uint8Array(Buffer.from(sign(id)));
  const given = new Uint8Array(Buffer.from(signature));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id;
}
